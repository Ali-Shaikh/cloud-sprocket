// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package azure

import (
	"context"
	"encoding/json"
	"sync"
	"testing"

	"cloudsprocket/backend/daemon/internal/app/sessionport"
	"cloudsprocket/backend/daemon/internal/discovery"
	"cloudsprocket/backend/daemon/internal/models"
)

type fakeDiscovery struct {
	snapshot discovery.Snapshot
	err      error
}

func (f fakeDiscovery) Discover() (discovery.Snapshot, error) {
	return f.snapshot, f.err
}

type fakeSession struct {
	mu      sync.Mutex
	session models.SessionSnapshot
}

func (f *fakeSession) Load(_ context.Context, _ discovery.Snapshot) (models.SessionSnapshot, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.session, nil
}

func (f *fakeSession) Update(_ context.Context, _ discovery.Snapshot, mutate func(*models.SessionSnapshot) error) (models.SessionSnapshot, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if mutate != nil {
		if err := mutate(&f.session); err != nil {
			return models.SessionSnapshot{}, err
		}
	}
	return f.session, nil
}

type fakeWorkspace struct {
	lastOpts sessionport.SnapshotOptions
	built    int
}

func (f *fakeWorkspace) Build(_ context.Context, _ discovery.Snapshot, _ models.SessionSnapshot, opts sessionport.SnapshotOptions) models.WorkspaceSnapshot {
	f.built++
	f.lastOpts = opts
	return models.WorkspaceSnapshot{SelectedAzureResourceGroup: "rg-demo"}
}

type fakeGate struct {
	enabled map[string]bool
}

func (g fakeGate) IsServiceEnabled(providerID, serviceID string) bool {
	if g.enabled == nil {
		return true
	}
	return g.enabled[providerID+"|"+serviceID]
}

type fakeCatalog struct{}

func (fakeCatalog) IsValidScope(scope string) bool {
	return IsValidInventoryScope(scope)
}

func (fakeCatalog) ServiceIDForScope(scope string) string {
	// Mirror façade azureServiceIDForInventoryScope for a few scopes used in tests.
	switch NormaliseInventoryScope(scope) {
	case "storage":
		return "azure-storage"
	case "waf":
		return "azure-waf"
	default:
		return ""
	}
}

func TestIsValidInventoryScope(t *testing.T) {
	for _, scope := range []string{"storage", "STORAGE", " waf ", "loganalytics", "entra"} {
		if !IsValidInventoryScope(scope) {
			t.Fatalf("expected %q to be valid", scope)
		}
	}
	for _, scope := range []string{"", "unknown", "s3", "ec2"} {
		if IsValidInventoryScope(scope) {
			t.Fatalf("expected %q to be invalid", scope)
		}
	}
}

func TestLightweightAzureForInventoryScope(t *testing.T) {
	if LightweightAzureForInventoryScope("storage") {
		t.Fatal("storage must not be lightweight")
	}
	if !LightweightAzureForInventoryScope("waf") {
		t.Fatal("waf should be lightweight")
	}
	if !LightweightAzureForInventoryScope("functions") {
		t.Fatal("functions should be lightweight")
	}
}

func TestHandleInventoryGetBuildsScopedWorkspace(t *testing.T) {
	ws := &fakeWorkspace{}
	svc := New(Deps{
		Discovery: fakeDiscovery{},
		Session: &fakeSession{session: models.SessionSnapshot{
			IsLocked:          true,
			CurrentProviderID: "azure",
		}},
		Workspace: ws,
		Gate:      fakeGate{},
		Catalog:   fakeCatalog{},
	})

	params, _ := json.Marshal(map[string]string{"scope": "Storage"})
	result, err := svc.HandleInventoryGet(context.Background(), params)
	if err != nil {
		t.Fatalf("HandleInventoryGet: %v", err)
	}
	if _, ok := result.(models.WorkspaceSnapshot); !ok {
		t.Fatalf("expected WorkspaceSnapshot, got %T", result)
	}
	if ws.built != 1 {
		t.Fatalf("built = %d, want 1", ws.built)
	}
	if ws.lastOpts.AzureScope != "storage" {
		t.Fatalf("AzureScope = %q", ws.lastOpts.AzureScope)
	}
	if ws.lastOpts.LightweightAzure {
		t.Fatal("storage scope must not set LightweightAzure")
	}
	if !ws.lastOpts.SkipAwsInventory {
		t.Fatal("expected SkipAwsInventory")
	}
	if ws.lastOpts.AzureDeferredInventory {
		t.Fatal("expected AzureDeferredInventory false")
	}
}

func TestHandleInventoryGetLightweightNonStorage(t *testing.T) {
	ws := &fakeWorkspace{}
	svc := New(Deps{
		Discovery: fakeDiscovery{},
		Session: &fakeSession{session: models.SessionSnapshot{
			IsLocked:          true,
			CurrentProviderID: "azure",
		}},
		Workspace: ws,
		Gate:      fakeGate{},
		Catalog:   fakeCatalog{},
	})

	params, _ := json.Marshal(map[string]string{"scope": "waf"})
	if _, err := svc.HandleInventoryGet(context.Background(), params); err != nil {
		t.Fatalf("HandleInventoryGet: %v", err)
	}
	if !ws.lastOpts.LightweightAzure || ws.lastOpts.AzureScope != "waf" {
		t.Fatalf("opts = %+v", ws.lastOpts)
	}
}

func TestHandleInventoryGetRejectsUnknownScope(t *testing.T) {
	svc := New(Deps{
		Discovery: fakeDiscovery{},
		Session:   &fakeSession{},
		Workspace: &fakeWorkspace{},
		Gate:      fakeGate{},
		Catalog:   fakeCatalog{},
	})
	_, err := svc.HandleInventoryGet(context.Background(), []byte(`{"scope":"unknown"}`))
	if err == nil {
		t.Fatal("expected error for unknown scope")
	}
}

func TestHandleInventoryGetRejectsUnlocked(t *testing.T) {
	svc := New(Deps{
		Discovery: fakeDiscovery{},
		Session: &fakeSession{session: models.SessionSnapshot{
			IsLocked:          false,
			CurrentProviderID: "azure",
		}},
		Workspace: &fakeWorkspace{},
		Gate:      fakeGate{},
		Catalog:   fakeCatalog{},
	})
	_, err := svc.HandleInventoryGet(context.Background(), []byte(`{"scope":"storage"}`))
	if err == nil || err.Error() != "open an Azure workspace before loading service inventory" {
		t.Fatalf("err = %v", err)
	}
}

func TestHandleInventoryGetRejectsDisabledService(t *testing.T) {
	svc := New(Deps{
		Discovery: fakeDiscovery{},
		Session: &fakeSession{session: models.SessionSnapshot{
			IsLocked:          true,
			CurrentProviderID: "azure",
		}},
		Workspace: &fakeWorkspace{},
		Gate: fakeGate{enabled: map[string]bool{
			"azure|azure-storage": false,
		}},
		Catalog: fakeCatalog{},
	})
	_, err := svc.HandleInventoryGet(context.Background(), []byte(`{"scope":"storage"}`))
	if err == nil || err.Error() != "that Azure service is disabled in settings" {
		t.Fatalf("err = %v", err)
	}
}

func TestHandleInventoryGetRequiresDeps(t *testing.T) {
	svc := New(Deps{})
	_, err := svc.HandleInventoryGet(context.Background(), []byte(`{"scope":"storage"}`))
	if err == nil {
		t.Fatal("expected unavailable error")
	}
}
