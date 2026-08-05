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
	clusters []models.GcpGkeCluster
	err      error
}

func (s *stubGcpGkeInventory) ListClusters(context.Context, models.ProfileSummary) ([]models.GcpGkeCluster, error) {
	if s.err != nil {
		return nil, s.err
	}
	return append([]models.GcpGkeCluster(nil), s.clusters...), nil
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
}
