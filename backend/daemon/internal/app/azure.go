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

	"cloudsprocket/backend/daemon/internal/models"
)

func (s *Service) azureResourceGroups(
	ctx context.Context,
	profile models.ProfileSummary,
) ([]models.AzureResourceGroup, error) {
	const scope = "azure.resource-groups"
	queryHash := profile.ProfileID
	ctx, cancel := s.withAzureTimeout(ctx)
	defer cancel()
	var cached []models.AzureResourceGroup
	if _, ok, _ := s.loadCachedResource(ctx, scope, queryHash, &cached); ok {
		return cached, nil
	}

	groups, err := s.azure.ListResourceGroups(ctx, profile)
	if err == nil {
		_ = s.saveResourceCacheWithTTL(ctx, scope, queryHash, groups)
		return groups, nil
	}

	_, ok, cacheErr := s.store.LoadResourceCache(ctx, scope, queryHash, &cached)
	if cacheErr == nil && ok {
		// SWR: serve stale cache without surfacing the live error.
		return cached, nil
	}

	return []models.AzureResourceGroup{}, err
}

func (s *Service) selectedAzureResourceGroup(
	session models.SessionSnapshot,
	groups []models.AzureResourceGroup,
) string {
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

func (s *Service) azureVirtualMachines(
	ctx context.Context,
	profile models.ProfileSummary,
	resourceGroup string,
) []models.AzureVirtualMachine {
	if resourceGroup == "" {
		return []models.AzureVirtualMachine{}
	}

	const scope = "azure.virtual-machines"
	queryHash := profile.ProfileID + "|" + resourceGroup
	ctx, cancel := s.withAzureTimeout(ctx)
	defer cancel()
	var cached []models.AzureVirtualMachine
	if _, ok, _ := s.loadCachedResource(ctx, scope, queryHash, &cached); ok {
		return cached
	}

	vms, err := s.azure.ListVirtualMachines(ctx, profile, resourceGroup)
	if err == nil {
		_ = s.saveResourceCacheWithTTL(ctx, scope, queryHash, vms)
		return vms
	}

	_, ok, cacheErr := s.store.LoadResourceCache(ctx, scope, queryHash, &cached)
	if cacheErr == nil && ok {
		return cached
	}

	return []models.AzureVirtualMachine{}
}

func (s *Service) selectedAzureVMID(
	session models.SessionSnapshot,
	vms []models.AzureVirtualMachine,
) string {
	if session.SelectedAzureVMID != "" {
		for _, vm := range vms {
			if vm.VMID == session.SelectedAzureVMID {
				return session.SelectedAzureVMID
			}
		}
	}
	if len(vms) == 0 {
		return ""
	}
	return vms[0].VMID
}

func (s *Service) enrichAzureInventory(workspace *models.WorkspaceSnapshot, session models.SessionSnapshot, mu *sync.Mutex) {
	if workspace.Provider == nil ||
		workspace.Provider.ProviderID != "azure" ||
		workspace.Profile == nil ||
		s.azure == nil {
		return
	}
	profile := *workspace.Profile
	ctx, cancel := s.withAzureTimeout(context.Background())
	defer cancel()

	groups, listErr := s.azureResourceGroups(ctx, profile)

	selectedRG := s.selectedAzureResourceGroup(session, groups)
	vms := s.azureVirtualMachines(ctx, profile, selectedRG)
	selectedVM := s.selectedAzureVMID(session, vms)
	status := s.azureWorkspaceStatus(listErr, workspace.Provider, session, groups, selectedRG, vms)

	lockWorkspace(mu, func() {
		workspace.AzureResourceGroups = groups
		workspace.SelectedAzureResourceGroup = selectedRG
		workspace.AzureVirtualMachines = vms
		workspace.SelectedAzureVMID = selectedVM
		workspace.AzureStatusMessage = status
	})
}

func (s *Service) azureWorkspaceStatus(
	listErr error,
	provider *models.ProviderSummary,
	session models.SessionSnapshot,
	groups []models.AzureResourceGroup,
	selectedRG string,
	vms []models.AzureVirtualMachine,
) string {
	if listErr != nil && len(groups) == 0 {
		if provider != nil && strings.TrimSpace(provider.CommandPath) == "" {
			return "Azure CLI was not detected. Install az, sign in with az login, then use Refresh on the Connect screen."
		}
		if session.LockedAuthMethod == models.AuthMethodLocalFiles {
			return "Live Azure inventory needs the Azure CLI. Sign in with az login, reopen the profile, and choose CLI."
		}
		lower := strings.ToLower(listErr.Error())
		switch {
		case strings.Contains(lower, "not logged in"), strings.Contains(lower, "login"), strings.Contains(lower, "authentication"):
			return "Azure CLI is installed but not signed in. Run az login, then reopen the workspace."
		default:
			return fmt.Sprintf("Azure inventory failed: %s", strings.TrimSpace(listErr.Error()))
		}
	}
	switch {
	case len(groups) == 0:
		return "No Azure resource groups are currently available for this workspace."
	case selectedRG == "":
		return "Select an Azure resource group to inspect its virtual machines."
	case len(vms) == 0:
		return fmt.Sprintf("No Azure virtual machines were returned for %s.", selectedRG)
	default:
		return fmt.Sprintf("Loaded %d Azure virtual machines from %s.", len(vms), selectedRG)
	}
}

func (s *Service) handleAzureResourceGroupsCreate(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		Name     string `json:"name"`
		Location string `json:"location"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	name := strings.TrimSpace(request.Name)
	if name == "" {
		return nil, errors.New("resource group name is required")
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
		return nil, errors.New("open a locked Azure workspace before creating a resource group")
	}
	profile, ok := findProfile(filterProfiles(snapshot.Profiles, session.CurrentProviderID), session.SelectedProfileID)
	if !ok {
		s.mu.Unlock()
		return nil, errors.New("the workspace's Azure profile is not available")
	}
	if !effectiveAzureWritesEnabled(session, profile, s.azureProviderCommandPath(snapshot)) {
		s.mu.Unlock()
		return nil, errors.New("resource group create requires write mode to be enabled for this Azure workspace")
	}
	s.mu.Unlock()

	timeoutCtx, cancel := s.withAzureTimeout(ctx)
	defer cancel()
	created, err := s.azure.CreateResourceGroup(timeoutCtx, profile, name, request.Location)
	if err != nil {
		return nil, err
	}
	s.invalidateResourceCache(ctx, "azure.resource-groups", profile.ProfileID)
	s.mu.Lock()
	session, err = s.currentState(ctx, snapshot)
	if err != nil {
		s.mu.Unlock()
		return nil, err
	}
	session.SelectedAzureResourceGroup = created.Name
	session.SelectedAzureVMID = ""
	if err := s.store.SaveSession(ctx, session); err != nil {
		s.mu.Unlock()
		return nil, err
	}
	s.mu.Unlock()
	return s.finishAzureWorkspaceOpts(ctx, snapshot, session, notifier, workspaceSnapshotOptions{
		azureResourceGroupSelection: true,
		skipAwsInventory:            true,
	}, "success", fmt.Sprintf("Created Azure resource group %s.", created.Name))
}

func (s *Service) handleAzureResourceGroupsDelete(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		Name string `json:"name"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	name := strings.TrimSpace(request.Name)
	if name == "" {
		return nil, errors.New("resource group name is required")
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
		return nil, errors.New("open a locked Azure workspace before deleting a resource group")
	}
	profile, ok := findProfile(filterProfiles(snapshot.Profiles, session.CurrentProviderID), session.SelectedProfileID)
	if !ok {
		s.mu.Unlock()
		return nil, errors.New("the workspace's Azure profile is not available")
	}
	if !effectiveAzureWritesEnabled(session, profile, s.azureProviderCommandPath(snapshot)) {
		s.mu.Unlock()
		return nil, errors.New("resource group delete requires write mode to be enabled for this Azure workspace")
	}
	s.mu.Unlock()

	timeoutCtx, cancel := s.withAzureTimeout(ctx)
	defer cancel()
	if err := s.azure.DeleteResourceGroup(timeoutCtx, profile, name); err != nil {
		return nil, err
	}
	s.invalidateResourceCache(ctx, "azure.resource-groups", profile.ProfileID)
	s.mu.Lock()
	session, err = s.currentState(ctx, snapshot)
	if err != nil {
		s.mu.Unlock()
		return nil, err
	}
	if session.SelectedAzureResourceGroup == name {
		session.SelectedAzureResourceGroup = ""
		session.SelectedAzureVMID = ""
	}
	if err := s.store.SaveSession(ctx, session); err != nil {
		s.mu.Unlock()
		return nil, err
	}
	s.mu.Unlock()
	return s.finishAzureWorkspaceOpts(ctx, snapshot, session, notifier, workspaceSnapshotOptions{
		azureResourceGroupSelection: true,
		skipAwsInventory:            true,
	}, "success", fmt.Sprintf("Deleted Azure resource group %s.", name))
}

func (s *Service) handleAzureVirtualMachinesInvokeAction(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		Action string `json:"action"`
		VMID   string `json:"vmId"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	action := strings.TrimSpace(request.Action)
	if action == "" {
		return nil, errors.New("virtual machine action is required")
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
	profile, resourceGroup, vm, err := s.activeAzureVMSelection(snapshot, session, request.VMID)
	if err != nil {
		s.mu.Unlock()
		return nil, err
	}
	if !effectiveAzureWritesEnabled(session, profile, s.azureProviderCommandPath(snapshot)) {
		s.mu.Unlock()
		return nil, errors.New("virtual machine actions require write mode to be enabled for this Azure workspace")
	}
	s.mu.Unlock()

	timeoutCtx, cancel := s.withAzureTimeout(ctx)
	defer cancel()
	if err := s.azure.InvokeVirtualMachineAction(timeoutCtx, profile, resourceGroup, vm.Name, action); err != nil {
		return nil, err
	}
	s.mu.Lock()
	session, err = s.currentState(ctx, snapshot)
	if err != nil {
		s.mu.Unlock()
		return nil, err
	}
	session.SelectedAzureResourceGroup = resourceGroup
	session.SelectedAzureVMID = vm.VMID
	if err := s.store.SaveSession(ctx, session); err != nil {
		s.mu.Unlock()
		return nil, err
	}
	s.mu.Unlock()
	return s.finishAzureWorkspaceOpts(
		ctx,
		snapshot,
		session,
		notifier,
		workspaceSnapshotOptions{
			azureResourceGroupSelection: true,
			skipAwsInventory:            true,
		},
		"success",
		fmt.Sprintf("Invoked %s on Azure virtual machine %s.", action, vm.Name),
	)
}
