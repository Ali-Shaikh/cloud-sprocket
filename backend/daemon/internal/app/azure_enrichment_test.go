package app

import (
	"context"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"

	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/discovery"
	"cloudsprocket/backend/daemon/internal/models"
	"cloudsprocket/backend/daemon/internal/store"
)

type countingAzureInventory struct {
	stubAzureInventory
	detectSchemaCalls atomic.Int32
	getPolicyCalls    atomic.Int32
	listBlobsCalls    atomic.Int32
	listVMCalls       atomic.Int32
	lastVMResourceGroup string
	peekQueueCalls    atomic.Int32
}

func (c *countingAzureInventory) ListVirtualMachines(_ context.Context, _ models.ProfileSummary, resourceGroup string) ([]models.AzureVirtualMachine, error) {
	c.listVMCalls.Add(1)
	c.lastVMResourceGroup = resourceGroup
	return c.stubAzureInventory.ListVirtualMachines(context.Background(), models.ProfileSummary{}, resourceGroup)
}

func (c *countingAzureInventory) DetectWafLogSchema(context.Context, models.ProfileSummary, string, string) (models.AzureWafLogSchemaProfile, error) {
	c.detectSchemaCalls.Add(1)
	return c.stubAzureInventory.DetectWafLogSchema(context.Background(), models.ProfileSummary{}, "", "")
}

func (c *countingAzureInventory) GetWafPolicy(context.Context, models.ProfileSummary, string, string) (models.AzureWafPolicyDetail, error) {
	c.getPolicyCalls.Add(1)
	return c.stubAzureInventory.GetWafPolicy(context.Background(), models.ProfileSummary{}, "", "")
}

func (c *countingAzureInventory) ListBlobs(context.Context, models.ProfileSummary, string, string, string) ([]models.AzureBlob, error) {
	c.listBlobsCalls.Add(1)
	return c.stubAzureInventory.ListBlobs(context.Background(), models.ProfileSummary{}, "", "", "")
}

func (c *countingAzureInventory) PeekQueueMessages(context.Context, models.ProfileSummary, string, string) ([]models.AzureQueueMessage, error) {
	c.peekQueueCalls.Add(1)
	return c.stubAzureInventory.PeekQueueMessages(context.Background(), models.ProfileSummary{}, "", "")
}

func TestWorkspaceGetSkipsHeavyAzureDrillDown(t *testing.T) {
	tempDir := t.TempDir()
	home := filepath.Join(tempDir, "home")
	mustWriteFile(
		t,
		filepath.Join(home, ".azure", "azureProfile.json"),
		`{"subscriptions":[{"id":"sub-001","name":"Marketing","tenantId":"tenant-123","user":{"name":"ali@example.com"}}]}`,
	)

	settings := config.FromEnv(map[string]string{}, "linux", home)
	if err := settings.EnsureRuntimeDirs(); err != nil {
		t.Fatalf("EnsureRuntimeDirs: %v", err)
	}

	dataStore, err := store.Open(settings.DatabasePath)
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	defer dataStore.Close()

	azure := &countingAzureInventory{}
	service := New(
		settings,
		dataStore,
		discovery.New(settings, func(command string) (string, error) {
			if command == "az" {
				return "/usr/bin/az", nil
			}
			return "", nil
		}),
		&stubS3Inventory{},
		&stubEC2Inventory{},
		stubLambdaInventory{},
		stubDynamoDBInventory{},
		stubSQSInventory{},
		stubSNSInventory{},
		stubRDSInventory{},
		stubLogsInventory{},
		stubIAMInventory{},
		azure,
		stubDockerRuntime{},
	)

	ctx := context.Background()
	for _, step := range []struct {
		method string
		params []byte
	}{
		{"session.selectProvider", []byte(`{"providerId":"azure"}`)},
		{"session.selectProfile", []byte(`{"providerId":"azure","profileId":"sub-001"}`)},
		{"session.selectAuthMethod", []byte(`{"authMethod":"cli"}`)},
		{"session.lock", nil},
	} {
		if _, err := service.Handle(ctx, step.method, step.params, nil); err != nil {
			t.Fatalf("%s: %v", step.method, err)
		}
	}

	result, err := service.Handle(ctx, "workspace.get", nil, nil)
	if err != nil {
		t.Fatalf("workspace.get: %v", err)
	}
	workspace, ok := result.(models.WorkspaceSnapshot)
	if !ok {
		t.Fatalf("expected WorkspaceSnapshot, got %T", result)
	}
	if len(workspace.AzureWafPolicies) == 0 {
		t.Fatal("expected WAF policy list on lightweight workspace.get")
	}
	if workspace.AzureWafPolicyDetail != nil {
		t.Fatal("lightweight workspace.get should not load WAF policy detail")
	}
	if workspace.AzureWafLogSchema != nil {
		t.Fatal("lightweight workspace.get should not probe WAF log schema")
	}
	if azure.detectSchemaCalls.Load() != 0 {
		t.Fatalf("DetectWafLogSchema calls = %d, want 0", azure.detectSchemaCalls.Load())
	}
	if azure.getPolicyCalls.Load() != 0 {
		t.Fatalf("GetWafPolicy calls = %d, want 0", azure.getPolicyCalls.Load())
	}
	if azure.listBlobsCalls.Load() != 0 {
		t.Fatalf("ListBlobs calls = %d, want 0", azure.listBlobsCalls.Load())
	}
	if azure.peekQueueCalls.Load() != 0 {
		t.Fatalf("PeekQueueMessages calls = %d, want 0", azure.peekQueueCalls.Load())
	}
}

func TestSelectResourceGroupRefreshesVirtualMachinesOnly(t *testing.T) {
	tempDir := t.TempDir()
	home := filepath.Join(tempDir, "home")
	mustWriteFile(
		t,
		filepath.Join(home, ".azure", "azureProfile.json"),
		`{"subscriptions":[{"id":"sub-001","name":"Marketing","tenantId":"tenant-123","user":{"name":"ali@example.com"}}]}`,
	)

	settings := config.FromEnv(map[string]string{}, "linux", home)
	if err := settings.EnsureRuntimeDirs(); err != nil {
		t.Fatalf("EnsureRuntimeDirs: %v", err)
	}

	dataStore, err := store.Open(settings.DatabasePath)
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	defer dataStore.Close()

	azure := &countingAzureInventory{
		stubAzureInventory: stubAzureInventory{
			resourceGroups: []models.AzureResourceGroup{
				{Name: "rg-primary", Location: "westeurope"},
				{Name: "rg-secondary", Location: "westeurope"},
			},
			virtualMachines: map[string][]models.AzureVirtualMachine{
				"rg-secondary": {
					{
						VMID:          "/subscriptions/sub-001/resourceGroups/rg-secondary/providers/Microsoft.Compute/virtualMachines/vm-2",
						Name:          "vm-2",
						ResourceGroup: "rg-secondary",
						PowerState:    "VM running",
					},
				},
			},
		},
	}
	service := New(
		settings,
		dataStore,
		discovery.New(settings, func(command string) (string, error) {
			if command == "az" {
				return "/usr/bin/az", nil
			}
			return "", nil
		}),
		&stubS3Inventory{},
		&stubEC2Inventory{},
		stubLambdaInventory{},
		stubDynamoDBInventory{},
		stubSQSInventory{},
		stubSNSInventory{},
		stubRDSInventory{},
		stubLogsInventory{},
		stubIAMInventory{},
		azure,
		stubDockerRuntime{},
	)

	ctx := context.Background()
	for _, step := range []struct {
		method string
		params []byte
	}{
		{"session.selectProvider", []byte(`{"providerId":"azure"}`)},
		{"session.selectProfile", []byte(`{"providerId":"azure","profileId":"sub-001"}`)},
		{"session.selectAuthMethod", []byte(`{"authMethod":"cli"}`)},
		{"session.lock", nil},
	} {
		if _, err := service.Handle(ctx, step.method, step.params, nil); err != nil {
			t.Fatalf("%s: %v", step.method, err)
		}
	}

	result, err := service.Handle(ctx, "azure.selectResourceGroup", []byte(`{"resourceGroup":"rg-secondary"}`), nil)
	if err != nil {
		t.Fatalf("azure.selectResourceGroup: %v", err)
	}
	workspace, ok := result.(models.WorkspaceSnapshot)
	if !ok {
		t.Fatalf("expected WorkspaceSnapshot, got %T", result)
	}
	if workspace.SelectedAzureResourceGroup != "rg-secondary" {
		t.Fatalf("selected resource group = %q, want rg-secondary", workspace.SelectedAzureResourceGroup)
	}
	if len(workspace.AzureVirtualMachines) == 0 {
		t.Fatal("expected virtual machines for selected resource group")
	}
	if azure.listVMCalls.Load() == 0 {
		t.Fatal("expected ListVirtualMachines to run for resource group selection")
	}
	if azure.lastVMResourceGroup != "rg-secondary" {
		t.Fatalf("ListVirtualMachines resource group = %q, want rg-secondary", azure.lastVMResourceGroup)
	}
	if azure.detectSchemaCalls.Load() != 0 {
		t.Fatalf("DetectWafLogSchema calls = %d, want 0", azure.detectSchemaCalls.Load())
	}
	if azure.listBlobsCalls.Load() != 0 {
		t.Fatalf("ListBlobs calls = %d, want 0", azure.listBlobsCalls.Load())
	}
}

func TestSetWriteModeSkipsHeavyAzureDrillDown(t *testing.T) {
	tempDir := t.TempDir()
	home := filepath.Join(tempDir, "home")
	mustWriteFile(
		t,
		filepath.Join(home, ".azure", "azureProfile.json"),
		`{"subscriptions":[{"id":"sub-001","name":"Marketing","tenantId":"tenant-123","user":{"name":"ali@example.com"}}]}`,
	)

	settings := config.FromEnv(map[string]string{}, "linux", home)
	if err := settings.EnsureRuntimeDirs(); err != nil {
		t.Fatalf("EnsureRuntimeDirs: %v", err)
	}

	dataStore, err := store.Open(settings.DatabasePath)
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	defer dataStore.Close()

	azure := &countingAzureInventory{}
	service := New(
		settings,
		dataStore,
		discovery.New(settings, func(command string) (string, error) {
			if command == "az" {
				return "/usr/bin/az", nil
			}
			return "", nil
		}),
		&stubS3Inventory{},
		&stubEC2Inventory{},
		stubLambdaInventory{},
		stubDynamoDBInventory{},
		stubSQSInventory{},
		stubSNSInventory{},
		stubRDSInventory{},
		stubLogsInventory{},
		stubIAMInventory{},
		azure,
		stubDockerRuntime{},
	)

	ctx := context.Background()
	for _, step := range []struct {
		method string
		params []byte
	}{
		{"session.selectProvider", []byte(`{"providerId":"azure"}`)},
		{"session.selectProfile", []byte(`{"providerId":"azure","profileId":"sub-001"}`)},
		{"session.selectAuthMethod", []byte(`{"authMethod":"cli"}`)},
		{"session.lock", nil},
	} {
		if _, err := service.Handle(ctx, step.method, step.params, nil); err != nil {
			t.Fatalf("%s: %v", step.method, err)
		}
	}

	result, err := service.Handle(ctx, "session.setWriteMode", []byte(`{"enabled":true}`), nil)
	if err != nil {
		t.Fatalf("session.setWriteMode: %v", err)
	}
	workspace, ok := result.(models.WorkspaceSnapshot)
	if !ok {
		t.Fatalf("expected WorkspaceSnapshot, got %T", result)
	}
	if !workspace.AzureWriteModeEnabled {
		t.Fatal("expected AzureWriteModeEnabled after enabling write mode")
	}
	if !workspace.AzureWritesEnabled {
		t.Fatal("expected AzureWritesEnabled after enabling write mode")
	}
	if workspace.AzureWafPolicyDetail != nil {
		t.Fatal("setWriteMode should not load WAF policy detail")
	}
	if workspace.AzureWafLogSchema != nil {
		t.Fatal("setWriteMode should not probe WAF log schema")
	}
	if azure.detectSchemaCalls.Load() != 0 {
		t.Fatalf("DetectWafLogSchema calls = %d, want 0", azure.detectSchemaCalls.Load())
	}
	if azure.getPolicyCalls.Load() != 0 {
		t.Fatalf("GetWafPolicy calls = %d, want 0", azure.getPolicyCalls.Load())
	}
}

type delayedAzureInventory struct {
	stubAzureInventory
	delay time.Duration
}

func (d delayedAzureInventory) sleep() {
	if d.delay > 0 {
		time.Sleep(d.delay)
	}
}

func (d delayedAzureInventory) ListResourceGroups(ctx context.Context, profile models.ProfileSummary) ([]models.AzureResourceGroup, error) {
	d.sleep()
	return d.stubAzureInventory.ListResourceGroups(ctx, profile)
}

func (d delayedAzureInventory) ListStorageAccounts(ctx context.Context, profile models.ProfileSummary) ([]models.AzureStorageAccount, error) {
	d.sleep()
	return d.stubAzureInventory.ListStorageAccounts(ctx, profile)
}

func (d delayedAzureInventory) ListLogAnalyticsWorkspaces(ctx context.Context, profile models.ProfileSummary) ([]models.AzureLogAnalyticsWorkspace, error) {
	d.sleep()
	return d.stubAzureInventory.ListLogAnalyticsWorkspaces(ctx, profile)
}

func (d delayedAzureInventory) ListFunctionApps(ctx context.Context, profile models.ProfileSummary) ([]models.AzureFunctionApp, error) {
	d.sleep()
	return d.stubAzureInventory.ListFunctionApps(ctx, profile)
}

func (d delayedAzureInventory) ListKeyVaults(ctx context.Context, profile models.ProfileSummary) ([]models.AzureKeyVault, error) {
	d.sleep()
	return d.stubAzureInventory.ListKeyVaults(ctx, profile)
}

func (d delayedAzureInventory) ListCosmosAccounts(ctx context.Context, profile models.ProfileSummary) ([]models.AzureCosmosAccount, error) {
	d.sleep()
	return d.stubAzureInventory.ListCosmosAccounts(ctx, profile)
}

func (d delayedAzureInventory) ListEntraUsers(ctx context.Context, profile models.ProfileSummary) ([]models.AzureEntraUser, error) {
	d.sleep()
	return d.stubAzureInventory.ListEntraUsers(ctx, profile)
}

func (d delayedAzureInventory) ListEntraGroups(ctx context.Context, profile models.ProfileSummary) ([]models.AzureEntraGroup, error) {
	d.sleep()
	return d.stubAzureInventory.ListEntraGroups(ctx, profile)
}

func (d delayedAzureInventory) ListEntraAppRegistrations(ctx context.Context, profile models.ProfileSummary) ([]models.AzureEntraApp, error) {
	d.sleep()
	return d.stubAzureInventory.ListEntraAppRegistrations(ctx, profile)
}

func TestAzurePhaseOneEnrichmentRunsInParallel(t *testing.T) {
	dataStore, err := store.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	defer dataStore.Close()

	workspace := &models.WorkspaceSnapshot{
		Provider: &models.ProviderSummary{ProviderID: "azure"},
		Profile:  &models.ProfileSummary{ProviderID: "azure", ProfileID: "sub-001"},
	}
	session := models.SessionSnapshot{
		CurrentProviderID:  "azure",
		SelectedProfileID:  "sub-001",
		IsLocked:           true,
	}
	service := &Service{
		store: dataStore,
		azure: delayedAzureInventory{
			stubAzureInventory: stubAzureInventory{
				resourceGroups: []models.AzureResourceGroup{{Name: "demo-rg"}},
			},
			delay: 120 * time.Millisecond,
		},
		now: func() time.Time { return time.Now().UTC() },
	}

	start := time.Now()
	service.enrichAzureWorkspace(workspace, session, azureEnrichmentOptions{lightweight: true})
	elapsed := time.Since(start)

	// Seven phase-one enrichers each sleep 120ms. Serial would exceed 700ms.
	if elapsed > 450*time.Millisecond {
		t.Fatalf("phase-one enrichment took %v; expected parallel completion well under 700ms", elapsed)
	}
	if len(workspace.AzureResourceGroups) == 0 {
		t.Fatal("expected resource groups after parallel enrichment")
	}
	if len(workspace.AzureEntraUsers) == 0 {
		t.Fatal("expected Entra users after parallel enrichment")
	}
}