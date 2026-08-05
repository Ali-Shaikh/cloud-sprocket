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

type stubGcpFunctionsInventory struct {
	functions []models.GcpCloudFunction
	err       error
}

func (s *stubGcpFunctionsInventory) ListFunctions(context.Context, models.ProfileSummary) ([]models.GcpCloudFunction, error) {
	if s.err != nil {
		return nil, s.err
	}
	return append([]models.GcpCloudFunction(nil), s.functions...), nil
}

func TestEnrichGcpFunctionsInventorySuccess(t *testing.T) {
	inv := &stubGcpFunctionsInventory{
		functions: []models.GcpCloudFunction{
			{Name: "alpha", Region: "us-central1", Runtime: "nodejs20"},
			{Name: "zeta", Region: "europe-west1", Runtime: "python311"},
		},
	}
	service := &Service{
		gcpFunctions: inv,
		preferences:  defaultServicePreferences(),
	}
	workspace := models.WorkspaceSnapshot{
		Provider: &models.ProviderSummary{ProviderID: "gcp"},
		Profile:  &models.ProfileSummary{ProfileID: "default"},
	}
	service.enrichGcpFunctionsInventory(&workspace, models.SessionSnapshot{}, nil)

	if len(workspace.GcpFunctions) != 2 {
		t.Fatalf("functions = %+v", workspace.GcpFunctions)
	}
	if !strings.Contains(workspace.GcpFunctionsStatusMessage, "Loaded 2") {
		t.Fatalf("status = %q", workspace.GcpFunctionsStatusMessage)
	}
}

func TestEnrichGcpFunctionsInventorySurfacesListError(t *testing.T) {
	inv := &stubGcpFunctionsInventory{err: errors.New("gcloud not authenticated")}
	service := &Service{
		gcpFunctions: inv,
		preferences:  defaultServicePreferences(),
	}
	workspace := models.WorkspaceSnapshot{
		Provider:     &models.ProviderSummary{ProviderID: "gcp"},
		Profile:      &models.ProfileSummary{ProfileID: "default"},
		GcpFunctions: []models.GcpCloudFunction{},
	}
	service.enrichGcpFunctionsInventory(&workspace, models.SessionSnapshot{}, nil)

	if len(workspace.GcpFunctions) != 0 {
		t.Fatalf("functions = %+v, want empty on error", workspace.GcpFunctions)
	}
	if !strings.Contains(workspace.GcpFunctionsStatusMessage, "Could not list Cloud Functions") {
		t.Fatalf("status = %q", workspace.GcpFunctionsStatusMessage)
	}
	if !strings.Contains(workspace.GcpFunctionsStatusMessage, "gcloud not authenticated") {
		t.Fatalf("status missing detail: %q", workspace.GcpFunctionsStatusMessage)
	}
}

func TestEnrichGcpFunctionsInventorySkipsWhenDisabled(t *testing.T) {
	inv := &stubGcpFunctionsInventory{
		functions: []models.GcpCloudFunction{{Name: "hidden"}},
	}
	service := &Service{
		gcpFunctions: inv,
		preferences: models.ServicePreferences{
			DisabledServices: map[string][]string{
				"gcp": {"gcp-functions"},
			},
		},
	}
	workspace := models.WorkspaceSnapshot{
		Provider: &models.ProviderSummary{ProviderID: "gcp"},
		Profile:  &models.ProfileSummary{ProfileID: "default"},
	}
	service.enrichGcpFunctionsInventory(&workspace, models.SessionSnapshot{}, nil)
	if len(workspace.GcpFunctions) != 0 {
		t.Fatalf("functions = %+v, want empty when disabled", workspace.GcpFunctions)
	}
}
