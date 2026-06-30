// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"slices"
	"testing"
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