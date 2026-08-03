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

type stubGcpStorageInventory struct {
	buckets []models.GcpStorageBucket
	err     error
	calls   int
}

func (s *stubGcpStorageInventory) ListBuckets(context.Context, models.ProfileSummary) ([]models.GcpStorageBucket, error) {
	s.calls++
	if s.err != nil {
		return nil, s.err
	}
	return append([]models.GcpStorageBucket(nil), s.buckets...), nil
}

func TestEnrichGcpStorageInventorySuccess(t *testing.T) {
	inv := &stubGcpStorageInventory{
		buckets: []models.GcpStorageBucket{
			{Name: "alpha", Location: "US"},
			{Name: "beta", Location: "EU"},
		},
	}
	service := &Service{
		gcpStorage:  inv,
		preferences: defaultServicePreferences(),
	}
	workspace := models.WorkspaceSnapshot{
		Provider: &models.ProviderSummary{ProviderID: "gcp"},
		Profile:  &models.ProfileSummary{ProviderID: "gcp", ProfileID: "default"},
	}
	service.enrichGcpStorageInventory(&workspace, models.SessionSnapshot{}, nil)
	if inv.calls != 1 {
		t.Fatalf("calls = %d", inv.calls)
	}
	if len(workspace.GcpStorageBuckets) != 2 {
		t.Fatalf("buckets = %+v", workspace.GcpStorageBuckets)
	}
	if !strings.Contains(workspace.GcpStorageStatusMessage, "Loaded 2") {
		t.Fatalf("status = %q", workspace.GcpStorageStatusMessage)
	}
}

func TestEnrichGcpStorageInventorySurfacesListError(t *testing.T) {
	inv := &stubGcpStorageInventory{err: errors.New("gcloud not authenticated")}
	service := &Service{
		gcpStorage:  inv,
		preferences: defaultServicePreferences(),
	}
	workspace := models.WorkspaceSnapshot{
		Provider: &models.ProviderSummary{ProviderID: "gcp", Label: "GCP"},
		Profile: &models.ProfileSummary{
			ProviderID: "gcp",
			ProfileID:  "default",
			Attributes: []models.DetailField{{Label: "Project", Value: "demo"}},
		},
		GcpStorageBuckets: []models.GcpStorageBucket{},
	}
	service.enrichGcpStorageInventory(&workspace, models.SessionSnapshot{}, nil)
	if inv.calls != 1 {
		t.Fatalf("ListBuckets calls = %d, want 1", inv.calls)
	}
	if len(workspace.GcpStorageBuckets) != 0 {
		t.Fatalf("buckets = %+v, want empty on error", workspace.GcpStorageBuckets)
	}
	if !strings.Contains(workspace.GcpStorageStatusMessage, "Could not list Cloud Storage buckets") {
		t.Fatalf("status = %q", workspace.GcpStorageStatusMessage)
	}
	if !strings.Contains(workspace.GcpStorageStatusMessage, "gcloud not authenticated") {
		t.Fatalf("status missing detail: %q", workspace.GcpStorageStatusMessage)
	}
}

func TestEnrichGcpStorageInventorySkipsWhenDisabled(t *testing.T) {
	inv := &stubGcpStorageInventory{
		buckets: []models.GcpStorageBucket{{Name: "hidden"}},
	}
	service := &Service{
		gcpStorage: inv,
		preferences: models.ServicePreferences{
			DisabledServices: map[string][]string{
				"gcp": {"gcp-storage"},
			},
		},
	}
	workspace := models.WorkspaceSnapshot{
		Provider: &models.ProviderSummary{ProviderID: "gcp"},
		Profile:  &models.ProfileSummary{ProviderID: "gcp", ProfileID: "default"},
	}
	service.enrichGcpStorageInventory(&workspace, models.SessionSnapshot{}, nil)
	if inv.calls != 0 {
		t.Fatalf("ListBuckets calls = %d, want 0 when service disabled", inv.calls)
	}
}
