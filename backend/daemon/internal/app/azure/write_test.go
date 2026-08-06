// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package azure

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"cloudsprocket/backend/daemon/internal/discovery"
	"cloudsprocket/backend/daemon/internal/models"
)

type fakeInvalidator struct {
	scopes []string
	hashes []string
}

func (f *fakeInvalidator) InvalidateRuntimeStatus()                      {}
func (f *fakeInvalidator) InvalidateAzureCLIExtensionCache()             {}
func (f *fakeInvalidator) InvalidateCloudResourceCaches(context.Context) {}
func (f *fakeInvalidator) InvalidateResourceCache(_ context.Context, scope, hash string) {
	f.scopes = append(f.scopes, scope)
	f.hashes = append(f.hashes, hash)
}
func (f *fakeInvalidator) InvalidateResourceCacheScope(_ context.Context, scope string) {
	f.scopes = append(f.scopes, scope)
}

func azureWriteSnapshot() discovery.Snapshot {
	return discovery.Snapshot{
		Profiles: []models.ProfileSummary{{
			ProfileID:   "p1",
			ProviderID:  "azure",
			DisplayName: "Demo",
		}},
		Providers: []models.ProviderSummary{{
			ProviderID:  "azure",
			CommandPath: "/usr/bin/az",
		}},
	}
}

func lockedAzureWriteSession() models.SessionSnapshot {
	return models.SessionSnapshot{
		IsLocked:              true,
		CurrentProviderID:     "azure",
		SelectedProfileID:     "p1",
		AzureWriteModeEnabled: true,
	}
}

type fakeStorage struct {
	deleted  bool
	created  bool
	blobName string
}

func (f *fakeStorage) ListStorageAccounts(context.Context, models.ProfileSummary) ([]models.AzureStorageAccount, error) {
	return []models.AzureStorageAccount{{Name: "acct"}}, nil
}
func (f *fakeStorage) ListBlobContainers(context.Context, models.ProfileSummary, string) ([]models.AzureBlobContainer, error) {
	return []models.AzureBlobContainer{{Name: "c1"}}, nil
}
func (f *fakeStorage) CreateStorageAccount(context.Context, models.ProfileSummary, string, string, string) (models.AzureStorageAccount, error) {
	f.created = true
	return models.AzureStorageAccount{Name: "newacct"}, nil
}
func (f *fakeStorage) CreateBlobContainer(context.Context, models.ProfileSummary, string, string) error {
	return nil
}
func (f *fakeStorage) UploadBlob(context.Context, models.ProfileSummary, string, string, string, string) (models.AzureBlobUploadResult, error) {
	return models.AzureBlobUploadResult{}, nil
}
func (f *fakeStorage) DeleteBlob(_ context.Context, _ models.ProfileSummary, _ string, _ string, blobName string) error {
	f.deleted = true
	f.blobName = blobName
	return nil
}
func (f *fakeStorage) CopyBlob(context.Context, models.ProfileSummary, string, string, string, string) (models.AzureBlobCopyResult, error) {
	return models.AzureBlobCopyResult{}, nil
}
func (f *fakeStorage) CreateFolderPrefix(context.Context, models.ProfileSummary, string, string, string) (models.AzureBlobCreateFolderPrefixResult, error) {
	return models.AzureBlobCreateFolderPrefixResult{FolderPrefix: "folder/"}, nil
}
func (f *fakeStorage) PresignBlob(context.Context, models.ProfileSummary, string, string, string, int) (models.AzureBlobPresignResult, error) {
	return models.AzureBlobPresignResult{URL: "https://signed.example"}, nil
}

type fakeKeyVault struct {
	set bool
}

func (f *fakeKeyVault) GetKeyVaultSecret(context.Context, models.ProfileSummary, string, string) (string, error) {
	return "secret-value", nil
}
func (f *fakeKeyVault) SetKeyVaultSecret(context.Context, models.ProfileSummary, string, string, string) (models.AzureKeyVaultSecret, error) {
	f.set = true
	return models.AzureKeyVaultSecret{Name: "s1"}, nil
}

type fakePostgres struct {
	started bool
	stopped bool
}

func (f *fakePostgres) ListPostgresServers(context.Context, models.ProfileSummary) ([]models.AzurePostgresServer, error) {
	return []models.AzurePostgresServer{{Name: "pg1", ResourceGroup: "rg1"}}, nil
}
func (f *fakePostgres) StartPostgresServer(context.Context, models.ProfileSummary, string, string) (models.AzurePostgresLifecycleResult, error) {
	f.started = true
	return models.AzurePostgresLifecycleResult{Summary: "Started PostgreSQL server pg1."}, nil
}
func (f *fakePostgres) StopPostgresServer(context.Context, models.ProfileSummary, string, string) (models.AzurePostgresLifecycleResult, error) {
	f.stopped = true
	return models.AzurePostgresLifecycleResult{Summary: "Stopped PostgreSQL server pg1."}, nil
}

func TestAuthorizeWriteRequiresWriteMode(t *testing.T) {
	svc := New(Deps{
		Discovery: fakeDiscovery{snapshot: azureWriteSnapshot()},
		Session: &fakeSession{session: models.SessionSnapshot{
			IsLocked:          true,
			CurrentProviderID: "azure",
			SelectedProfileID: "p1",
		}},
		Workspace: &fakeWorkspace{},
	})
	_, _, err := svc.AuthorizeWrite(
		context.Background(),
		azureWriteSnapshot(),
		"open workspace",
		"write required",
	)
	if err == nil || err.Error() != "write required" {
		t.Fatalf("err = %v", err)
	}
}

func TestWritesEnabled(t *testing.T) {
	profile := models.ProfileSummary{ProfileID: "p1", ProviderID: "azure"}
	if !WritesEnabled(models.SessionSnapshot{AzureWriteModeEnabled: true}, profile, "/usr/bin/az") {
		t.Fatal("expected enabled with CLI path")
	}
	if WritesEnabled(models.SessionSnapshot{}, profile, "/usr/bin/az") {
		t.Fatal("expected disabled without write mode")
	}
	if WritesEnabled(models.SessionSnapshot{AzureWriteModeEnabled: true}, profile, "") {
		t.Fatal("expected disabled without CLI path for cloud profile")
	}
	local := models.ProfileSummary{
		ProfileID:  "local",
		ProviderID: "azure",
		Attributes: []models.DetailField{{Label: "Tenant ID", Value: azureLocalTenantMarker}},
	}
	if !WritesEnabled(models.SessionSnapshot{AzureWriteModeEnabled: true}, local, "") {
		t.Fatal("expected local floci profile to allow writes")
	}
}

func TestHandleStorageDeleteBlob(t *testing.T) {
	storage := &fakeStorage{}
	sess := &fakeSession{session: lockedAzureWriteSession()}
	sess.session.SelectedAzureStorageAccount = "acct"
	sess.session.SelectedAzureBlobContainer = "c1"
	sess.session.SelectedAzureBlobName = "old.bin"
	inv := &fakeInvalidator{}
	svc := New(Deps{
		Discovery:     fakeDiscovery{snapshot: azureWriteSnapshot()},
		Session:       sess,
		Workspace:     &fakeWorkspace{},
		Activity:      &fakeActivity{},
		Invalidator:   inv,
		Storage:       storage,
		ActionTimeout: 5 * time.Second,
	})
	params, _ := json.Marshal(map[string]string{"blobName": "old.bin"})
	if _, err := svc.HandleStorageDeleteBlob(context.Background(), params, nil); err != nil {
		t.Fatal(err)
	}
	if !storage.deleted || storage.blobName != "old.bin" {
		t.Fatalf("deleted=%v blob=%q", storage.deleted, storage.blobName)
	}
	if sess.session.SelectedAzureBlobName != "" {
		t.Fatalf("expected selection cleared, got %q", sess.session.SelectedAzureBlobName)
	}
}

func TestHandleKeyVaultSetSecret(t *testing.T) {
	kv := &fakeKeyVault{}
	sess := &fakeSession{session: lockedAzureWriteSession()}
	svc := New(Deps{
		Discovery:     fakeDiscovery{snapshot: azureWriteSnapshot()},
		Session:       sess,
		Workspace:     &fakeWorkspace{},
		Activity:      &fakeActivity{},
		KeyVault:      kv,
		ActionTimeout: 5 * time.Second,
	})
	params, _ := json.Marshal(map[string]string{
		"vaultName":  "kv1",
		"secretName": "s1",
		"value":      "v",
	})
	if _, err := svc.HandleKeyVaultSetSecret(context.Background(), params, nil); err != nil {
		t.Fatal(err)
	}
	if !kv.set {
		t.Fatal("expected SetKeyVaultSecret")
	}
	if sess.session.SelectedAzureKeyVault != "kv1" || sess.session.SelectedAzureSecret != "s1" {
		t.Fatalf("session vault=%q secret=%q", sess.session.SelectedAzureKeyVault, sess.session.SelectedAzureSecret)
	}
}

func TestHandlePostgresStartServer(t *testing.T) {
	pg := &fakePostgres{}
	sess := &fakeSession{session: lockedAzureWriteSession()}
	svc := New(Deps{
		Discovery:   fakeDiscovery{snapshot: azureWriteSnapshot()},
		Session:     sess,
		Workspace:   &fakeWorkspace{},
		Activity:    &fakeActivity{},
		Invalidator: &fakeInvalidator{},
		Postgres:    pg,
	})
	params, _ := json.Marshal(map[string]string{"server": "pg1"})
	if _, err := svc.HandlePostgresStartServer(context.Background(), params, nil); err != nil {
		t.Fatal(err)
	}
	if !pg.started {
		t.Fatal("expected start")
	}
	if sess.session.SelectedAzurePostgresServer != "pg1" {
		t.Fatalf("selected server = %q", sess.session.SelectedAzurePostgresServer)
	}
}

func TestHandleWafConfigSetModeRequiresConfirm(t *testing.T) {
	svc := New(Deps{
		Discovery: fakeDiscovery{snapshot: azureWriteSnapshot()},
		Session:   &fakeSession{session: lockedAzureWriteSession()},
		Workspace: &fakeWorkspace{},
		Waf:       &fakeWaf{},
	})
	params, _ := json.Marshal(map[string]any{
		"resourceGroup": "rg",
		"policyName":    "pol",
		"mode":          "Prevention",
		"confirm":       false,
	})
	if _, err := svc.HandleWafConfigSetMode(context.Background(), params, nil); err == nil {
		t.Fatal("expected confirm error")
	}
}

type fakeWaf struct {
	mode string
}

func (f *fakeWaf) UpdateWafPolicyMode(_ context.Context, _ models.ProfileSummary, _ string, _ string, mode string) error {
	f.mode = mode
	return nil
}
func (f *fakeWaf) SetWafManagedRuleOverride(context.Context, models.ProfileSummary, string, string, string, string, string, string, bool) error {
	return nil
}
func (f *fakeWaf) AddWafExclusion(context.Context, models.ProfileSummary, string, string, models.AzureWafExclusion) error {
	return nil
}
func (f *fakeWaf) RemoveWafExclusion(context.Context, models.ProfileSummary, string, string, models.AzureWafExclusion) error {
	return nil
}

func TestHandleWafConfigSetMode(t *testing.T) {
	waf := &fakeWaf{}
	svc := New(Deps{
		Discovery: fakeDiscovery{snapshot: azureWriteSnapshot()},
		Session:   &fakeSession{session: lockedAzureWriteSession()},
		Workspace: &fakeWorkspace{},
		Activity:  &fakeActivity{},
		Waf:       waf,
	})
	params, _ := json.Marshal(map[string]any{
		"resourceGroup": "rg",
		"policyName":    "pol",
		"mode":          "detection",
		"confirm":       true,
	})
	if _, err := svc.HandleWafConfigSetMode(context.Background(), params, nil); err != nil {
		t.Fatal(err)
	}
	if waf.mode != "Detection" {
		t.Fatalf("mode = %q", waf.mode)
	}
}

func TestNormaliseWafPolicyMode(t *testing.T) {
	got, err := NormaliseWafPolicyMode("prevention")
	if err != nil || got != "Prevention" {
		t.Fatalf("got %q %v", got, err)
	}
	if _, err := NormaliseWafPolicyMode("audit"); err == nil {
		t.Fatal("expected error")
	}
}

func TestActiveStorageSelectionRequiresAccount(t *testing.T) {
	snap := azureWriteSnapshot()
	session := lockedAzureWriteSession()
	_, _, _, err := ActiveStorageSelection(context.Background(), &fakeStorage{}, snap, session, true)
	// fakeStorage lists an account, so selection should succeed via fallback
	if err != nil {
		t.Fatal(err)
	}
	// without storage writer and no session selection
	_, _, _, err = ActiveStorageSelection(context.Background(), nil, snap, session, true)
	if err == nil {
		t.Fatal("expected missing account error")
	}
}

type fakeResourceGroups struct {
	created string
	deleted string
	groups  []models.AzureResourceGroup
}

func (f *fakeResourceGroups) ListResourceGroups(context.Context, models.ProfileSummary) ([]models.AzureResourceGroup, error) {
	if len(f.groups) == 0 {
		return []models.AzureResourceGroup{{Name: "rg1"}}, nil
	}
	return f.groups, nil
}
func (f *fakeResourceGroups) CreateResourceGroup(_ context.Context, _ models.ProfileSummary, name string, _ string) (models.AzureResourceGroup, error) {
	f.created = name
	return models.AzureResourceGroup{Name: name, Location: "uksouth"}, nil
}
func (f *fakeResourceGroups) DeleteResourceGroup(_ context.Context, _ models.ProfileSummary, name string) error {
	f.deleted = name
	return nil
}

type fakeVirtualMachines struct {
	invoked string
	vms     []models.AzureVirtualMachine
}

func (f *fakeVirtualMachines) ListVirtualMachines(context.Context, models.ProfileSummary, string) ([]models.AzureVirtualMachine, error) {
	if len(f.vms) == 0 {
		return []models.AzureVirtualMachine{{Name: "vm1", VMID: "vm-1"}}, nil
	}
	return f.vms, nil
}
func (f *fakeVirtualMachines) InvokeVirtualMachineAction(_ context.Context, _ models.ProfileSummary, _ string, vmName string, action string) error {
	f.invoked = action + ":" + vmName
	return nil
}

type fakeFrontDoor struct {
	purgedEndpoint string
	profiles       []models.AzureFrontDoorProfile
}

func (f *fakeFrontDoor) ListFrontDoorProfiles(context.Context, models.ProfileSummary, bool) ([]models.AzureFrontDoorProfile, error) {
	if len(f.profiles) == 0 {
		return []models.AzureFrontDoorProfile{{Name: "afd1", ResourceGroup: "rg1"}}, nil
	}
	return f.profiles, nil
}
func (f *fakeFrontDoor) PurgeFrontDoorEndpointCache(_ context.Context, _ models.ProfileSummary, _ string, _ string, endpointName string, _ []string, _ []string) error {
	f.purgedEndpoint = endpointName
	return nil
}

type fakeQueues struct {
	purgedAccount string
	purgedQueue   string
}

func (f *fakeQueues) PurgeQueueMessages(_ context.Context, _ models.ProfileSummary, accountName string, queueName string) (models.AzureQueuePurgeResult, error) {
	f.purgedAccount = accountName
	f.purgedQueue = queueName
	return models.AzureQueuePurgeResult{
		AccountName: accountName,
		QueueName:   queueName,
		Summary:     "Purged all messages from queue " + queueName + " in " + accountName + ".",
	}, nil
}

func TestHandleResourceGroupsCreate(t *testing.T) {
	rg := &fakeResourceGroups{}
	sess := &fakeSession{session: lockedAzureWriteSession()}
	inv := &fakeInvalidator{}
	svc := New(Deps{
		Discovery:      fakeDiscovery{snapshot: azureWriteSnapshot()},
		Session:        sess,
		Workspace:      &fakeWorkspace{},
		Activity:       &fakeActivity{},
		Invalidator:    inv,
		ResourceGroups: rg,
	})
	params, _ := json.Marshal(map[string]string{"name": "new-rg", "location": "uksouth"})
	if _, err := svc.HandleResourceGroupsCreate(context.Background(), params, nil); err != nil {
		t.Fatal(err)
	}
	if rg.created != "new-rg" {
		t.Fatalf("created = %q", rg.created)
	}
	if sess.session.SelectedAzureResourceGroup != "new-rg" {
		t.Fatalf("selected rg = %q", sess.session.SelectedAzureResourceGroup)
	}
	if len(inv.scopes) != 1 || inv.scopes[0] != "azure.resource-groups" {
		t.Fatalf("invalidator scopes = %v", inv.scopes)
	}
}

func TestHandleResourceGroupsDelete(t *testing.T) {
	rg := &fakeResourceGroups{}
	sess := &fakeSession{session: lockedAzureWriteSession()}
	sess.session.SelectedAzureResourceGroup = "old-rg"
	sess.session.SelectedAzureVMID = "vm-1"
	svc := New(Deps{
		Discovery:      fakeDiscovery{snapshot: azureWriteSnapshot()},
		Session:        sess,
		Workspace:      &fakeWorkspace{},
		Activity:       &fakeActivity{},
		Invalidator:    &fakeInvalidator{},
		ResourceGroups: rg,
	})
	params, _ := json.Marshal(map[string]string{"name": "old-rg"})
	if _, err := svc.HandleResourceGroupsDelete(context.Background(), params, nil); err != nil {
		t.Fatal(err)
	}
	if rg.deleted != "old-rg" {
		t.Fatalf("deleted = %q", rg.deleted)
	}
	if sess.session.SelectedAzureResourceGroup != "" || sess.session.SelectedAzureVMID != "" {
		t.Fatalf("session not cleared: rg=%q vm=%q", sess.session.SelectedAzureResourceGroup, sess.session.SelectedAzureVMID)
	}
}

func TestHandleVirtualMachinesInvokeAction(t *testing.T) {
	vms := &fakeVirtualMachines{}
	rg := &fakeResourceGroups{}
	sess := &fakeSession{session: lockedAzureWriteSession()}
	sess.session.SelectedAzureResourceGroup = "rg1"
	sess.session.SelectedAzureVMID = "vm-1"
	svc := New(Deps{
		Discovery:       fakeDiscovery{snapshot: azureWriteSnapshot()},
		Session:         sess,
		Workspace:       &fakeWorkspace{},
		Activity:        &fakeActivity{},
		ResourceGroups:  rg,
		VirtualMachines: vms,
	})
	params, _ := json.Marshal(map[string]string{"action": "start", "vmId": "vm-1"})
	if _, err := svc.HandleVirtualMachinesInvokeAction(context.Background(), params, nil); err != nil {
		t.Fatal(err)
	}
	if vms.invoked != "start:vm1" {
		t.Fatalf("invoked = %q", vms.invoked)
	}
}

func TestHandleFrontDoorPurgeCache(t *testing.T) {
	fd := &fakeFrontDoor{}
	sess := &fakeSession{session: lockedAzureWriteSession()}
	sess.session.SelectedAzureFrontDoorProfile = "afd1"
	svc := New(Deps{
		Discovery: fakeDiscovery{snapshot: azureWriteSnapshot()},
		Session:   sess,
		Workspace: &fakeWorkspace{},
		Activity:  &fakeActivity{},
		FrontDoor: fd,
	})
	params, _ := json.Marshal(map[string]any{
		"endpointName": "ep1",
		"contentPaths": []string{"/assets/*"},
	})
	if _, err := svc.HandleFrontDoorPurgeCache(context.Background(), params, nil); err != nil {
		t.Fatal(err)
	}
	if fd.purgedEndpoint != "ep1" {
		t.Fatalf("purged = %q", fd.purgedEndpoint)
	}
}

func TestHandleFrontDoorRefresh(t *testing.T) {
	ws := &fakeWorkspace{}
	svc := New(Deps{
		Discovery: fakeDiscovery{snapshot: azureWriteSnapshot()},
		Session:   &fakeSession{session: lockedAzureWriteSession()},
		Workspace: ws,
	})
	if _, err := svc.HandleFrontDoorRefresh(context.Background(), nil, nil); err != nil {
		t.Fatal(err)
	}
	if ws.lastOpts.AzureScope != "frontdoor" {
		t.Fatalf("scope = %q", ws.lastOpts.AzureScope)
	}
	if !ws.lastOpts.SkipAwsInventory {
		t.Fatal("expected SkipAwsInventory")
	}
}

func TestHandleQueuesPurge(t *testing.T) {
	q := &fakeQueues{}
	sess := &fakeSession{session: lockedAzureWriteSession()}
	sess.session.SelectedAzureStorageAccount = "acct1"
	sess.session.SelectedAzureQueue = "jobs"
	inv := &fakeInvalidator{}
	svc := New(Deps{
		Discovery:   fakeDiscovery{snapshot: azureWriteSnapshot()},
		Session:     sess,
		Workspace:   &fakeWorkspace{},
		Activity:    &fakeActivity{},
		Invalidator: inv,
		Queues:      q,
	})
	if _, err := svc.HandleQueuesPurge(context.Background(), json.RawMessage(`{}`), nil); err != nil {
		t.Fatal(err)
	}
	if q.purgedAccount != "acct1" || q.purgedQueue != "jobs" {
		t.Fatalf("purge = %q/%q", q.purgedAccount, q.purgedQueue)
	}
	if len(inv.scopes) != 1 || inv.scopes[0] != "azure.storage-queues" {
		t.Fatalf("invalidator scopes = %v", inv.scopes)
	}
}

type fakeCosmos struct {
	deletedItem string
	partition   string
}

func (f *fakeCosmos) DeleteCosmosItem(
	_ context.Context,
	_ models.ProfileSummary,
	_ string,
	_ string,
	_ string,
	_ string,
	itemID string,
	partitionKey string,
) (models.AzureCosmosDeleteItemResult, error) {
	f.deletedItem = itemID
	f.partition = partitionKey
	return models.AzureCosmosDeleteItemResult{
		ItemID:  itemID,
		Summary: "Deleted Cosmos item " + itemID + ".",
	}, nil
}

func TestHandleCosmosDeleteItem(t *testing.T) {
	c := &fakeCosmos{}
	sess := &fakeSession{session: lockedAzureWriteSession()}
	sess.session.SelectedAzureCosmosAccount = "devstoreaccount1"
	sess.session.SelectedAzureCosmosDatabase = "appdb"
	sess.session.SelectedAzureCosmosContainer = "orders"
	ws := &fakeWorkspace{}
	svc := New(Deps{
		Discovery: fakeDiscovery{snapshot: azureWriteSnapshot()},
		Session:   sess,
		Workspace: ws,
		Activity:  &fakeActivity{},
		Cosmos:    c,
	})
	params, _ := json.Marshal(map[string]string{
		"itemId":       "doc-1",
		"partitionKey": "cust-9",
	})
	if _, err := svc.HandleCosmosDeleteItem(context.Background(), params, nil); err != nil {
		t.Fatal(err)
	}
	if c.deletedItem != "doc-1" || c.partition != "cust-9" {
		t.Fatalf("delete = item %q pk %q", c.deletedItem, c.partition)
	}
	if ws.lastOpts.AzureScope != "cosmos" {
		t.Fatalf("scope = %q", ws.lastOpts.AzureScope)
	}
}

func TestHandleCosmosDeleteItemRequiresWriteMode(t *testing.T) {
	sess := &fakeSession{session: lockedAzureWriteSession()}
	sess.session.AzureWriteModeEnabled = false
	sess.session.SelectedAzureCosmosAccount = "acct"
	sess.session.SelectedAzureCosmosDatabase = "db"
	sess.session.SelectedAzureCosmosContainer = "c"
	svc := New(Deps{
		Discovery: fakeDiscovery{snapshot: azureWriteSnapshot()},
		Session:   sess,
		Workspace: &fakeWorkspace{},
		Cosmos:    &fakeCosmos{},
	})
	params, _ := json.Marshal(map[string]string{"itemId": "doc-1"})
	if _, err := svc.HandleCosmosDeleteItem(context.Background(), params, nil); err == nil {
		t.Fatal("expected write mode error")
	}
}

func TestActiveVirtualMachineSelection(t *testing.T) {
	snap := azureWriteSnapshot()
	session := lockedAzureWriteSession()
	session.SelectedAzureResourceGroup = "rg1"
	_, rg, vm, err := ActiveVirtualMachineSelection(
		context.Background(),
		&fakeResourceGroups{},
		&fakeVirtualMachines{},
		snap,
		session,
		"",
	)
	if err != nil {
		t.Fatal(err)
	}
	if rg != "rg1" || vm.Name != "vm1" {
		t.Fatalf("rg=%q vm=%+v", rg, vm)
	}
}

func TestActiveFrontDoorSelection(t *testing.T) {
	snap := azureWriteSnapshot()
	session := lockedAzureWriteSession()
	_, rg, name, err := ActiveFrontDoorSelection(
		context.Background(),
		&fakeFrontDoor{},
		snap,
		session,
		"",
	)
	if err != nil {
		t.Fatal(err)
	}
	if rg != "rg1" || name != "afd1" {
		t.Fatalf("rg=%q name=%q", rg, name)
	}
}
