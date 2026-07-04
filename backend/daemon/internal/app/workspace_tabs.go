// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import "cloudsprocket/backend/daemon/internal/models"

const (
	workspaceTabCategoryWorkspace  = "workspace"
	workspaceTabCategoryService    = "service"
	workspaceTabCategoryTool       = "tool"
	workspaceTabCategoryComingSoon = "coming_soon"
)

func workspaceTabs(providerID string) []models.WorkspaceTab {
	tabs := []models.WorkspaceTab{
		workspaceOverviewTab(),
		workspaceVirtualisationTab(),
	}
	for _, entry := range serviceCatalogForProvider(providerID) {
		tabs = append(tabs, catalogEntryToTab(entry))
	}
	tabs = append(tabs, workspaceActivityTab())
	return tabs
}