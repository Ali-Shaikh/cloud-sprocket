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

func TestGCPWorkspaceTabsPromoteLiveServices(t *testing.T) {
	tabs := workspaceTabs("gcp")
	comingSoon := 0
	byID := map[string]*models.WorkspaceTab{}
	for index := range tabs {
		tab := tabs[index]
		if tab.Category == workspaceTabCategoryComingSoon {
			comingSoon++
		}
		byID[tab.TabID] = &tabs[index]
	}
	// All GCP service tabs are live; overview stays workspace (not coming_soon).
	if comingSoon != 0 {
		t.Fatalf("expected 0 GCP coming_soon tabs, got %d", comingSoon)
	}
	for _, id := range []string{"gcp-storage", "gcp-compute", "gcp-functions", "gcp-gke"} {
		tab := byID[id]
		if tab == nil {
			t.Fatalf("gcp workspace tabs missing %s", id)
		}
		if tab.Category != workspaceTabCategoryService {
			t.Fatalf("%s category = %q, want %q", id, tab.Category, workspaceTabCategoryService)
		}
	}
	if overview := byID["gcp-overview"]; overview != nil && overview.Category == workspaceTabCategoryComingSoon {
		t.Fatalf("gcp-overview must not be coming_soon")
	}
}
