// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
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
