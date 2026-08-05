// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package azure

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"cloudsprocket/backend/daemon/internal/discovery"
	"cloudsprocket/backend/daemon/internal/models"
)

// ActiveStorageSelection resolves profile/account/container for storage actions.
// When requireContainer is true, a container must be available (session or first listed).
func ActiveStorageSelection(
	ctx context.Context,
	storage StorageWriter,
	snapshot discovery.Snapshot,
	session models.SessionSnapshot,
	requireContainer bool,
) (models.ProfileSummary, string, string, error) {
	profile, err := LockedAzureProfile(snapshot.Profiles, session, "open an Azure workspace before using storage actions")
	if err != nil {
		return models.ProfileSummary{}, "", "", err
	}
	accountName := strings.TrimSpace(session.SelectedAzureStorageAccount)
	if accountName == "" && storage != nil {
		if accounts, listErr := storage.ListStorageAccounts(ctx, profile); listErr == nil {
			accountName = firstStorageAccountName(session, accounts)
		}
	}
	if accountName == "" {
		return models.ProfileSummary{}, "", "", errors.New("select a storage account before using this action")
	}
	containerName := strings.TrimSpace(session.SelectedAzureBlobContainer)
	if requireContainer {
		if containerName == "" && storage != nil {
			if containers, listErr := storage.ListBlobContainers(ctx, profile, accountName); listErr == nil {
				containerName = firstBlobContainerName(session, containers)
			}
		}
		if containerName == "" {
			return models.ProfileSummary{}, "", "", errors.New("select a blob container before using this action")
		}
	}
	return profile, accountName, containerName, nil
}

func firstStorageAccountName(session models.SessionSnapshot, accounts []models.AzureStorageAccount) string {
	if session.SelectedAzureStorageAccount != "" {
		for _, account := range accounts {
			if account.Name == session.SelectedAzureStorageAccount {
				return session.SelectedAzureStorageAccount
			}
		}
	}
	if len(accounts) == 0 {
		return ""
	}
	return accounts[0].Name
}

func firstBlobContainerName(session models.SessionSnapshot, containers []models.AzureBlobContainer) string {
	if session.SelectedAzureBlobContainer != "" {
		for _, container := range containers {
			if container.Name == session.SelectedAzureBlobContainer {
				return session.SelectedAzureBlobContainer
			}
		}
	}
	if len(containers) == 0 {
		return ""
	}
	return containers[0].Name
}

// ActiveWebAppSelection resolves profile/resource group/app for App Service actions.
func ActiveWebAppSelection(
	ctx context.Context,
	webapps WebAppsWriter,
	snapshot discovery.Snapshot,
	session models.SessionSnapshot,
	appName string,
) (models.ProfileSummary, string, models.AzureWebApp, error) {
	profile, err := LockedAzureProfile(snapshot.Profiles, session, "open an Azure workspace before invoking web app actions")
	if err != nil {
		return models.ProfileSummary{}, "", models.AzureWebApp{}, err
	}
	resourceGroup := strings.TrimSpace(session.SelectedAzureResourceGroup)
	if resourceGroup == "" && webapps != nil {
		if groups, listErr := webapps.ListResourceGroups(ctx, profile); listErr == nil && len(groups) > 0 {
			if session.SelectedAzureResourceGroup != "" {
				for _, group := range groups {
					if group.Name == session.SelectedAzureResourceGroup {
						resourceGroup = group.Name
						break
					}
				}
			}
			if resourceGroup == "" {
				resourceGroup = groups[0].Name
			}
		}
	}
	if resourceGroup == "" {
		return models.ProfileSummary{}, "", models.AzureWebApp{}, errors.New("select a resource group before invoking web app actions")
	}
	targetName := strings.TrimSpace(appName)
	if targetName == "" {
		targetName = strings.TrimSpace(session.SelectedAzureWebAppName)
	}
	if targetName == "" {
		return models.ProfileSummary{}, "", models.AzureWebApp{}, errors.New("select a web app before invoking an action")
	}
	if webapps != nil {
		if apps, listErr := webapps.ListWebApps(ctx, profile, resourceGroup); listErr == nil {
			for _, app := range apps {
				if app.Name == targetName {
					return profile, resourceGroup, app, nil
				}
			}
		}
	}
	// Fall back to a minimal app identity when inventory is unavailable.
	return profile, resourceGroup, models.AzureWebApp{Name: targetName, ResourceGroup: resourceGroup}, nil
}

// ResourceGroupForPostgresServer finds the RG for a named Flexible Server.
func ResourceGroupForPostgresServer(servers []models.AzurePostgresServer, name string) string {
	for _, server := range servers {
		if server.Name == name {
			return server.ResourceGroup
		}
	}
	return ""
}

// ResourceGroupForFunctionApp finds the RG for a named Function App.
func ResourceGroupForFunctionApp(apps []models.AzureFunctionApp, appName string) string {
	for _, app := range apps {
		if app.Name == appName {
			return app.ResourceGroup
		}
	}
	return ""
}

// NormaliseWafPolicyMode validates and canonicalises the WAF policy mode.
func NormaliseWafPolicyMode(mode string) (string, error) {
	switch strings.ToLower(strings.TrimSpace(mode)) {
	case "prevention":
		return "Prevention", nil
	case "detection":
		return "Detection", nil
	default:
		return "", fmt.Errorf("WAF policy mode must be Prevention or Detection, got %q", mode)
	}
}

// ActiveVirtualMachineSelection resolves profile/resource group/VM for VM actions.
func ActiveVirtualMachineSelection(
	ctx context.Context,
	resourceGroups ResourceGroupsWriter,
	vms VirtualMachinesWriter,
	snapshot discovery.Snapshot,
	session models.SessionSnapshot,
	vmID string,
) (models.ProfileSummary, string, models.AzureVirtualMachine, error) {
	profile, err := LockedAzureProfile(snapshot.Profiles, session, "open an Azure workspace before invoking virtual machine actions")
	if err != nil {
		return models.ProfileSummary{}, "", models.AzureVirtualMachine{}, err
	}
	resourceGroup := strings.TrimSpace(session.SelectedAzureResourceGroup)
	if resourceGroup == "" && resourceGroups != nil {
		if groups, listErr := resourceGroups.ListResourceGroups(ctx, profile); listErr == nil && len(groups) > 0 {
			resourceGroup = selectedResourceGroupName(session, groups)
		}
	}
	if resourceGroup == "" {
		return models.ProfileSummary{}, "", models.AzureVirtualMachine{}, errors.New("select a resource group before invoking virtual machine actions")
	}
	targetID := strings.TrimSpace(vmID)
	if targetID == "" {
		targetID = strings.TrimSpace(session.SelectedAzureVMID)
	}
	var listed []models.AzureVirtualMachine
	if vms != nil {
		if machines, listErr := vms.ListVirtualMachines(ctx, profile, resourceGroup); listErr == nil {
			listed = machines
		}
	}
	if targetID == "" && len(listed) > 0 {
		targetID = listed[0].VMID
	}
	if targetID == "" {
		return models.ProfileSummary{}, "", models.AzureVirtualMachine{}, errors.New("select a virtual machine before invoking an action")
	}
	for _, vm := range listed {
		if vm.VMID == targetID || vm.Name == targetID {
			return profile, resourceGroup, vm, nil
		}
	}
	return models.ProfileSummary{}, "", models.AzureVirtualMachine{}, fmt.Errorf("virtual machine %s was not found in %s", targetID, resourceGroup)
}

func selectedResourceGroupName(session models.SessionSnapshot, groups []models.AzureResourceGroup) string {
	if session.SelectedAzureResourceGroup != "" {
		for _, group := range groups {
			if group.Name == session.SelectedAzureResourceGroup {
				return session.SelectedAzureResourceGroup
			}
		}
	}
	if len(groups) == 0 {
		return ""
	}
	return groups[0].Name
}

// ActiveFrontDoorSelection resolves profile/resource group/profile name for Front Door actions.
func ActiveFrontDoorSelection(
	ctx context.Context,
	frontDoor FrontDoorWriter,
	snapshot discovery.Snapshot,
	session models.SessionSnapshot,
	profileName string,
) (models.ProfileSummary, string, string, error) {
	profile, err := LockedAzureProfile(snapshot.Profiles, session, "open an Azure workspace before invoking Front Door actions")
	if err != nil {
		return models.ProfileSummary{}, "", "", err
	}
	var profiles []models.AzureFrontDoorProfile
	if frontDoor != nil {
		listed, listErr := frontDoor.ListFrontDoorProfiles(ctx, profile, false)
		if listErr == nil {
			profiles = listed
		}
	}
	targetProfile := strings.TrimSpace(profileName)
	if targetProfile == "" {
		targetProfile = strings.TrimSpace(session.SelectedAzureFrontDoorProfile)
	}
	if targetProfile == "" {
		targetProfile = firstFrontDoorProfileName(profiles)
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

func firstFrontDoorProfileName(profiles []models.AzureFrontDoorProfile) string {
	if len(profiles) == 0 {
		return ""
	}
	return profiles[0].Name
}

func resourceGroupForFrontDoorProfile(profiles []models.AzureFrontDoorProfile, name string) string {
	for _, item := range profiles {
		if item.Name == name {
			return item.ResourceGroup
		}
	}
	return ""
}
