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
