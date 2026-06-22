// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"

	"cloudsprocket/backend/daemon/internal/discovery"
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

	lockWorkspace(mu, func() {
		workspace.AzureFrontDoorProfiles = profiles
		workspace.SelectedAzureFrontDoorProfile = profileName
		workspace.AzureFrontDoorEndpoints = endpoints
		workspace.SelectedAzureFrontDoorEndpoint = endpoint
		workspace.AzureFrontDoorOriginGroups = originGroups
		workspace.SelectedAzureFrontDoorOriginGroup = originGroup
		workspace.AzureFrontDoorOrigins = origins
		workspace.AzureFrontDoorStatusMessage = status
	})
}

func (s *Service) handleAzureFrontDoorSelectProfile(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		Profile string `json:"profile"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAzureWorkspace(ctx, "open an Azure workspace before selecting a Front Door profile", func(session *models.SessionSnapshot) error {
		session.SelectedAzureFrontDoorProfile = request.Profile
		session.SelectedAzureFrontDoorEndpoint = ""
		session.SelectedAzureFrontDoorOriginGroup = ""
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAzureWorkspaceOpts(ctx, snapshot, session, notifier, workspaceSnapshotOptions{
		skipAwsInventory: true,
		azureScope:       "frontdoor",
	}, "", "")
}

func (s *Service) handleAzureFrontDoorSelectEndpoint(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		Endpoint string `json:"endpoint"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAzureWorkspace(ctx, "open an Azure workspace before selecting a Front Door endpoint", func(session *models.SessionSnapshot) error {
		session.SelectedAzureFrontDoorEndpoint = request.Endpoint
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAzureWorkspaceOpts(ctx, snapshot, session, notifier, workspaceSnapshotOptions{
		skipAwsInventory: true,
		azureScope:       "frontdoor",
	}, "", "")
}

func (s *Service) handleAzureFrontDoorSelectOriginGroup(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		OriginGroup string `json:"originGroup"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAzureWorkspace(ctx, "open an Azure workspace before selecting a Front Door origin group", func(session *models.SessionSnapshot) error {
		session.SelectedAzureFrontDoorOriginGroup = request.OriginGroup
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAzureWorkspaceOpts(ctx, snapshot, session, notifier, workspaceSnapshotOptions{
		skipAwsInventory: true,
		azureScope:       "frontdoor",
	}, "", "")
}

func (s *Service) handleAzureFrontDoorRefresh(ctx context.Context, _ json.RawMessage, notifier Notifier) (any, error) {
	snapshot, session, err := s.withLockedAzureWorkspace(ctx, "open an Azure workspace before refreshing Front Door topology", nil)
	if err != nil {
		return nil, err
	}
	return s.finishAzureWorkspaceOpts(ctx, snapshot, session, notifier, workspaceSnapshotOptions{
		skipAwsInventory: true,
		azureScope:       "frontdoor",
	}, "", "")
}

func (s *Service) handleAzureFrontDoorPurgeCache(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		ProfileName  string   `json:"profileName"`
		EndpointName string   `json:"endpointName"`
		ContentPaths []string `json:"contentPaths"`
		Domains      []string `json:"domains"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	endpointName := strings.TrimSpace(request.EndpointName)
	if endpointName == "" {
		return nil, errors.New("an endpoint name is required")
	}
	contentPaths := make([]string, 0, len(request.ContentPaths))
	for _, path := range request.ContentPaths {
		trimmed := strings.TrimSpace(path)
		if trimmed != "" {
			contentPaths = append(contentPaths, trimmed)
		}
	}
	if len(contentPaths) == 0 {
		contentPaths = []string{"/*"}
	}
	domains := make([]string, 0, len(request.Domains))
	for _, domain := range request.Domains {
		trimmed := strings.TrimSpace(domain)
		if trimmed != "" {
			domains = append(domains, trimmed)
		}
	}

	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	s.mu.Lock()
	session, err := s.currentState(ctx, snapshot)
	if err != nil {
		s.mu.Unlock()
		return nil, err
	}
	profile, resourceGroup, profileName, err := s.activeAzureFrontDoorSelection(snapshot, session, request.ProfileName)
	if err != nil {
		s.mu.Unlock()
		return nil, err
	}
	if !effectiveAzureWritesEnabled(session, profile, s.azureProviderCommandPath(snapshot)) {
		s.mu.Unlock()
		return nil, errors.New("Front Door cache purge requires write mode to be enabled for this Azure workspace")
	}
	s.mu.Unlock()

	timeoutCtx, cancel := s.withAzureTimeout(ctx)
	defer cancel()
	if err := s.azure.PurgeFrontDoorEndpointCache(
		timeoutCtx,
		profile,
		resourceGroup,
		profileName,
		endpointName,
		contentPaths,
		domains,
	); err != nil {
		return nil, err
	}
	return s.finishAzureWorkspaceOpts(ctx, snapshot, session, notifier, workspaceSnapshotOptions{
		skipAwsInventory: true,
		azureScope:       "frontdoor",
	}, "success", fmt.Sprintf("Purged Front Door cache for endpoint %s.", endpointName))
}

func (s *Service) activeAzureFrontDoorSelection(
	snapshot discovery.Snapshot,
	session models.SessionSnapshot,
	profileName string,
) (models.ProfileSummary, string, string, error) {
	if !session.IsLocked || session.CurrentProviderID != "azure" {
		return models.ProfileSummary{}, "", "", errors.New("open an Azure workspace before invoking Front Door actions")
	}
	profile, ok := findProfile(filterProfiles(snapshot.Profiles, session.CurrentProviderID), session.SelectedProfileID)
	if !ok {
		return models.ProfileSummary{}, "", "", errors.New("the workspace's Azure profile is not available")
	}
	profiles := s.azureFrontDoorProfiles(context.Background(), profile, false)
	targetProfile := strings.TrimSpace(profileName)
	if targetProfile == "" {
		targetProfile = session.SelectedAzureFrontDoorProfile
	}
	if targetProfile == "" {
		targetProfile = selectedName("", frontDoorProfileNames(profiles))
	}
	if targetProfile == "" {
		return models.ProfileSummary{}, "", "", errors.New("select a Front Door profile before invoking an action")
	}
	resourceGroup := resourceGroupForFrontDoorProfile(profiles, targetProfile)
	if resourceGroup == "" {
		return models.ProfileSummary{}, "", "", fmt.Errorf("Front Door profile %s was not found", targetProfile)
	}
	return profile, resourceGroup, targetProfile, nil
}
