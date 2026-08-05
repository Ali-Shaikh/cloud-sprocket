// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"

	"cloudsprocket/backend/daemon/internal/discovery"
	"cloudsprocket/backend/daemon/internal/models"
)

func (s *Service) azureWebApps(
	ctx context.Context,
	profile models.ProfileSummary,
	resourceGroup string,
) []models.AzureWebApp {
	const scope = "azure.web-apps"
	queryHash := profile.ProfileID + "|" + resourceGroup
	apps, err := s.azure.ListWebApps(ctx, profile, resourceGroup)
	if err == nil {
		_ = s.store.SaveResourceCache(ctx, scope, queryHash, apps, s.timestamp())
		return apps
	}
	var cached []models.AzureWebApp
	_, ok, cacheErr := s.store.LoadResourceCache(ctx, scope, queryHash, &cached)
	if cacheErr == nil && ok {
		return cached
	}
	return []models.AzureWebApp{}
}

func (s *Service) selectedAzureWebAppName(
	session models.SessionSnapshot,
	apps []models.AzureWebApp,
) string {
	if session.SelectedAzureWebAppName != "" {
		for _, app := range apps {
			if app.Name == session.SelectedAzureWebAppName {
				return session.SelectedAzureWebAppName
			}
		}
	}
	if len(apps) == 0 {
		return ""
	}
	return apps[0].Name
}

func (s *Service) enrichAzureAppServiceInventory(workspace *models.WorkspaceSnapshot, session models.SessionSnapshot, mu *sync.Mutex) {
	if workspace.Provider == nil ||
		workspace.Provider.ProviderID != "azure" ||
		workspace.Profile == nil ||
		s.azure == nil {
		return
	}
	ctx, cancel := s.withAzureTimeout(context.Background())
	defer cancel()
	profile := *workspace.Profile
	resourceGroup := workspace.SelectedAzureResourceGroup
	if resourceGroup == "" {
		resourceGroup = s.selectedAzureResourceGroup(session, workspace.AzureResourceGroups)
	}
	apps := s.azureWebApps(ctx, profile, resourceGroup)
	selectedApp := s.selectedAzureWebAppName(session, apps)

	var status string
	if isLocalFlociProfile(profile) {
		status = "App Service is not emulated by floci-az. Use a cloud Azure profile or deploy Azure Functions locally."
	} else if resourceGroup == "" {
		status = "Select an Azure resource group to browse App Service web apps."
	} else if len(apps) == 0 {
		status = fmt.Sprintf("No App Service web apps were returned for %s.", resourceGroup)
	} else {
		status = fmt.Sprintf("Loaded %d App Service web apps from %s.", len(apps), resourceGroup)
	}

	lockWorkspace(mu, func() {
		workspace.AzureWebApps = apps
		workspace.SelectedAzureWebAppName = selectedApp
		workspace.AzureAppServiceStatusMessage = status
	})
}

func (s *Service) activeAzureVMSelection(
	snapshot discovery.Snapshot,
	session models.SessionSnapshot,
	vmID string,
) (models.ProfileSummary, string, models.AzureVirtualMachine, error) {
	if !session.IsLocked || session.CurrentProviderID != "azure" {
		return models.ProfileSummary{}, "", models.AzureVirtualMachine{}, errors.New("open an Azure workspace before invoking virtual machine actions")
	}
	profile, ok := findProfile(filterProfiles(snapshot.Profiles, session.CurrentProviderID), session.SelectedProfileID)
	if !ok {
		return models.ProfileSummary{}, "", models.AzureVirtualMachine{}, errors.New("the workspace's Azure profile is not available")
	}
	resourceGroup := session.SelectedAzureResourceGroup
	if resourceGroup == "" {
		groups, _ := s.azureResourceGroups(context.Background(), profile)
		resourceGroup = s.selectedAzureResourceGroup(session, groups)
	}
	if resourceGroup == "" {
		return models.ProfileSummary{}, "", models.AzureVirtualMachine{}, errors.New("select a resource group before invoking virtual machine actions")
	}
	vms := s.azureVirtualMachines(context.Background(), profile, resourceGroup)
	targetID := strings.TrimSpace(vmID)
	if targetID == "" {
		targetID = s.selectedAzureVMID(session, vms)
	}
	if targetID == "" {
		return models.ProfileSummary{}, "", models.AzureVirtualMachine{}, errors.New("select a virtual machine before invoking an action")
	}
	for _, vm := range vms {
		if vm.VMID == targetID {
			return profile, resourceGroup, vm, nil
		}
	}
	return models.ProfileSummary{}, "", models.AzureVirtualMachine{}, fmt.Errorf("virtual machine %s was not found in %s", targetID, resourceGroup)
}
