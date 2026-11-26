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

type stubGcpGkeInventory struct {
	clusters           []models.GcpGkeCluster
	nodePools          []models.GcpGkeNodePool
	err                error
	poolsErr           error
	listCalls          int
	listPools          int
	credentialCalls    int
	credentialLocation string
}

func (s *stubGcpGkeInventory) GetClusterCredentials(_ context.Context, _ models.ProfileSummary, _, location string) error {
	s.credentialCalls++
	s.credentialLocation = location
	return nil
}

func (s *stubGcpGkeInventory) ListClusters(context.Context, models.ProfileSummary) ([]models.GcpGkeCluster, error) {
	s.listCalls++
	if s.err != nil {
		return nil, s.err
	}
	return append([]models.GcpGkeCluster(nil), s.clusters...), nil
}

func (s *stubGcpGkeInventory) ListNodePools(_ context.Context, _ models.ProfileSummary, clusterName string, location string) ([]models.GcpGkeNodePool, error) {
	s.listPools++
	if s.poolsErr != nil {
		return nil, s.poolsErr
	}
	if clusterName == "" || location == "" {
		return nil, errors.New("cluster and location required")
	}
	return append([]models.GcpGkeNodePool(nil), s.nodePools...), nil
}

func TestEnrichGcpGkeInventorySuccess(t *testing.T) {
	inv := &stubGcpGkeInventory{
		clusters: []models.GcpGkeCluster{
			{Name: "alpha", Location: "us-central1", Status: "RUNNING"},
			{Name: "zeta", Location: "europe-west1", Status: "RUNNING"},
		},
	}
	service := &Service{
		gcpGke:      inv,
		preferences: defaultServicePreferences(),
	}
	workspace := models.WorkspaceSnapshot{
		Provider: &models.ProviderSummary{ProviderID: "gcp"},
		Profile:  &models.ProfileSummary{ProfileID: "default"},
	}
	service.enrichGcpGkeInventory(&workspace, models.SessionSnapshot{}, nil)

	if len(workspace.GcpGkeClusters) != 2 {
		t.Fatalf("clusters = %+v", workspace.GcpGkeClusters)
	}
	if !strings.Contains(workspace.GcpGkeStatusMessage, "Loaded 2") {
		t.Fatalf("status = %q", workspace.GcpGkeStatusMessage)
	}
	if !strings.Contains(workspace.GcpGkeStatusMessage, "Select a cluster") {
		t.Fatalf("status missing select hint: %q", workspace.GcpGkeStatusMessage)
	}
	if inv.listPools != 0 {
		t.Fatalf("listPools calls = %d, want 0 without selection", inv.listPools)
	}
	state := workspace.GcpInventory["gke"]
	if !state.Loaded || state.EmptyReason != "" {
		t.Fatalf("inventory = %+v, want loaded with rows", state)
	}
}

func TestHandleGcpGkeGetCredentialsUsesSelectedLocation(t *testing.T) {
	ctx := context.Background()
	inv := &stubGcpGkeInventory{clusters: []models.GcpGkeCluster{
		{Name: "prod-gke", Location: "us-central1"},
		{Name: "prod-gke", Location: "europe-west1-b"},
	}}
	service := gcpStorageTestService(t, &stubGcpStorageInventory{})
	service.gcpGke = inv
	lockGcpWorkspace(t, service)

	request := []byte(`{"clusterName":"prod-gke","location":"europe-west1-b"}`)
	if _, err := service.Handle(ctx, "gcp.gke.getCredentials", request, nil); err == nil ||
		!strings.Contains(err.Error(), "write mode") || inv.credentialCalls != 0 {
		t.Fatalf("read-only credentials: error=%v calls=%d", err, inv.credentialCalls)
	}
	if _, err := service.Handle(ctx, "session.setWriteMode", []byte(`{"enabled":true}`), nil); err != nil {
		t.Fatalf("setWriteMode: %v", err)
	}
	legacy := []byte(`{"clusterName":"prod-gke"}`)
	if _, err := service.Handle(ctx, "gcp.gke.selectCluster", legacy, nil); err != nil {
		t.Fatalf("selectCluster without location: %v", err)
	}
	if _, err := service.Handle(ctx, "gcp.gke.getCredentials", request, nil); err == nil || inv.credentialCalls != 0 {
		t.Fatalf("ambiguous cluster: error=%v calls=%d", err, inv.credentialCalls)
	}
	result, err := service.Handle(ctx, "gcp.gke.selectCluster", request, nil)
	if err != nil {
		t.Fatalf("selectCluster: %v", err)
	}
	if workspace := result.(models.WorkspaceSnapshot); workspace.SelectedGcpGkeClusterLocation != "europe-west1-b" {
		t.Fatalf("workspace location = %q", workspace.SelectedGcpGkeClusterLocation)
	}
	other := []byte(`{"clusterName":"prod-gke","location":"us-central1"}`)
	if _, err := service.Handle(ctx, "gcp.gke.getCredentials", other, nil); err == nil || inv.credentialCalls != 0 {
		t.Fatalf("unselected cluster: error=%v calls=%d", err, inv.credentialCalls)
	}
	if _, err := service.Handle(ctx, "gcp.gke.getCredentials", request, nil); err != nil {
		t.Fatalf("getCredentials: %v", err)
	}
	if inv.credentialCalls != 1 || inv.credentialLocation != "europe-west1-b" {
		t.Fatalf("credential calls=%d location=%q", inv.credentialCalls, inv.credentialLocation)
	}
}

func TestEnrichGcpGkeInventoryLoadsNodePoolsForSelection(t *testing.T) {
	inv := &stubGcpGkeInventory{
		clusters: []models.GcpGkeCluster{
			{Name: "alpha", Location: "us-central1", Status: "RUNNING"},
		},
		nodePools: []models.GcpGkeNodePool{
			{Name: "default-pool", MachineType: "e2-medium", InitialNodeCount: 3},
		},
	}
	service := &Service{
		gcpGke:      inv,
		preferences: defaultServicePreferences(),
	}
	workspace := models.WorkspaceSnapshot{
		Provider: &models.ProviderSummary{ProviderID: "gcp"},
		Profile:  &models.ProfileSummary{ProfileID: "default"},
	}
	service.enrichGcpGkeInventory(&workspace, models.SessionSnapshot{
		SelectedGcpGkeCluster: "alpha",
	}, nil)

	if workspace.SelectedGcpGkeCluster != "alpha" {
		t.Fatalf("selected = %q", workspace.SelectedGcpGkeCluster)
	}
	if len(workspace.GcpGkeNodePools) != 1 || workspace.GcpGkeNodePools[0].Name != "default-pool" {
		t.Fatalf("node pools = %+v", workspace.GcpGkeNodePools)
	}
	if !strings.Contains(workspace.GcpGkeStatusMessage, "Loaded 1 node pool") {
		t.Fatalf("status = %q", workspace.GcpGkeStatusMessage)
	}
	if inv.listPools != 1 {
		t.Fatalf("listPools calls = %d, want 1", inv.listPools)
	}
}

func TestEnrichGcpGkeInventorySurfacesListError(t *testing.T) {
	inv := &stubGcpGkeInventory{err: errors.New("gcloud not authenticated")}
	service := &Service{
		gcpGke:      inv,
		preferences: defaultServicePreferences(),
	}
	workspace := models.WorkspaceSnapshot{
		Provider:       &models.ProviderSummary{ProviderID: "gcp"},
		Profile:        &models.ProfileSummary{ProfileID: "default"},
		GcpGkeClusters: []models.GcpGkeCluster{},
	}
	service.enrichGcpGkeInventory(&workspace, models.SessionSnapshot{}, nil)

	if len(workspace.GcpGkeClusters) != 0 {
		t.Fatalf("clusters = %+v, want empty on error", workspace.GcpGkeClusters)
	}
	if !strings.Contains(workspace.GcpGkeStatusMessage, "Could not list GKE clusters") {
		t.Fatalf("status = %q", workspace.GcpGkeStatusMessage)
	}
	if !strings.Contains(workspace.GcpGkeStatusMessage, "gcloud not authenticated") {
		t.Fatalf("status missing detail: %q", workspace.GcpGkeStatusMessage)
	}
	state := workspace.GcpInventory["gke"]
	if !state.Loaded || state.EmptyReason != models.InventoryEmptyError {
		t.Fatalf("inventory = %+v, want loaded error", state)
	}
}

func TestEnrichGcpGkeInventorySkipsWhenDisabled(t *testing.T) {
	inv := &stubGcpGkeInventory{
		clusters: []models.GcpGkeCluster{{Name: "hidden"}},
	}
	service := &Service{
		gcpGke: inv,
		preferences: models.ServicePreferences{
			DisabledServices: map[string][]string{
				"gcp": {"gcp-gke"},
			},
		},
	}
	workspace := models.WorkspaceSnapshot{
		Provider: &models.ProviderSummary{ProviderID: "gcp"},
		Profile:  &models.ProfileSummary{ProfileID: "default"},
	}
	service.enrichGcpGkeInventory(&workspace, models.SessionSnapshot{}, nil)
	if len(workspace.GcpGkeClusters) != 0 {
		t.Fatalf("clusters = %+v, want empty when disabled", workspace.GcpGkeClusters)
	}
	if workspace.GcpInventory["gke"].Loaded {
		t.Fatal("disabled service must not mark inventory loaded")
	}
	if inv.listCalls != 0 {
		t.Fatalf("listCalls = %d, want 0 when disabled", inv.listCalls)
	}
}
