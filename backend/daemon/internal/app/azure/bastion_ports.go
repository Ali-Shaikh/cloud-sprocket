// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package azure

import (
	"context"

	"cloudsprocket/backend/daemon/internal/models"
)

// BastionHosts lists Bastion hosts in the subscription (cloud inventory).
type BastionHosts interface {
	ListBastionHosts(ctx context.Context, profile models.ProfileSummary) ([]models.AzureBastionHost, error)
}

// BastionHostCache is an optional resource cache for Bastion host lists.
// Implementations typically wrap the façade store Save/LoadResourceCache.
type BastionHostCache interface {
	SaveBastionHosts(ctx context.Context, profileID string, hosts []models.AzureBastionHost, fetchedAt string) error
	LoadBastionHosts(ctx context.Context, profileID string) (hosts []models.AzureBastionHost, ok bool, err error)
}

// VirtualMachineLookup lists VMs for a resource group (cache-aware on the façade).
// Narrow port so Bastion connect does not depend on the full VirtualMachinesWriter.
type VirtualMachineLookup interface {
	ListVirtualMachines(ctx context.Context, profile models.ProfileSummary, resourceGroup string) []models.AzureVirtualMachine
}

// InteractiveConsole spawns a local interactive CLI session (az bastion ssh/rdp).
// Injected so the domain does not hard-code OS process spawn.
type InteractiveConsole interface {
	Spawn(ctx context.Context, command string, args ...string) error
}
