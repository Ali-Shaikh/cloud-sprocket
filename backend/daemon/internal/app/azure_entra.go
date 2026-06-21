// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"fmt"
	"sync"

	"cloudsprocket/backend/daemon/internal/models"
)

func (s *Service) azureEntraUsers(ctx context.Context, profile models.ProfileSummary) []models.AzureEntraUser {
	const scope = "azure.entra-users"
	users, err := s.azure.ListEntraUsers(ctx, profile)
	if err == nil {
		_ = s.store.SaveResourceCache(ctx, scope, profile.ProfileID, users, s.timestamp())
		return users
	}
	var cached []models.AzureEntraUser
	if _, ok, cacheErr := s.store.LoadResourceCache(ctx, scope, profile.ProfileID, &cached); cacheErr == nil && ok {
		return cached
	}
	return []models.AzureEntraUser{}
}

func (s *Service) azureEntraGroups(ctx context.Context, profile models.ProfileSummary) []models.AzureEntraGroup {
	const scope = "azure.entra-groups"
	groups, err := s.azure.ListEntraGroups(ctx, profile)
	if err == nil {
		_ = s.store.SaveResourceCache(ctx, scope, profile.ProfileID, groups, s.timestamp())
		return groups
	}
	var cached []models.AzureEntraGroup
	if _, ok, cacheErr := s.store.LoadResourceCache(ctx, scope, profile.ProfileID, &cached); cacheErr == nil && ok {
		return cached
	}
	return []models.AzureEntraGroup{}
}

func (s *Service) azureEntraApps(ctx context.Context, profile models.ProfileSummary) []models.AzureEntraApp {
	const scope = "azure.entra-apps"
	apps, err := s.azure.ListEntraAppRegistrations(ctx, profile)
	if err == nil {
		_ = s.store.SaveResourceCache(ctx, scope, profile.ProfileID, apps, s.timestamp())
		return apps
	}
	var cached []models.AzureEntraApp
	if _, ok, cacheErr := s.store.LoadResourceCache(ctx, scope, profile.ProfileID, &cached); cacheErr == nil && ok {
		return cached
	}
	return []models.AzureEntraApp{}
}

func (s *Service) enrichAzureEntraInventory(workspace *models.WorkspaceSnapshot, _ models.SessionSnapshot, mu *sync.Mutex) {
	if workspace.Provider == nil ||
		workspace.Provider.ProviderID != "azure" ||
		workspace.Profile == nil ||
		s.azure == nil {
		return
	}
	if isLocalFlociProfile(*workspace.Profile) {
		lockWorkspace(mu, func() {
			workspace.AzureEntraStatusMessage =
				"floci-az emulates the Entra token/OIDC plane only, not the directory. Use a cloud Azure profile to browse users, groups, and app registrations."
		})
		return
	}
	ctx, cancel := s.withAzureTimeout(context.Background())
	defer cancel()
	profile := *workspace.Profile

	var (
		users  []models.AzureEntraUser
		groups []models.AzureEntraGroup
		apps   []models.AzureEntraApp
		wg     sync.WaitGroup
	)
	wg.Add(3)
	go func() {
		defer wg.Done()
		users = s.azureEntraUsers(ctx, profile)
	}()
	go func() {
		defer wg.Done()
		groups = s.azureEntraGroups(ctx, profile)
	}()
	go func() {
		defer wg.Done()
		apps = s.azureEntraApps(ctx, profile)
	}()
	wg.Wait()

	status := fmt.Sprintf(
		"Loaded %d user(s), %d group(s), %d app registration(s).",
		len(users), len(groups), len(apps),
	)
	lockWorkspace(mu, func() {
		workspace.AzureEntraUsers = users
		workspace.AzureEntraGroups = groups
		workspace.AzureEntraApps = apps
		workspace.AzureEntraStatusMessage = status
	})
}
