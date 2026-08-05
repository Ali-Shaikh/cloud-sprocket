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

type stubGcpComputeInventory struct {
	instances []models.GcpComputeInstance
	err       error
}

func (s *stubGcpComputeInventory) ListInstances(context.Context, models.ProfileSummary) ([]models.GcpComputeInstance, error) {
	if s.err != nil {
		return nil, s.err
	}
	return append([]models.GcpComputeInstance(nil), s.instances...), nil
}

func TestEnrichGcpComputeInventorySuccess(t *testing.T) {
	inv := &stubGcpComputeInventory{
		instances: []models.GcpComputeInstance{
			{Name: "web-1", Zone: "us-central1-a", Status: "RUNNING"},
			{Name: "web-2", Zone: "europe-west1-b", Status: "TERMINATED"},
		},
	}
	service := &Service{
		gcpCompute:  inv,
		preferences: defaultServicePreferences(),
	}
	workspace := models.WorkspaceSnapshot{
		Provider: &models.ProviderSummary{ProviderID: "gcp"},
		Profile:  &models.ProfileSummary{ProfileID: "default", ProviderID: "gcp"},
	}
	service.enrichGcpComputeInventory(&workspace, models.SessionSnapshot{}, nil)

	if len(workspace.GcpComputeInstances) != 2 {
		t.Fatalf("instances = %+v", workspace.GcpComputeInstances)
	}
	if !strings.Contains(workspace.GcpComputeStatusMessage, "Loaded 2") {
		t.Fatalf("status = %q", workspace.GcpComputeStatusMessage)
	}
}

func TestEnrichGcpComputeInventorySurfacesListError(t *testing.T) {
	inv := &stubGcpComputeInventory{err: errors.New("gcloud not authenticated")}
	service := &Service{
		gcpCompute:  inv,
		preferences: defaultServicePreferences(),
	}
	workspace := models.WorkspaceSnapshot{
		Provider:            &models.ProviderSummary{ProviderID: "gcp"},
		Profile:             &models.ProfileSummary{ProfileID: "default", ProviderID: "gcp"},
		GcpComputeInstances: []models.GcpComputeInstance{},
	}
	service.enrichGcpComputeInventory(&workspace, models.SessionSnapshot{}, nil)

	if len(workspace.GcpComputeInstances) != 0 {
		t.Fatalf("instances = %+v, want empty on error", workspace.GcpComputeInstances)
	}
	if !strings.Contains(workspace.GcpComputeStatusMessage, "Could not list Compute Engine instances") {
		t.Fatalf("status = %q", workspace.GcpComputeStatusMessage)
	}
	if !strings.Contains(workspace.GcpComputeStatusMessage, "gcloud not authenticated") {
		t.Fatalf("status missing detail: %q", workspace.GcpComputeStatusMessage)
	}
}

func TestEnrichGcpComputeInventorySkipsWhenDisabled(t *testing.T) {
	inv := &stubGcpComputeInventory{
		instances: []models.GcpComputeInstance{{Name: "hidden"}},
	}
	service := &Service{
		gcpCompute: inv,
		preferences: models.ServicePreferences{
			DisabledServices: map[string][]string{
				"gcp": {"gcp-compute"},
			},
		},
	}
	workspace := models.WorkspaceSnapshot{
		Provider: &models.ProviderSummary{ProviderID: "gcp"},
		Profile:  &models.ProfileSummary{ProfileID: "default", ProviderID: "gcp"},
	}
	service.enrichGcpComputeInventory(&workspace, models.SessionSnapshot{}, nil)
	if len(workspace.GcpComputeInstances) != 0 {
		t.Fatalf("instances = %+v, want empty when disabled", workspace.GcpComputeInstances)
	}
}
