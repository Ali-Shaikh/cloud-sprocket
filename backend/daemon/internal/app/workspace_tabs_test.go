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
	for _, tab := range tabs {
		if tab.Category == workspaceTabCategoryComingSoon {
			comingSoon++
		}
	}
	if comingSoon < 3 {
		t.Fatalf("expected at least 3 GCP coming_soon tabs, got %d", comingSoon)
	}
	if !slices.ContainsFunc(tabs, func(tab models.WorkspaceTab) bool { return tab.TabID == "gcp-storage" }) {
		t.Fatal("gcp workspace tabs missing gcp-storage")
	}
}