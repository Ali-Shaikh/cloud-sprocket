// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"fmt"
	"sync"

	"cloudsprocket/backend/daemon/internal/models"
)

func (s *Service) azureFunctionApps(
	ctx context.Context,
	profile models.ProfileSummary,
) []models.AzureFunctionApp {
	const scope = "azure.function-apps"
	apps, err := s.azure.ListFunctionApps(ctx, profile)
	if err == nil {
		_ = s.store.SaveResourceCache(ctx, scope, profile.ProfileID, apps, s.timestamp())
		return apps
	}
	var cached []models.AzureFunctionApp
	_, ok, cacheErr := s.store.LoadResourceCache(ctx, scope, profile.ProfileID, &cached)
	if cacheErr == nil && ok {
		return cached
	}
	return []models.AzureFunctionApp{}
}

func (s *Service) azureFunctions(
	ctx context.Context,
	profile models.ProfileSummary,
	resourceGroup string,
	appName string,
) []models.AzureFunction {
	if appName == "" {
		return []models.AzureFunction{}
	}
	const scope = "azure.functions"
	queryHash := profile.ProfileID + "|" + appName
	functions, err := s.azure.ListFunctions(ctx, profile, resourceGroup, appName)
	if err == nil {
		_ = s.store.SaveResourceCache(ctx, scope, queryHash, functions, s.timestamp())
		return functions
	}
	var cached []models.AzureFunction
	_, ok, cacheErr := s.store.LoadResourceCache(ctx, scope, queryHash, &cached)
	if cacheErr == nil && ok {
		return cached
	}
	return []models.AzureFunction{}
}

func (s *Service) selectedAzureFunctionApp(
	session models.SessionSnapshot,
	apps []models.AzureFunctionApp,
) string {
	if session.SelectedAzureFunctionApp != "" {
		for _, app := range apps {
			if app.Name == session.SelectedAzureFunctionApp {
				return session.SelectedAzureFunctionApp
			}
		}
	}
	if len(apps) == 0 {
		return ""
	}
	return apps[0].Name
}

func (s *Service) selectedAzureFunction(
	session models.SessionSnapshot,
	functions []models.AzureFunction,
) string {
	if session.SelectedAzureFunction != "" {
		for _, fn := range functions {
			if fn.Name == session.SelectedAzureFunction {
				return session.SelectedAzureFunction
			}
		}
	}
	if len(functions) == 0 {
		return ""
	}
	return functions[0].Name
}

func resourceGroupForApp(apps []models.AzureFunctionApp, appName string) string {
	for _, app := range apps {
		if app.Name == appName {
			return app.ResourceGroup
		}
	}
	return ""
}

func (s *Service) enrichAzureFunctionsInventory(
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

	apps := s.azureFunctionApps(ctx, profile)
	selectedApp := s.selectedAzureFunctionApp(session, apps)

	var (
		functions        []models.AzureFunction
		selectedFunction string
		status           string
	)
	if opts.lightweight {
		if len(apps) == 0 {
			status = "No Function Apps found. Deploy one, then browse and invoke functions here."
		} else {
			status = fmt.Sprintf("Loaded %d Function App(s).", len(apps))
		}
		lockWorkspace(mu, func() {
			workspace.AzureFunctionApps = apps
			workspace.SelectedAzureFunctionApp = selectedApp
			workspace.AzureFunctions = []models.AzureFunction{}
			workspace.SelectedAzureFunction = ""
			workspace.AzureFunctionsStatusMessage = status
			markAzureInventory(workspace, "functions", len(apps), models.InventoryEmptyNoneFound)
		})
		return
	}

	resourceGroup := resourceGroupForApp(apps, selectedApp)
	functions = s.azureFunctions(ctx, profile, resourceGroup, selectedApp)
	selectedFunction = s.selectedAzureFunction(session, functions)
	if len(apps) == 0 {
		status = "No Function Apps found. Deploy one, then browse and invoke functions here."
	} else {
		status = fmt.Sprintf("Loaded %d Function App(s).", len(apps))
	}
	lockWorkspace(mu, func() {
		workspace.AzureFunctionApps = apps
		workspace.SelectedAzureFunctionApp = selectedApp
		workspace.AzureFunctions = functions
		workspace.SelectedAzureFunction = selectedFunction
		workspace.AzureFunctionsStatusMessage = status
		markAzureInventory(workspace, "functions", len(apps), models.InventoryEmptyNoneFound)
	})
}
