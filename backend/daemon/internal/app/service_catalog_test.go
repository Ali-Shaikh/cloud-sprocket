// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"slices"
	"testing"

	"cloudsprocket/backend/daemon/internal/models"
)

func TestAwsWorkspaceTabsIncludePhaseTwoServices(t *testing.T) {
	tabs := workspaceTabs("aws")
	ids := workspaceTabIDs(tabs)
	for _, expected := range []string{"ecs", "apigateway", "secrets"} {
		if !slices.Contains(ids, expected) {
			t.Fatalf("aws workspace tabs missing %s: %v", expected, ids)
		}
	}
}

func TestAwsInventoryScopesMatchCatalogue(t *testing.T) {
	scopes := awsInventoryScopesFromCatalog()
	for _, entry := range awsServiceCatalog() {
		if entry.InventoryScope == "" {
			continue
		}
		if _, ok := scopes[entry.InventoryScope]; !ok {
			t.Fatalf("catalogue scope %q missing from inventory scopes", entry.InventoryScope)
		}
	}
	entriesWithScope := 0
	for _, entry := range awsServiceCatalog() {
		if entry.InventoryScope != "" {
			entriesWithScope++
		}
	}
	if len(scopes) != entriesWithScope {
		t.Fatalf("scope count = %d, catalogue entries with scope = %d", len(scopes), entriesWithScope)
	}
}

func workspaceTabIDs(tabs []models.WorkspaceTab) []string {
	ids := make([]string, 0, len(tabs))
	for _, tab := range tabs {
		ids = append(ids, tab.TabID)
	}
	return ids
}