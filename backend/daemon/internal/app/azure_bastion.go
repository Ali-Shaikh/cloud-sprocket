// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"encoding/json"

	"cloudsprocket/backend/daemon/internal/models"
	"cloudsprocket/backend/daemon/internal/sysproc"
)

// Thin façade wrappers for Azure Bastion RPCs owned by internal/app/azure (F-029 Phase 5e).

func (s *Service) handleAzureBastionList(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAzureDomain(); err != nil {
		return nil, err
	}
	return s.azureDomain.HandleBastionList(ctx, params, notifier)
}

func (s *Service) handleAzureBastionConnect(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAzureDomain(); err != nil {
		return nil, err
	}
	return s.azureDomain.HandleBastionConnect(ctx, params, notifier)
}

// bastionHostCacheAdapter implements azure.BastionHostCache via the façade store.
type bastionHostCacheAdapter struct {
	s *Service
}

func (a bastionHostCacheAdapter) SaveBastionHosts(
	ctx context.Context,
	profileID string,
	hosts []models.AzureBastionHost,
	fetchedAt string,
) error {
	if a.s == nil || a.s.store == nil {
		return nil
	}
	return a.s.store.SaveResourceCache(ctx, "azure.bastion-hosts", profileID, hosts, fetchedAt)
}

func (a bastionHostCacheAdapter) LoadBastionHosts(
	ctx context.Context,
	profileID string,
) ([]models.AzureBastionHost, bool, error) {
	if a.s == nil || a.s.store == nil {
		return nil, false, nil
	}
	var cached []models.AzureBastionHost
	_, ok, err := a.s.store.LoadResourceCache(ctx, "azure.bastion-hosts", profileID, &cached)
	if err != nil {
		return nil, false, err
	}
	return cached, ok, nil
}

// bastionVMLookupAdapter implements azure.VirtualMachineLookup with cache-aware list.
type bastionVMLookupAdapter struct {
	s *Service
}

func (a bastionVMLookupAdapter) ListVirtualMachines(
	ctx context.Context,
	profile models.ProfileSummary,
	resourceGroup string,
) []models.AzureVirtualMachine {
	if a.s == nil {
		return nil
	}
	return a.s.azureVirtualMachines(ctx, profile, resourceGroup)
}

// interactiveConsoleAdapter wraps sysproc.SpawnInteractiveConsole for the domain port.
type interactiveConsoleAdapter struct{}

func (interactiveConsoleAdapter) Spawn(ctx context.Context, command string, args ...string) error {
	return sysproc.SpawnInteractiveConsole(ctx, command, args...)
}
