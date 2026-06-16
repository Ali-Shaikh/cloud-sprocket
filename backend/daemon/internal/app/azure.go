package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

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
