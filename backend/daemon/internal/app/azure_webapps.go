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

func (s *Service) activeAzureWebAppSelection(
	snapshot discovery.Snapshot,
	session models.SessionSnapshot,
	appName string,
) (models.ProfileSummary, string, models.AzureWebApp, error) {
	if !session.IsLocked || session.CurrentProviderID != "azure" {
		return models.ProfileSummary{}, "", models.AzureWebApp{}, errors.New("open an Azure workspace before invoking web app actions")
	}
	profile, ok := findProfile(filterProfiles(snapshot.Profiles, session.CurrentProviderID), session.SelectedProfileID)
	if !ok {
		return models.ProfileSummary{}, "", models.AzureWebApp{}, errors.New("the workspace's Azure profile is not available")
	}
	resourceGroup := session.SelectedAzureResourceGroup
	if resourceGroup == "" {
		resourceGroup = s.selectedAzureResourceGroup(session, s.azureResourceGroups(context.Background(), profile))
	}
	if resourceGroup == "" {
		return models.ProfileSummary{}, "", models.AzureWebApp{}, errors.New("select a resource group before invoking web app actions")
	}
	targetName := strings.TrimSpace(appName)
	if targetName == "" {
		targetName = session.SelectedAzureWebAppName
	}
	if targetName == "" {
		return models.ProfileSummary{}, "", models.AzureWebApp{}, errors.New("select a web app before invoking an action")
	}
	for _, app := range s.azureWebApps(context.Background(), profile, resourceGroup) {
		if app.Name == targetName {
			return profile, resourceGroup, app, nil
		}
	}
	return models.ProfileSummary{}, "", models.AzureWebApp{}, fmt.Errorf("web app %s was not found in %s", targetName, resourceGroup)
}

func (s *Service) handleAzureWebAppsInvokeAction(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		Action  string `json:"action"`
		AppName string `json:"appName"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	action := strings.TrimSpace(request.Action)
	if action == "" {
		return nil, errors.New("web app action is required")
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
	profile, resourceGroup, app, err := s.activeAzureWebAppSelection(snapshot, session, request.AppName)
	if err != nil {
		s.mu.Unlock()
		return nil, err
	}
	if !effectiveAzureWritesEnabled(session, profile, s.azureProviderCommandPath(snapshot)) {
		s.mu.Unlock()
		return nil, errors.New("web app actions require write mode to be enabled for this Azure workspace")
	}
	s.mu.Unlock()

	timeoutCtx, cancel := s.withAzureTimeout(ctx)
	defer cancel()
	slotName := strings.TrimSpace(session.SelectedAzureWebAppSlot)
	if err := s.azure.InvokeWebAppAction(timeoutCtx, profile, resourceGroup, app.Name, action, slotName); err != nil {
		return nil, err
	}
	s.mu.Lock()
	session, err = s.currentState(ctx, snapshot)
	if err != nil {
		s.mu.Unlock()
		return nil, err
	}
	session.SelectedAzureResourceGroup = resourceGroup
	session.SelectedAzureWebAppName = app.Name
	if err := s.store.SaveSession(ctx, session); err != nil {
		s.mu.Unlock()
		return nil, err
	}
	s.mu.Unlock()
	return s.finishAzureWorkspaceOpts(ctx, snapshot, session, notifier, workspaceSnapshotOptions{
		skipAwsInventory: true,
		azureScope:       "webapps",
	}, "success", fmt.Sprintf("Invoked %s on web app %s.", action, app.Name))
}

func (s *Service) handleAzureWebAppsSetSetting(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		AppName     string `json:"appName"`
		Name        string `json:"name"`
		Value       string `json:"value"`
		SlotSetting bool   `json:"slotSetting"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	settingName := strings.TrimSpace(request.Name)
	if settingName == "" {
		return nil, errors.New("a setting name is required")
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
	profile, resourceGroup, app, err := s.activeAzureWebAppSelection(snapshot, session, request.AppName)
	if err != nil {
		s.mu.Unlock()
		return nil, err
	}
	if !effectiveAzureWritesEnabled(session, profile, s.azureProviderCommandPath(snapshot)) {
		s.mu.Unlock()
		return nil, errors.New("updating app settings requires write mode to be enabled for this Azure workspace")
	}
	s.mu.Unlock()

	timeoutCtx, cancel := s.withAzureTimeout(ctx)
	defer cancel()
	slotName := strings.TrimSpace(session.SelectedAzureWebAppSlot)
	if err := s.azure.SetWebAppSetting(timeoutCtx, profile, resourceGroup, app.Name, settingName, request.Value, request.SlotSetting, slotName); err != nil {
		return nil, err
	}
	s.mu.Lock()
	session, err = s.currentState(ctx, snapshot)
	if err != nil {
		s.mu.Unlock()
		return nil, err
	}
	session.SelectedAzureResourceGroup = resourceGroup
	session.SelectedAzureWebAppName = app.Name
	if err := s.store.SaveSession(ctx, session); err != nil {
		s.mu.Unlock()
		return nil, err
	}
	s.mu.Unlock()
	return s.finishAzureWorkspaceOpts(ctx, snapshot, session, notifier, workspaceSnapshotOptions{
		skipAwsInventory: true,
		azureScope:       "webapps",
	}, "success", fmt.Sprintf("Set application setting %s on web app %s.", settingName, app.Name))
}

func (s *Service) handleAzureWebAppsDeleteSetting(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		AppName string `json:"appName"`
		Name    string `json:"name"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	settingName := strings.TrimSpace(request.Name)
	if settingName == "" {
		return nil, errors.New("a setting name is required")
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
	profile, resourceGroup, app, err := s.activeAzureWebAppSelection(snapshot, session, request.AppName)
	if err != nil {
		s.mu.Unlock()
		return nil, err
	}
	if !effectiveAzureWritesEnabled(session, profile, s.azureProviderCommandPath(snapshot)) {
		s.mu.Unlock()
		return nil, errors.New("deleting app settings requires write mode to be enabled for this Azure workspace")
	}
	s.mu.Unlock()

	timeoutCtx, cancel := s.withAzureTimeout(ctx)
	defer cancel()
	slotName := strings.TrimSpace(session.SelectedAzureWebAppSlot)
	if err := s.azure.DeleteWebAppSetting(timeoutCtx, profile, resourceGroup, app.Name, settingName, slotName); err != nil {
		return nil, err
	}
	s.mu.Lock()
	session, err = s.currentState(ctx, snapshot)
	if err != nil {
		s.mu.Unlock()
		return nil, err
	}
	session.SelectedAzureResourceGroup = resourceGroup
	session.SelectedAzureWebAppName = app.Name
	if err := s.store.SaveSession(ctx, session); err != nil {
		s.mu.Unlock()
		return nil, err
	}
	s.mu.Unlock()
	return s.finishAzureWorkspaceOpts(ctx, snapshot, session, notifier, workspaceSnapshotOptions{
		skipAwsInventory: true,
		azureScope:       "webapps",
	}, "success", fmt.Sprintf("Deleted application setting %s from web app %s.", settingName, app.Name))
}

func (s *Service) handleAzureSelectWebApp(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		AppName string `json:"appName"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAzureWorkspace(ctx, "open an Azure workspace before selecting a web app", func(session *models.SessionSnapshot) error {
		session.SelectedAzureWebAppName = request.AppName
		session.SelectedAzureWebAppSlot = ""
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAzureWorkspaceOpts(ctx, snapshot, session, notifier, workspaceSnapshotOptions{
		skipAwsInventory: true,
		azureScope:       "webapps",
	}, "", "")
}

func (s *Service) handleAzureWebAppsSelectSlot(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		Slot string `json:"slot"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAzureWorkspace(ctx, "open an Azure workspace before selecting a deployment slot", func(session *models.SessionSnapshot) error {
		session.SelectedAzureWebAppSlot = strings.TrimSpace(request.Slot)
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAzureWorkspaceOpts(ctx, snapshot, session, notifier, workspaceSnapshotOptions{
		skipAwsInventory: true,
		azureScope:       "webapps",
	}, "", "")
}

func (s *Service) handleAzureWebAppsCreateSlot(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		AppName  string `json:"appName"`
		SlotName string `json:"slotName"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	slotName := strings.TrimSpace(request.SlotName)
	if slotName == "" {
		return nil, errors.New("a deployment slot name is required")
	}
	if strings.EqualFold(slotName, "production") {
		return nil, errors.New("production is not a valid deployment slot name")
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
	profile, resourceGroup, app, err := s.activeAzureWebAppSelection(snapshot, session, request.AppName)
	if err != nil {
		s.mu.Unlock()
		return nil, err
	}
	if !effectiveAzureWritesEnabled(session, profile, s.azureProviderCommandPath(snapshot)) {
		s.mu.Unlock()
		return nil, errors.New("deployment slot create requires write mode to be enabled for this Azure workspace")
	}
	s.mu.Unlock()

	timeoutCtx, cancel := s.withAzureTimeout(ctx)
	defer cancel()
	if err := s.azure.CreateWebAppDeploymentSlot(timeoutCtx, profile, resourceGroup, app.Name, slotName); err != nil {
		return nil, err
	}
	s.mu.Lock()
	session, err = s.currentState(ctx, snapshot)
	if err != nil {
		s.mu.Unlock()
		return nil, err
	}
	session.SelectedAzureResourceGroup = resourceGroup
	session.SelectedAzureWebAppName = app.Name
	session.SelectedAzureWebAppSlot = slotName
	if err := s.store.SaveSession(ctx, session); err != nil {
		s.mu.Unlock()
		return nil, err
	}
	s.mu.Unlock()
	return s.finishAzureWorkspaceOpts(ctx, snapshot, session, notifier, workspaceSnapshotOptions{
		skipAwsInventory: true,
		azureScope:       "webapps",
	}, "success", fmt.Sprintf("Created deployment slot %s on web app %s.", slotName, app.Name))
}

func (s *Service) handleAzureWebAppsSwapSlots(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		AppName  string `json:"appName"`
		SlotName string `json:"slotName"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	slotName := strings.TrimSpace(request.SlotName)
	if slotName == "" || strings.EqualFold(slotName, "production") {
		return nil, errors.New("select a non-production deployment slot before swapping")
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
	profile, resourceGroup, app, err := s.activeAzureWebAppSelection(snapshot, session, request.AppName)
	if err != nil {
		s.mu.Unlock()
		return nil, err
	}
	if !effectiveAzureWritesEnabled(session, profile, s.azureProviderCommandPath(snapshot)) {
		s.mu.Unlock()
		return nil, errors.New("deployment slot swap requires write mode to be enabled for this Azure workspace")
	}
	s.mu.Unlock()

	timeoutCtx, cancel := s.withAzureTimeout(ctx)
	defer cancel()
	if err := s.azure.SwapWebAppDeploymentSlots(timeoutCtx, profile, resourceGroup, app.Name, slotName); err != nil {
		return nil, err
	}
	s.mu.Lock()
	session, err = s.currentState(ctx, snapshot)
	if err != nil {
		s.mu.Unlock()
		return nil, err
	}
	session.SelectedAzureResourceGroup = resourceGroup
	session.SelectedAzureWebAppName = app.Name
	session.SelectedAzureWebAppSlot = ""
	if err := s.store.SaveSession(ctx, session); err != nil {
		s.mu.Unlock()
		return nil, err
	}
	s.mu.Unlock()
	return s.finishAzureWorkspaceOpts(ctx, snapshot, session, notifier, workspaceSnapshotOptions{
		skipAwsInventory: true,
		azureScope:       "webapps",
	}, "success", fmt.Sprintf("Swapped production with deployment slot %s on web app %s.", slotName, app.Name))
}

func (s *Service) handleAzureWebAppsCreate(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		ResourceGroup    string `json:"resourceGroup"`
		AppName          string `json:"appName"`
		Location         string `json:"location"`
		Runtime          string `json:"runtime"`
		ExistingPlanName string `json:"existingPlanName"`
		NewPlanName      string `json:"newPlanName"`
		PlanSKU          string `json:"planSku"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	resourceGroup := strings.TrimSpace(request.ResourceGroup)
	appName := strings.TrimSpace(request.AppName)
	if resourceGroup == "" || appName == "" {
		return nil, errors.New("resource group and app name are required")
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
		return nil, errors.New("open a locked Azure workspace before creating a web app")
	}
	profile, ok := findProfile(filterProfiles(snapshot.Profiles, session.CurrentProviderID), session.SelectedProfileID)
	if !ok {
		s.mu.Unlock()
		return nil, errors.New("the workspace's Azure profile is not available")
	}
	if !effectiveAzureWritesEnabled(session, profile, s.azureProviderCommandPath(snapshot)) {
		s.mu.Unlock()
		return nil, errors.New("web app create requires write mode to be enabled for this Azure workspace")
	}
	s.mu.Unlock()

	timeoutCtx, cancel := s.withAzureTimeout(ctx)
	defer cancel()
	created, err := s.azure.CreateWebApp(
		timeoutCtx,
		profile,
		resourceGroup,
		appName,
		request.Location,
		request.Runtime,
		request.ExistingPlanName,
		request.NewPlanName,
		request.PlanSKU,
	)
	if err != nil {
		return nil, err
	}
	s.mu.Lock()
	session, err = s.currentState(ctx, snapshot)
	if err != nil {
		s.mu.Unlock()
		return nil, err
	}
	session.SelectedAzureResourceGroup = resourceGroup
	session.SelectedAzureWebAppName = created.Name
	if err := s.store.SaveSession(ctx, session); err != nil {
		s.mu.Unlock()
		return nil, err
	}
	s.mu.Unlock()
	return s.finishAzureWorkspace(ctx, snapshot, session, notifier, "success", fmt.Sprintf("Created App Service web app %s.", created.Name))
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
		resourceGroup = s.selectedAzureResourceGroup(session, s.azureResourceGroups(context.Background(), profile))
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
