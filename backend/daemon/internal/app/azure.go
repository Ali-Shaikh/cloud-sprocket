package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"cloudsprocket/backend/daemon/internal/models"
)

func (s *Service) azureResourceGroups(
	ctx context.Context,
	profile models.ProfileSummary,
) []models.AzureResourceGroup {
	const scope = "azure.resource-groups"
	queryHash := profile.ProfileID
	ctx, cancel := s.withAzureTimeout(ctx)
	defer cancel()
	groups, err := s.azure.ListResourceGroups(ctx, profile)
	if err == nil {
		_ = s.store.SaveResourceCache(ctx, scope, queryHash, groups, s.timestamp())
		return groups
	}

	var cached []models.AzureResourceGroup
	_, ok, cacheErr := s.store.LoadResourceCache(ctx, scope, queryHash, &cached)
	if cacheErr == nil && ok {
		return cached
	}

	return []models.AzureResourceGroup{}
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
	vms, err := s.azure.ListVirtualMachines(ctx, profile, resourceGroup)
	if err == nil {
		_ = s.store.SaveResourceCache(ctx, scope, queryHash, vms, s.timestamp())
		return vms
	}

	var cached []models.AzureVirtualMachine
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

func (s *Service) enrichAzureInventory(workspace *models.WorkspaceSnapshot, session models.SessionSnapshot) {
	if workspace.Provider == nil ||
		workspace.Provider.ProviderID != "azure" ||
		workspace.Profile == nil ||
		s.azure == nil {
		return
	}
	workspace.AzureResourceGroups = s.azureResourceGroups(context.Background(), *workspace.Profile)
	workspace.SelectedAzureResourceGroup = s.selectedAzureResourceGroup(session, workspace.AzureResourceGroups)
	workspace.AzureVirtualMachines = s.azureVirtualMachines(
		context.Background(),
		*workspace.Profile,
		workspace.SelectedAzureResourceGroup,
	)
	workspace.SelectedAzureVMID = s.selectedAzureVMID(session, workspace.AzureVirtualMachines)
	if len(workspace.AzureResourceGroups) == 0 {
		workspace.AzureStatusMessage = "No Azure resource groups are currently available for this workspace."
	} else if workspace.SelectedAzureResourceGroup == "" {
		workspace.AzureStatusMessage = "Select an Azure resource group to inspect its virtual machines."
	} else if len(workspace.AzureVirtualMachines) == 0 {
		workspace.AzureStatusMessage = fmt.Sprintf("No Azure virtual machines were returned for %s.", workspace.SelectedAzureResourceGroup)
	} else {
		workspace.AzureStatusMessage = fmt.Sprintf(
			"Loaded %d Azure virtual machines from %s.",
			len(workspace.AzureVirtualMachines),
			workspace.SelectedAzureResourceGroup,
		)
	}
}

func (s *Service) handleAzureSelectResourceGroup(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		ResourceGroup string `json:"resourceGroup"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	session, err := s.currentState(ctx, snapshot)
	if err != nil {
		return nil, err
	}
	if !session.IsLocked || session.CurrentProviderID != "azure" {
		return nil, errors.New("open an Azure workspace before selecting a resource group")
	}
	session.SelectedAzureResourceGroup = request.ResourceGroup
	session.SelectedAzureVMID = ""
	if err := s.store.SaveSession(ctx, session); err != nil {
		return nil, err
	}
	return s.buildWorkspaceSnapshot(snapshot, session), s.notifyStateAndLog(
		ctx,
		snapshot,
		session,
		notifier,
		"info",
		fmt.Sprintf("Selected Azure resource group %s.", request.ResourceGroup),
	)
}

func (s *Service) handleAzureSelectVirtualMachine(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		VMID string `json:"vmId"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	session, err := s.currentState(ctx, snapshot)
	if err != nil {
		return nil, err
	}
	if !session.IsLocked || session.CurrentProviderID != "azure" {
		return nil, errors.New("open an Azure workspace before selecting a virtual machine")
	}
	session.SelectedAzureVMID = request.VMID
	if err := s.store.SaveSession(ctx, session); err != nil {
		return nil, err
	}
	return s.buildWorkspaceSnapshot(snapshot, session), nil
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
	return s.finishAzureWorkspace(ctx, snapshot, session, notifier, "success", fmt.Sprintf("Created Azure resource group %s.", created.Name))
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
	return s.finishAzureWorkspace(ctx, snapshot, session, notifier, "success", fmt.Sprintf("Deleted Azure resource group %s.", name))
}
