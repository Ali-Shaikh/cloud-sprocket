// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"slices"
	"testing"

	"cloudsprocket/backend/daemon/internal/models"
)

func TestAzureWorkspaceTabsIncludePostgres(t *testing.T) {
	tabs := workspaceTabs("azure")
	ids := make([]string, 0, len(tabs))
	for _, tab := range tabs {
		ids = append(ids, tab.TabID)
	}
	if !slices.Contains(ids, "azure-postgres") {
		t.Fatalf("azure workspace tabs missing azure-postgres: %v", ids)
	}
	if !slices.Contains(ids, "azure-cosmos") {
		t.Fatalf("azure workspace tabs missing azure-cosmos: %v", ids)
	}
}

func TestGCPWorkspaceTabsMarkFutureServicesAsComingSoon(t *testing.T) {
	tabs := workspaceTabs("gcp")
	comingSoon := 0
	var storage *models.WorkspaceTab
	for index := range tabs {
		tab := tabs[index]
		if tab.Category == workspaceTabCategoryComingSoon {
			comingSoon++
		}
		if tab.TabID == "gcp-storage" {
			storage = &tabs[index]
		}
	}
	// Cloud Storage is live; remaining GCP services stay coming_soon for now.
	if comingSoon < 2 {
		t.Fatalf("expected at least 2 GCP coming_soon tabs, got %d", comingSoon)
	}
	if storage == nil {
		t.Fatal("gcp workspace tabs missing gcp-storage")
	}
	if storage.Category != workspaceTabCategoryService {
		t.Fatalf("gcp-storage category = %q, want %q", storage.Category, workspaceTabCategoryService)
	}
}