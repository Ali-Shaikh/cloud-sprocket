package app

import (
	"context"
	"fmt"

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

func (s *Service) enrichAzureEntraInventory(workspace *models.WorkspaceSnapshot, _ models.SessionSnapshot) {
	if workspace.Provider == nil ||
		workspace.Provider.ProviderID != "azure" ||
		workspace.Profile == nil ||
		s.azure == nil {
		return
	}
	if isLocalFlociProfile(*workspace.Profile) {
		workspace.AzureEntraStatusMessage =
			"floci-az emulates the Entra token/OIDC plane only, not the directory. Use a cloud Azure profile to browse users, groups, and app registrations."
		return
	}
	ctx, cancel := s.withAzureTimeout(context.Background())
	defer cancel()
	profile := *workspace.Profile

	workspace.AzureEntraUsers = s.azureEntraUsers(ctx, profile)
	workspace.AzureEntraGroups = s.azureEntraGroups(ctx, profile)
	workspace.AzureEntraApps = s.azureEntraApps(ctx, profile)
	workspace.AzureEntraStatusMessage = fmt.Sprintf(
		"Loaded %d user(s), %d group(s), %d app registration(s).",
		len(workspace.AzureEntraUsers), len(workspace.AzureEntraGroups), len(workspace.AzureEntraApps),
	)
}
