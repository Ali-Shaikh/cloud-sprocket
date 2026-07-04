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

func workspaceTabsForPreferences(
	providerID string,
	prefs models.ServicePreferences,
) []models.WorkspaceTab {
	service := &Service{preferences: prefs}
	tabs := []models.WorkspaceTab{
		workspaceOverviewTab(),
		workspaceVirtualisationTab(),
	}
	for _, entry := range serviceCatalogForProvider(providerID) {
		if !service.isServiceEnabledLocked(entry.ProviderID, entry.ServiceID) {
			continue
		}
		tabs = append(tabs, catalogEntryToTab(entry))
	}
	tabs = append(tabs, workspaceActivityTab())
	return tabs
}

func workspaceTabs(providerID string) []models.WorkspaceTab {
	return workspaceTabsForPreferences(providerID, defaultServicePreferences())
}

func (s *Service) workspaceTabs(providerID string) []models.WorkspaceTab {
	s.mu.Lock()
	prefs := s.preferences
	s.mu.Unlock()
	return workspaceTabsForPreferences(providerID, prefs)
}