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
