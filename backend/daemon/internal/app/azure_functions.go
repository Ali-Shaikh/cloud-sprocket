package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

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

func (s *Service) enrichAzureFunctionsInventory(workspace *models.WorkspaceSnapshot, session models.SessionSnapshot) {
	if workspace.Provider == nil ||
		workspace.Provider.ProviderID != "azure" ||
		workspace.Profile == nil ||
		s.azure == nil {
		return
	}
	ctx, cancel := s.withAzureTimeout(context.Background())
	defer cancel()
	workspace.AzureFunctionApps = s.azureFunctionApps(ctx, *workspace.Profile)
	workspace.SelectedAzureFunctionApp = s.selectedAzureFunctionApp(session, workspace.AzureFunctionApps)
	resourceGroup := resourceGroupForApp(workspace.AzureFunctionApps, workspace.SelectedAzureFunctionApp)
	workspace.AzureFunctions = s.azureFunctions(ctx, *workspace.Profile, resourceGroup, workspace.SelectedAzureFunctionApp)
	workspace.SelectedAzureFunction = s.selectedAzureFunction(session, workspace.AzureFunctions)
	if len(workspace.AzureFunctionApps) == 0 {
		workspace.AzureFunctionsStatusMessage = "No Function Apps found. Deploy one, then browse and invoke functions here."
		return
	}
	workspace.AzureFunctionsStatusMessage = fmt.Sprintf(
		"Loaded %d Function App(s).",
		len(workspace.AzureFunctionApps),
	)
}

func (s *Service) handleAzureFunctionsSelectApp(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		AppName string `json:"appName"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAzureWorkspace(ctx, "open an Azure workspace before selecting a Function App", func(session *models.SessionSnapshot) error {
		session.SelectedAzureFunctionApp = strings.TrimSpace(request.AppName)
		session.SelectedAzureFunction = ""
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAzureWorkspace(ctx, snapshot, session, notifier, "", "")
}

func (s *Service) handleAzureFunctionsSelectFunction(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		FunctionName string `json:"functionName"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAzureWorkspace(ctx, "open an Azure workspace before selecting a function", func(session *models.SessionSnapshot) error {
		session.SelectedAzureFunction = strings.TrimSpace(request.FunctionName)
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAzureWorkspace(ctx, snapshot, session, notifier, "", "")
}

func (s *Service) handleAzureFunctionsInvoke(ctx context.Context, params json.RawMessage, _ Notifier) (any, error) {
	var request struct {
		AppName      string `json:"appName"`
		FunctionName string `json:"functionName"`
		Payload      string `json:"payload"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	appName := strings.TrimSpace(request.AppName)
	functionName := strings.TrimSpace(request.FunctionName)
	if appName == "" || functionName == "" {
		return nil, errors.New("a function app and function are required")
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
	if !session.IsLocked || session.CurrentProviderID != "azure" {
		s.mu.Unlock()
		return nil, errors.New("open a locked Azure workspace before invoking a function")
	}
	profile, ok := findProfile(filterProfiles(snapshot.Profiles, session.CurrentProviderID), session.SelectedProfileID)
	if !ok {
		s.mu.Unlock()
		return nil, errors.New("the workspace's Azure profile is not available")
	}
	if !effectiveAzureWritesEnabled(session, profile, s.azureProviderCommandPath(snapshot)) {
		s.mu.Unlock()
		return nil, errors.New("invoking a function requires write mode to be enabled for this Azure workspace")
	}
	s.mu.Unlock()

	timeoutCtx, cancel := s.withAzureTimeout(ctx)
	defer cancel()
	resourceGroup := resourceGroupForApp(s.azureFunctionApps(timeoutCtx, profile), appName)
	return s.azure.InvokeFunction(ctx, profile, resourceGroup, appName, functionName, request.Payload)
}
