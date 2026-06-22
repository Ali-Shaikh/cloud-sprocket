// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"path/filepath"
	"sync"
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
	detectSchemaCalls       atomic.Int32
	getPolicyCalls          atomic.Int32
	listBlobsCalls          atomic.Int32
	listVMCalls             atomic.Int32
	listResourceGroupsCalls atomic.Int32
	listStorageAccountsCalls atomic.Int32
	lastVMResourceGroup     string
	peekQueueCalls          atomic.Int32
}

func (c *countingAzureInventory) ListResourceGroups(ctx context.Context, profile models.ProfileSummary) ([]models.AzureResourceGroup, error) {
	c.listResourceGroupsCalls.Add(1)
	return c.stubAzureInventory.ListResourceGroups(ctx, profile)
}

func (c *countingAzureInventory) ListStorageAccounts(ctx context.Context, profile models.ProfileSummary) ([]models.AzureStorageAccount, error) {
	c.listStorageAccountsCalls.Add(1)
	return c.stubAzureInventory.ListStorageAccounts(ctx, profile)
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
	session, ok := result.(models.SessionSnapshot)
	if !ok {
		t.Fatalf("expected SessionSnapshot, got %T", result)
	}
	if !session.AzureWriteModeEnabled {
		t.Fatal("expected AzureWriteModeEnabled after enabling write mode")
	}
	if azure.listResourceGroupsCalls.Load() != 0 {
		t.Fatalf("ListResourceGroups calls = %d, want 0", azure.listResourceGroupsCalls.Load())
	}
	if azure.listStorageAccountsCalls.Load() != 0 {
		t.Fatalf("ListStorageAccounts calls = %d, want 0", azure.listStorageAccountsCalls.Load())
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

type parallelismProbeAzureInventory struct {
	stubAzureInventory
	hold time.Duration

	mu            sync.Mutex
	inFlight      int
	maxConcurrent int
}

func (p *parallelismProbeAzureInventory) resetProbe() {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.inFlight = 0
	p.maxConcurrent = 0
}

func (p *parallelismProbeAzureInventory) track() {
	p.mu.Lock()
	p.inFlight++
	if p.inFlight > p.maxConcurrent {
		p.maxConcurrent = p.inFlight
	}
	p.mu.Unlock()

	if p.hold > 0 {
		time.Sleep(p.hold)
	}

	p.mu.Lock()
	p.inFlight--
	p.mu.Unlock()
}

func (p *parallelismProbeAzureInventory) ListResourceGroups(ctx context.Context, profile models.ProfileSummary) ([]models.AzureResourceGroup, error) {
	p.track()
	return p.stubAzureInventory.ListResourceGroups(ctx, profile)
}

func (p *parallelismProbeAzureInventory) ListStorageAccounts(ctx context.Context, profile models.ProfileSummary) ([]models.AzureStorageAccount, error) {
	p.track()
	return p.stubAzureInventory.ListStorageAccounts(ctx, profile)
}

func (p *parallelismProbeAzureInventory) ListLogAnalyticsWorkspaces(ctx context.Context, profile models.ProfileSummary) ([]models.AzureLogAnalyticsWorkspace, error) {
	p.track()
	return p.stubAzureInventory.ListLogAnalyticsWorkspaces(ctx, profile)
}

func (p *parallelismProbeAzureInventory) ListFunctionApps(ctx context.Context, profile models.ProfileSummary) ([]models.AzureFunctionApp, error) {
	p.track()
	return p.stubAzureInventory.ListFunctionApps(ctx, profile)
}

func (p *parallelismProbeAzureInventory) ListKeyVaults(ctx context.Context, profile models.ProfileSummary) ([]models.AzureKeyVault, error) {
	p.track()
	return p.stubAzureInventory.ListKeyVaults(ctx, profile)
}

func (p *parallelismProbeAzureInventory) ListCosmosAccounts(ctx context.Context, profile models.ProfileSummary) ([]models.AzureCosmosAccount, error) {
	p.track()
	return p.stubAzureInventory.ListCosmosAccounts(ctx, profile)
}

func (p *parallelismProbeAzureInventory) ListEntraUsers(ctx context.Context, profile models.ProfileSummary) ([]models.AzureEntraUser, error) {
	p.track()
	return p.stubAzureInventory.ListEntraUsers(ctx, profile)
}

func (p *parallelismProbeAzureInventory) ListEntraGroups(ctx context.Context, profile models.ProfileSummary) ([]models.AzureEntraGroup, error) {
	p.track()
	return p.stubAzureInventory.ListEntraGroups(ctx, profile)
}

func (p *parallelismProbeAzureInventory) ListEntraAppRegistrations(ctx context.Context, profile models.ProfileSummary) ([]models.AzureEntraApp, error) {
	p.track()
	return p.stubAzureInventory.ListEntraAppRegistrations(ctx, profile)
}

func TestAzurePhaseOneEnrichmentRunsInParallel(t *testing.T) {
	dataStore, err := store.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	defer dataStore.Close()

	session := models.SessionSnapshot{
		CurrentProviderID: "azure",
		SelectedProfileID: "sub-001",
		IsLocked:          true,
	}
	probe := &parallelismProbeAzureInventory{
		stubAzureInventory: stubAzureInventory{
			resourceGroups: []models.AzureResourceGroup{{Name: "demo-rg"}},
		},
		hold: 40 * time.Millisecond,
	}
	service := &Service{
		store: dataStore,
		azure: probe,
		now:   func() time.Time { return time.Now().UTC() },
	}

	newWorkspace := func() *models.WorkspaceSnapshot {
		return &models.WorkspaceSnapshot{
			Provider: &models.ProviderSummary{ProviderID: "azure"},
			Profile:  &models.ProfileSummary{ProviderID: "azure", ProfileID: "sub-001"},
		}
	}

	probe.resetProbe()
	serialWorkspace := newWorkspace()
	service.enrichAzureWorkspace(serialWorkspace, session, azureEnrichmentOptions{
		lightweight:    true,
		serialPhaseOne: true,
	})
	serialOverlap := probe.maxConcurrent

	probe.resetProbe()
	parallelWorkspace := newWorkspace()
	service.enrichAzureWorkspace(parallelWorkspace, session, azureEnrichmentOptions{lightweight: true})
	parallelOverlap := probe.maxConcurrent

	// Entra enrichment fans out to three internal calls even in serial phase one, so
	// compare overlap counts instead of wall-clock timings (flaky on Windows CI).
	const entraInternalParallelism = 3
	if serialOverlap < 1 || serialOverlap > entraInternalParallelism {
		t.Fatalf("unexpected serial overlap %d; want 1..%d", serialOverlap, entraInternalParallelism)
	}
	if parallelOverlap <= serialOverlap {
		t.Fatalf(
			"parallel enrichment overlap %d did not exceed serial overlap %d",
			parallelOverlap,
			serialOverlap,
		)
	}
	if len(parallelWorkspace.AzureResourceGroups) == 0 {
		t.Fatal("expected resource groups after parallel enrichment")
	}
	if len(parallelWorkspace.AzureEntraUsers) == 0 {
		t.Fatal("expected Entra users after parallel enrichment")
	}
}