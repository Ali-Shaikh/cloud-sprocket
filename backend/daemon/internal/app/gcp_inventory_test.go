// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"errors"
	"strings"
	"testing"

	"cloudsprocket/backend/daemon/internal/models"
)

func gcpInventoryTestService(
	t *testing.T,
	storage *stubGcpStorageInventory,
	compute *stubGcpComputeInventory,
	functions *stubGcpFunctionsInventory,
	gke *stubGcpGkeInventory,
) *Service {
	t.Helper()
	service := gcpStorageTestService(t, storage)
	service.gcpCompute = compute
	service.gcpFunctions = functions
	service.gcpGke = gke
	return service
}

func TestGcpInventoryGetRejectsUnknownScope(t *testing.T) {
	service := gcpInventoryTestService(t, &stubGcpStorageInventory{}, &stubGcpComputeInventory{}, &stubGcpFunctionsInventory{}, &stubGcpGkeInventory{})
	_, err := service.Handle(context.Background(), "gcp.inventory.get", []byte(`{"scope":"Nope"}`), nil)
	if err == nil {
		t.Fatal("expected error for unknown scope")
	}
	if !strings.Contains(err.Error(), `unknown GCP inventory scope "Nope"`) {
		t.Fatalf("err = %v", err)
	}
}

func TestGcpInventoryGetRejectsEmptyScope(t *testing.T) {
	service := gcpInventoryTestService(t, &stubGcpStorageInventory{}, &stubGcpComputeInventory{}, &stubGcpFunctionsInventory{}, &stubGcpGkeInventory{})
	_, err := service.Handle(context.Background(), "gcp.inventory.get", []byte(`{}`), nil)
	if err == nil || err.Error() != "scope is required" {
		t.Fatalf("err = %v", err)
	}
}

func TestGcpInventoryGetRejectsUnlocked(t *testing.T) {
	service := gcpInventoryTestService(t, &stubGcpStorageInventory{}, &stubGcpComputeInventory{}, &stubGcpFunctionsInventory{}, &stubGcpGkeInventory{})
	ctx := context.Background()
	for _, step := range []struct {
		method string
		params []byte
	}{
		{"session.selectProvider", []byte(`{"providerId":"gcp"}`)},
		{"session.selectProfile", []byte(`{"providerId":"gcp","profileId":"default"}`)},
		{"session.selectAuthMethod", []byte(`{"authMethod":"cli"}`)},
	} {
		if _, err := service.Handle(ctx, step.method, step.params, nil); err != nil {
			t.Fatalf("%s: %v", step.method, err)
		}
	}
	_, err := service.Handle(ctx, "gcp.inventory.get", []byte(`{"scope":"gcs"}`), nil)
	if err == nil || err.Error() != "open a GCP workspace before loading service inventory" {
		t.Fatalf("err = %v", err)
	}
}

func TestGcpInventoryGetRejectsDisabledService(t *testing.T) {
	storage := &stubGcpStorageInventory{
		buckets: []models.GcpStorageBucket{{Name: "alpha"}},
	}
	service := gcpInventoryTestService(t, storage, &stubGcpComputeInventory{}, &stubGcpFunctionsInventory{}, &stubGcpGkeInventory{})
	lockGcpWorkspace(t, service)
	storage.calls = 0

	if _, err := service.Handle(context.Background(), "preferences.update", []byte(`{"disabledProviders":[],"disabledServices":{"gcp":["gcp-storage"]}}`), nil); err != nil {
		t.Fatalf("preferences.update: %v", err)
	}
	_, err := service.Handle(context.Background(), "gcp.inventory.get", []byte(`{"scope":"gcs"}`), nil)
	if err == nil || err.Error() != "that GCP service is disabled in settings" {
		t.Fatalf("err = %v", err)
	}
	if storage.calls != 0 {
		t.Fatalf("ListBuckets calls = %d, want 0 when disabled", storage.calls)
	}
}

func TestWorkspaceGetSkipsGcpListsAndInventoryGetCallsOne(t *testing.T) {
	storage := &stubGcpStorageInventory{
		buckets: []models.GcpStorageBucket{{Name: "alpha", Location: "US"}},
	}
	compute := &stubGcpComputeInventory{
		instances: []models.GcpComputeInstance{{Name: "web-1", Zone: "us-central1-a", Status: "RUNNING"}},
	}
	functions := &stubGcpFunctionsInventory{
		functions: []models.GcpCloudFunction{{Name: "hello", Region: "us-central1"}},
	}
	gke := &stubGcpGkeInventory{
		clusters: []models.GcpGkeCluster{{Name: "alpha", Location: "us-central1", Status: "RUNNING"}},
	}
	service := gcpInventoryTestService(t, storage, compute, functions, gke)
	lockGcpWorkspace(t, service)
	storage.calls = 0
	compute.listCalls = 0
	functions.listCalls = 0
	gke.listCalls = 0

	ctx := context.Background()
	result, err := service.Handle(ctx, "workspace.get", nil, nil)
	if err != nil {
		t.Fatalf("workspace.get: %v", err)
	}
	workspace, ok := result.(models.WorkspaceSnapshot)
	if !ok {
		t.Fatalf("expected WorkspaceSnapshot, got %T", result)
	}
	if storage.calls != 0 || compute.listCalls != 0 || functions.listCalls != 0 || gke.listCalls != 0 {
		t.Fatalf("workspace.get list calls storage=%d compute=%d functions=%d gke=%d, want 0",
			storage.calls, compute.listCalls, functions.listCalls, gke.listCalls)
	}
	if len(workspace.GcpStorageBuckets) != 0 || len(workspace.GcpComputeInstances) != 0 || len(workspace.GcpFunctions) != 0 || len(workspace.GcpGkeClusters) != 0 {
		t.Fatalf("deferred workspace.get populated inventory: buckets=%d instances=%d functions=%d clusters=%d",
			len(workspace.GcpStorageBuckets), len(workspace.GcpComputeInstances), len(workspace.GcpFunctions), len(workspace.GcpGkeClusters))
	}
	if workspace.GcpInventory["gcs"].Loaded || workspace.GcpInventory["gce"].Loaded || workspace.GcpInventory["gcf"].Loaded || workspace.GcpInventory["gke"].Loaded {
		t.Fatalf("deferred workspace.get marked scopes loaded: %+v", workspace.GcpInventory)
	}

	cases := []struct {
		scope  string
		assert func(models.WorkspaceSnapshot)
		calls  func() (int, int, int, int)
	}{
		{
			scope: "gcs",
			assert: func(got models.WorkspaceSnapshot) {
				if len(got.GcpStorageBuckets) != 1 || got.GcpStorageBuckets[0].Name != "alpha" {
					t.Fatalf("buckets = %+v", got.GcpStorageBuckets)
				}
				if len(got.GcpComputeInstances) != 0 || len(got.GcpFunctions) != 0 || len(got.GcpGkeClusters) != 0 {
					t.Fatal("gcs scope populated another service")
				}
				if !got.GcpInventory["gcs"].Loaded || got.GcpInventory["gce"].Loaded {
					t.Fatalf("inventory = %+v", got.GcpInventory)
				}
			},
			calls: func() (int, int, int, int) { return 1, 0, 0, 0 },
		},
		{
			scope: "gce",
			assert: func(got models.WorkspaceSnapshot) {
				if len(got.GcpComputeInstances) != 1 || got.GcpComputeInstances[0].Name != "web-1" {
					t.Fatalf("instances = %+v", got.GcpComputeInstances)
				}
				if len(got.GcpStorageBuckets) != 0 {
					t.Fatal("gce scope populated storage")
				}
				if !got.GcpInventory["gce"].Loaded {
					t.Fatalf("inventory = %+v", got.GcpInventory)
				}
			},
			calls: func() (int, int, int, int) { return 1, 1, 0, 0 },
		},
		{
			scope: "gcf",
			assert: func(got models.WorkspaceSnapshot) {
				if len(got.GcpFunctions) != 1 || got.GcpFunctions[0].Name != "hello" {
					t.Fatalf("functions = %+v", got.GcpFunctions)
				}
				if !got.GcpInventory["gcf"].Loaded {
					t.Fatalf("inventory = %+v", got.GcpInventory)
				}
			},
			calls: func() (int, int, int, int) { return 1, 1, 1, 0 },
		},
		{
			scope: "gke",
			assert: func(got models.WorkspaceSnapshot) {
				if len(got.GcpGkeClusters) != 1 || got.GcpGkeClusters[0].Name != "alpha" {
					t.Fatalf("clusters = %+v", got.GcpGkeClusters)
				}
				if !got.GcpInventory["gke"].Loaded || got.GcpInventory["gke"].EmptyReason != "" {
					t.Fatalf("inventory = %+v", got.GcpInventory)
				}
			},
			calls: func() (int, int, int, int) { return 1, 1, 1, 1 },
		},
	}
	for _, tc := range cases {
		t.Run(tc.scope, func(t *testing.T) {
			scoped, err := service.Handle(ctx, "gcp.inventory.get", []byte(`{"scope":"`+tc.scope+`"}`), nil)
			if err != nil {
				t.Fatalf("gcp.inventory.get: %v", err)
			}
			got, ok := scoped.(models.WorkspaceSnapshot)
			if !ok {
				t.Fatalf("expected WorkspaceSnapshot, got %T", scoped)
			}
			tc.assert(got)
			wantStorage, wantCompute, wantFunctions, wantGke := tc.calls()
			if storage.calls != wantStorage || compute.listCalls != wantCompute || functions.listCalls != wantFunctions || gke.listCalls != wantGke {
				t.Fatalf("calls storage=%d compute=%d functions=%d gke=%d, want %d %d %d %d",
					storage.calls, compute.listCalls, functions.listCalls, gke.listCalls,
					wantStorage, wantCompute, wantFunctions, wantGke)
			}
		})
	}
}

func TestGcpInventoryGetEmptyListMarksNoneFound(t *testing.T) {
	storage := &stubGcpStorageInventory{}
	service := gcpInventoryTestService(t, storage, &stubGcpComputeInventory{}, &stubGcpFunctionsInventory{}, &stubGcpGkeInventory{})
	lockGcpWorkspace(t, service)

	result, err := service.Handle(context.Background(), "gcp.inventory.get", []byte(`{"scope":"gcs"}`), nil)
	if err != nil {
		t.Fatalf("gcp.inventory.get: %v", err)
	}
	workspace := result.(models.WorkspaceSnapshot)
	state := workspace.GcpInventory["gcs"]
	if !state.Loaded || state.EmptyReason != models.InventoryEmptyNoneFound {
		t.Fatalf("inventory = %+v, want loaded none_found", state)
	}
	if len(workspace.GcpStorageBuckets) != 0 {
		t.Fatalf("buckets = %+v", workspace.GcpStorageBuckets)
	}
	if storage.calls != 1 {
		t.Fatalf("ListBuckets calls = %d, want 1", storage.calls)
	}
}

func TestGcpInventoryGetFailedListMarksError(t *testing.T) {
	storage := &stubGcpStorageInventory{err: errors.New("gcloud not authenticated")}
	service := gcpInventoryTestService(t, storage, &stubGcpComputeInventory{}, &stubGcpFunctionsInventory{}, &stubGcpGkeInventory{})
	lockGcpWorkspace(t, service)

	result, err := service.Handle(context.Background(), "gcp.inventory.get", []byte(`{"scope":"gcs"}`), nil)
	if err != nil {
		t.Fatalf("gcp.inventory.get: %v", err)
	}
	workspace := result.(models.WorkspaceSnapshot)
	state := workspace.GcpInventory["gcs"]
	if !state.Loaded || state.EmptyReason != models.InventoryEmptyError {
		t.Fatalf("inventory = %+v, want loaded error", state)
	}
	if !strings.Contains(workspace.GcpStorageStatusMessage, "Could not list Cloud Storage buckets") {
		t.Fatalf("status = %q", workspace.GcpStorageStatusMessage)
	}
}

func TestMarkGcpInventory(t *testing.T) {
	var workspace models.WorkspaceSnapshot
	markGcpInventory(&workspace, "gcs", 0, models.InventoryEmptyNoneFound)
	state := workspace.GcpInventory["gcs"]
	if !state.Loaded || state.EmptyReason != models.InventoryEmptyNoneFound {
		t.Fatalf("empty = %+v", state)
	}

	markGcpInventory(&workspace, "gcs", 2, models.InventoryEmptyNoneFound)
	state = workspace.GcpInventory["gcs"]
	if !state.Loaded || state.EmptyReason != "" {
		t.Fatalf("rows = %+v, want loaded with no empty reason", state)
	}

	markGcpInventory(&workspace, "gce", 0, models.InventoryEmptyError)
	if workspace.GcpInventory["gce"].EmptyReason != models.InventoryEmptyError || !workspace.GcpInventory["gce"].Loaded {
		t.Fatalf("error = %+v", workspace.GcpInventory["gce"])
	}

	markGcpInventory(&workspace, "gke", 3, models.InventoryEmptyError)
	if workspace.GcpInventory["gke"].EmptyReason != models.InventoryEmptyError || !workspace.GcpInventory["gke"].Loaded {
		t.Fatalf("cached rows = %+v, want loaded error", workspace.GcpInventory["gke"])
	}
}

func TestGcpCachedInventoryStatusUsesWarningPrefix(t *testing.T) {
	got := gcpCachedInventoryStatus("Cloud Storage bucket(s)", 2, errors.New("timeout"))
	if !strings.HasPrefix(got, "Could not") {
		t.Fatalf("status = %q, want a Could not prefix so the view uses the warning style", got)
	}
	if !strings.Contains(got, "2 cached Cloud Storage bucket(s)") {
		t.Fatalf("status = %q", got)
	}
}

func TestGcpInventoryListEmptyReason(t *testing.T) {
	errBoom := errors.New("list failed")
	cases := []struct {
		name  string
		count int
		err   error
		want  models.InventoryEmptyReason
	}{
		{name: "genuine empty list", count: 0, err: nil, want: models.InventoryEmptyNoneFound},
		{name: "list failure with no rows", count: 0, err: errBoom, want: models.InventoryEmptyError},
		{name: "cached rows keep the list error", count: 2, err: errBoom, want: models.InventoryEmptyError},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := gcpInventoryListEmptyReason(tc.count, tc.err); got != tc.want {
				t.Fatalf("got %q want %q", got, tc.want)
			}
		})
	}
}
