// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"fmt"
	"sync"

	"cloudsprocket/backend/daemon/internal/models"
)

func (s *Service) azureFrontDoorProfiles(ctx context.Context, profile models.ProfileSummary, withWafLink bool) []models.AzureFrontDoorProfile {
	const scope = "azure.frontdoor-profiles"
	profiles, err := s.azure.ListFrontDoorProfiles(ctx, profile, withWafLink)
	if err == nil {
		_ = s.store.SaveResourceCache(ctx, scope, profile.ProfileID, profiles, s.timestamp())
		return profiles
	}
	var cached []models.AzureFrontDoorProfile
	if _, ok, cacheErr := s.store.LoadResourceCache(ctx, scope, profile.ProfileID, &cached); cacheErr == nil && ok {
		return cached
	}
	return []models.AzureFrontDoorProfile{}
}

func (s *Service) azureFrontDoorEndpoints(
	ctx context.Context,
	profile models.ProfileSummary,
	resourceGroup string,
	profileName string,
) []models.AzureFrontDoorEndpoint {
	if profileName == "" {
		return []models.AzureFrontDoorEndpoint{}
	}
	const scope = "azure.frontdoor-endpoints"
	hash := profile.ProfileID + "|" + resourceGroup + "|" + profileName
	endpoints, err := s.azure.ListFrontDoorEndpoints(ctx, profile, resourceGroup, profileName)
	if err == nil {
		_ = s.store.SaveResourceCache(ctx, scope, hash, endpoints, s.timestamp())
		return endpoints
	}
	var cached []models.AzureFrontDoorEndpoint
	if _, ok, cacheErr := s.store.LoadResourceCache(ctx, scope, hash, &cached); cacheErr == nil && ok {
		return cached
	}
	return []models.AzureFrontDoorEndpoint{}
}

func (s *Service) azureFrontDoorOriginGroups(
	ctx context.Context,
	profile models.ProfileSummary,
	resourceGroup string,
	profileName string,
) []models.AzureFrontDoorOriginGroup {
	if profileName == "" {
		return []models.AzureFrontDoorOriginGroup{}
	}
	const scope = "azure.frontdoor-origin-groups"
	hash := profile.ProfileID + "|" + resourceGroup + "|" + profileName
	groups, err := s.azure.ListFrontDoorOriginGroups(ctx, profile, resourceGroup, profileName)
	if err == nil {
		_ = s.store.SaveResourceCache(ctx, scope, hash, groups, s.timestamp())
		return groups
	}
	var cached []models.AzureFrontDoorOriginGroup
	if _, ok, cacheErr := s.store.LoadResourceCache(ctx, scope, hash, &cached); cacheErr == nil && ok {
		return cached
	}
	return []models.AzureFrontDoorOriginGroup{}
}

func (s *Service) azureFrontDoorOrigins(
	ctx context.Context,
	profile models.ProfileSummary,
	resourceGroup string,
	profileName string,
	originGroupName string,
) []models.AzureFrontDoorOrigin {
	if profileName == "" || originGroupName == "" {
		return []models.AzureFrontDoorOrigin{}
	}
	const scope = "azure.frontdoor-origins"
	hash := profile.ProfileID + "|" + resourceGroup + "|" + profileName + "|" + originGroupName
	origins, err := s.azure.ListFrontDoorOrigins(ctx, profile, resourceGroup, profileName, originGroupName)
	if err == nil {
		_ = s.store.SaveResourceCache(ctx, scope, hash, origins, s.timestamp())
		return origins
	}
	var cached []models.AzureFrontDoorOrigin
	if _, ok, cacheErr := s.store.LoadResourceCache(ctx, scope, hash, &cached); cacheErr == nil && ok {
		return cached
	}
	return []models.AzureFrontDoorOrigin{}
}

func frontDoorProfileNames(profiles []models.AzureFrontDoorProfile) []string {
	names := make([]string, 0, len(profiles))
	for _, item := range profiles {
		names = append(names, item.Name)
	}
	return names
}

func resourceGroupForFrontDoorProfile(profiles []models.AzureFrontDoorProfile, name string) string {
	for _, item := range profiles {
		if item.Name == name {
			return item.ResourceGroup
		}
	}
	return ""
}

func frontDoorEndpointNames(endpoints []models.AzureFrontDoorEndpoint) []string {
	names := make([]string, 0, len(endpoints))
	for _, item := range endpoints {
		names = append(names, item.Name)
	}
	return names
}

func frontDoorOriginGroupNames(groups []models.AzureFrontDoorOriginGroup) []string {
	names := make([]string, 0, len(groups))
	for _, item := range groups {
		names = append(names, item.Name)
	}
	return names
}

func (s *Service) enrichAzureFrontDoorInventory(
	workspace *models.WorkspaceSnapshot,
	session models.SessionSnapshot,
	opts azureEnrichmentOptions,
	mu *sync.Mutex,
) {
	if workspace.Provider == nil ||
		workspace.Provider.ProviderID != "azure" ||
		workspace.Profile == nil ||
		s.azure == nil {
		return
	}
	ctx, cancel := s.withAzureTimeout(context.Background())
	defer cancel()
	profile := *workspace.Profile

	if isLocalFlociProfile(profile) {
		lockWorkspace(mu, func() {
			workspace.AzureFrontDoorStatusMessage = "Front Door topology is cloud-only. Local Log Analytics may still surface access logs when configured."
			workspace.AzureFrontDoorProfiles = []models.AzureFrontDoorProfile{}
			workspace.AzureFrontDoorEndpoints = []models.AzureFrontDoorEndpoint{}
			workspace.AzureFrontDoorOriginGroups = []models.AzureFrontDoorOriginGroup{}
			workspace.AzureFrontDoorOrigins = []models.AzureFrontDoorOrigin{}
			markAzureInventory(workspace, "frontdoor", 0, models.InventoryEmptyUnavailable)
		})
		return
	}

	profiles := s.azureFrontDoorProfiles(ctx, profile, !opts.lightweight)
	profileName := selectedName(session.SelectedAzureFrontDoorProfile, frontDoorProfileNames(profiles))
	resourceGroup := resourceGroupForFrontDoorProfile(profiles, profileName)

	var (
		endpoints    []models.AzureFrontDoorEndpoint
		originGroups []models.AzureFrontDoorOriginGroup
		origins      []models.AzureFrontDoorOrigin
		endpoint     string
		originGroup  string
		status       string
	)

	if opts.lightweight {
		if len(profiles) == 0 {
			status = "No Azure Front Door profiles found."
		} else {
			status = fmt.Sprintf("Loaded %d Front Door profile(s). Open topology refresh for endpoints and origins.", len(profiles))
		}
	} else {
		endpoints = s.azureFrontDoorEndpoints(ctx, profile, resourceGroup, profileName)
		endpoint = selectedName(session.SelectedAzureFrontDoorEndpoint, frontDoorEndpointNames(endpoints))
		originGroups = s.azureFrontDoorOriginGroups(ctx, profile, resourceGroup, profileName)
		originGroup = selectedName(session.SelectedAzureFrontDoorOriginGroup, frontDoorOriginGroupNames(originGroups))
		origins = s.azureFrontDoorOrigins(ctx, profile, resourceGroup, profileName, originGroup)

		if len(profiles) == 0 {
			status = "No Azure Front Door profiles found."
		} else {
			status = fmt.Sprintf(
				"Loaded %d profile(s), %d endpoint(s), %d origin group(s), %d origin(s).",
				len(profiles),
				len(endpoints),
				len(originGroups),
				len(origins),
			)
		}
	}

	lockWorkspace(mu, func() {
		workspace.AzureFrontDoorProfiles = profiles
		workspace.SelectedAzureFrontDoorProfile = profileName
		workspace.AzureFrontDoorEndpoints = endpoints
		workspace.SelectedAzureFrontDoorEndpoint = endpoint
		workspace.AzureFrontDoorOriginGroups = originGroups
		workspace.SelectedAzureFrontDoorOriginGroup = originGroup
		workspace.AzureFrontDoorOrigins = origins
		workspace.AzureFrontDoorStatusMessage = status
		markAzureInventory(workspace, "frontdoor", len(profiles), models.InventoryEmptyNoneFound)
	})
}
