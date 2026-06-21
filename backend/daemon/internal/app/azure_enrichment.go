// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"sync"

	"cloudsprocket/backend/daemon/internal/models"
)

// azureEnrichmentOptions controls how much Azure inventory is loaded during a
// workspace snapshot. Lightweight mode skips expensive drill-down calls that
// selection handlers and finishAzureWorkspace load on demand.
type azureEnrichmentOptions struct {
	lightweight            bool
	resourceGroupSelection bool
	scope                  string
	// serialPhaseOne runs phase-one enrichers sequentially. Test-only.
	serialPhaseOne bool
}

func (s *Service) enrichAzureWorkspace(
	workspace *models.WorkspaceSnapshot,
	session models.SessionSnapshot,
	opts azureEnrichmentOptions,
) {
	if workspace.Provider == nil ||
		workspace.Provider.ProviderID != "azure" ||
		workspace.Profile == nil ||
		s.azure == nil {
		return
	}

	if opts.resourceGroupSelection {
		var mu sync.Mutex
		s.enrichAzureInventory(workspace, session, &mu)
		s.enrichAzureAppServiceInventory(workspace, session, nil)
		return
	}

	if opts.scope != "" {
		s.enrichAzureScoped(workspace, session, opts)
		return
	}

	phaseOne := []func(*sync.Mutex){
		func(mu *sync.Mutex) { s.enrichAzureInventory(workspace, session, mu) },
		func(mu *sync.Mutex) { s.enrichAzureStorageInventory(workspace, session, opts, mu) },
		func(mu *sync.Mutex) { s.enrichAzureLogAnalyticsInventory(workspace, session, mu) },
		func(mu *sync.Mutex) { s.enrichAzureFunctionsInventory(workspace, session, opts, mu) },
		func(mu *sync.Mutex) { s.enrichAzureKeyVaultInventory(workspace, session, opts, mu) },
		func(mu *sync.Mutex) { s.enrichAzureCosmosInventory(workspace, session, opts, mu) },
		func(mu *sync.Mutex) { s.enrichAzureEntraInventory(workspace, session, mu) },
	}

	var mu sync.Mutex
	if opts.serialPhaseOne {
		for _, enrich := range phaseOne {
			enrich(&mu)
		}
	} else {
		var wg sync.WaitGroup
		for _, enrich := range phaseOne {
			wg.Add(1)
			go func(fn func(*sync.Mutex)) {
				defer wg.Done()
				fn(&mu)
			}(enrich)
		}
		wg.Wait()
	}

	// Phase 2: depends on phase 1 fields (resource groups, storage accounts, LA workspaces).
	s.enrichAzureAppServiceInventory(workspace, session, nil)
	s.enrichAzureQueuesInventory(workspace, session, opts, nil)
	s.enrichAzureWafInventory(workspace, session, opts, nil)
}

func (s *Service) enrichAzureScoped(
	workspace *models.WorkspaceSnapshot,
	session models.SessionSnapshot,
	opts azureEnrichmentOptions,
) {
	scopeOpts := azureEnrichmentOptions{lightweight: opts.lightweight}
	switch opts.scope {
	case "storage":
		s.enrichAzureStorageInventory(workspace, session, scopeOpts, nil)
	case "functions":
		s.enrichAzureFunctionsInventory(workspace, session, scopeOpts, nil)
	case "keyvault":
		s.enrichAzureKeyVaultInventory(workspace, session, scopeOpts, nil)
	case "cosmos":
		s.enrichAzureCosmosInventory(workspace, session, scopeOpts, nil)
	case "waf":
		s.enrichAzureLogAnalyticsInventory(workspace, session, nil)
		s.enrichAzureWafInventory(workspace, session, scopeOpts, nil)
	case "queues":
		s.enrichAzureStorageInventory(workspace, session, azureEnrichmentOptions{lightweight: true}, nil)
		s.enrichAzureQueuesInventory(workspace, session, scopeOpts, nil)
	case "webapps":
		s.enrichAzureInventory(workspace, session, nil)
		s.enrichAzureAppServiceInventory(workspace, session, nil)
	}
}

func lockWorkspace(mu *sync.Mutex, fn func()) {
	if mu == nil {
		fn()
		return
	}
	mu.Lock()
	defer mu.Unlock()
	fn()
}