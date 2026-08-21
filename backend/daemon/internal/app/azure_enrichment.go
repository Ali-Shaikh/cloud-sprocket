// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"log"
	"strings"
	"sync"
	"time"

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
	// serialPhaseTwo runs phase-two enrichers sequentially. Test-only.
	serialPhaseTwo bool
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
		s.enrichAzureAppServiceInventory(workspace, session, &mu)
		return
	}

	if opts.scope != "" {
		s.enrichAzureScoped(workspace, session, opts)
		return
	}

	phaseOne := []struct {
		name string
		fn   func(*sync.Mutex)
	}{
		{"inventory", func(mu *sync.Mutex) { s.enrichAzureInventory(workspace, session, mu) }},
		{"storage", func(mu *sync.Mutex) { s.enrichAzureStorageInventory(workspace, session, opts, mu) }},
		{"log-analytics", func(mu *sync.Mutex) { s.enrichAzureLogAnalyticsInventory(workspace, session, mu) }},
		{"functions", func(mu *sync.Mutex) { s.enrichAzureFunctionsInventory(workspace, session, opts, mu) }},
		{"keyvault", func(mu *sync.Mutex) { s.enrichAzureKeyVaultInventory(workspace, session, opts, mu) }},
		{"cosmos", func(mu *sync.Mutex) { s.enrichAzureCosmosInventory(workspace, session, opts, mu) }},
		{"postgres", func(mu *sync.Mutex) { s.enrichAzurePostgresInventory(workspace, session, opts, mu) }},
		{"entra", func(mu *sync.Mutex) { s.enrichAzureEntraInventory(workspace, session, mu) }},
	}

	var mu sync.Mutex
	if opts.serialPhaseOne {
		for _, enrich := range phaseOne {
			if !s.anyServiceEnabled("azure", azureEnricherServiceIDs(enrich.name)) {
				continue
			}
			s.runAzureEnricher(enrich.name, func() { enrich.fn(&mu) })
		}
	} else {
		var wg sync.WaitGroup
		for _, enrich := range phaseOne {
			if !s.anyServiceEnabled("azure", azureEnricherServiceIDs(enrich.name)) {
				continue
			}
			wg.Add(1)
			go func(item struct {
				name string
				fn   func(*sync.Mutex)
			}) {
				defer wg.Done()
				s.runAzureEnricher(item.name, func() { item.fn(&mu) })
			}(enrich)
		}
		wg.Wait()
	}

	s.enrichAzurePhaseTwo(workspace, session, opts)
}

// enrichAzurePhaseTwo runs App Service (including WebApp detail), Queues, WAF, and Front
// Door enrichers concurrently in production (serialPhaseTwo false). Phase 2d: WebApp detail
// stays serial within the app-service goroutine. See TestAzurePhaseTwoEnrichmentRunsInParallel.
func (s *Service) enrichAzurePhaseTwo(
	workspace *models.WorkspaceSnapshot,
	session models.SessionSnapshot,
	opts azureEnrichmentOptions,
) {
	phaseTwo := []struct {
		name string
		fn   func(*sync.Mutex)
	}{
		{
			name: "app-service",
			fn: func(mu *sync.Mutex) {
				s.enrichAzureAppServiceInventory(workspace, session, mu)
				if !opts.lightweight &&
					(strings.TrimSpace(workspace.SelectedAzureWebAppName) != "" ||
						strings.TrimSpace(session.SelectedAzureWebAppName) != "") {
					s.enrichAzureWebAppDetail(workspace, session, mu)
				}
			},
		},
		{
			name: "queues",
			fn:   func(mu *sync.Mutex) { s.enrichAzureQueuesInventory(workspace, session, opts, mu) },
		},
		{
			name: "waf",
			fn:   func(mu *sync.Mutex) { s.enrichAzureWafInventory(workspace, session, opts, mu) },
		},
		{
			name: "frontdoor",
			fn:   func(mu *sync.Mutex) { s.enrichAzureFrontDoorInventory(workspace, session, opts, mu) },
		},
	}

	var mu sync.Mutex
	if opts.serialPhaseTwo {
		for _, enrich := range phaseTwo {
			if !s.anyServiceEnabled("azure", azureEnricherServiceIDs(enrich.name)) {
				continue
			}
			s.runAzureEnricher(enrich.name, func() { enrich.fn(&mu) })
		}
		return
	}

	var wg sync.WaitGroup
	for _, enrich := range phaseTwo {
		if !s.anyServiceEnabled("azure", azureEnricherServiceIDs(enrich.name)) {
			continue
		}
		wg.Add(1)
		go func(item struct {
			name string
			fn   func(*sync.Mutex)
		}) {
			defer wg.Done()
			s.runAzureEnricher(item.name, func() { item.fn(&mu) })
		}(enrich)
	}
	wg.Wait()
}

func (s *Service) runAzureEnricher(name string, fn func()) {
	if !azureInventoryProfilingEnabled() {
		fn()
		return
	}
	start := time.Now()
	fn()
	log.Printf("azure enricher %s took %dms", name, time.Since(start).Milliseconds())
}

func (s *Service) enrichAzureScoped(
	workspace *models.WorkspaceSnapshot,
	session models.SessionSnapshot,
	opts azureEnrichmentOptions,
) {
	if serviceID := azureServiceIDForInventoryScope(opts.scope); serviceID != "" && !s.isServiceEnabled("azure", serviceID) {
		return
	}
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
	case "postgres":
		s.enrichAzurePostgresInventory(workspace, session, scopeOpts, nil)
	case "loganalytics":
		s.enrichAzureLogAnalyticsInventory(workspace, session, nil)
	case "entra":
		s.enrichAzureEntraInventory(workspace, session, nil)
	case "waf":
		s.enrichAzureLogAnalyticsInventory(workspace, session, nil)
		s.enrichAzureWafInventory(workspace, session, scopeOpts, nil)
	case "queues":
		s.enrichAzureStorageInventory(workspace, session, azureEnrichmentOptions{lightweight: true}, nil)
		s.enrichAzureQueuesInventory(workspace, session, scopeOpts, nil)
	case "webapps":
		s.enrichAzureInventory(workspace, session, nil)
		s.enrichAzureAppServiceInventory(workspace, session, nil)
		if !opts.lightweight {
			s.enrichAzureWebAppDetail(workspace, session, nil)
		}
	case "frontdoor":
		s.enrichAzureFrontDoorInventory(workspace, session, scopeOpts, nil)
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

// azureInventoryListEmptyReason is none_found for a genuine empty list, and
// error when the list call failed and no rows (including cache) were returned.
func azureInventoryListEmptyReason(itemCount int, listErr error) models.InventoryEmptyReason {
	if listErr != nil && itemCount == 0 {
		return models.InventoryEmptyError
	}
	return models.InventoryEmptyNoneFound
}

func markAzureInventory(
	workspace *models.WorkspaceSnapshot,
	scope string,
	itemCount int,
	emptyReason models.InventoryEmptyReason,
) {
	if workspace == nil || strings.TrimSpace(scope) == "" {
		return
	}
	if workspace.AzureInventory == nil {
		workspace.AzureInventory = make(models.AzureInventoryStates)
	}
	state := models.InventoryScopeState{Loaded: true}
	if itemCount == 0 {
		if emptyReason == "" {
			emptyReason = models.InventoryEmptyNoneFound
		}
		state.EmptyReason = emptyReason
	}
	workspace.AzureInventory[scope] = state
}

// markAzureInventoryDetail is markAzureInventory plus DetailLoaded for
// non-lightweight drill-down (Front Door topology, and similar later scopes).
func markAzureInventoryDetail(
	workspace *models.WorkspaceSnapshot,
	scope string,
	itemCount int,
	emptyReason models.InventoryEmptyReason,
	detailLoaded bool,
) {
	markAzureInventory(workspace, scope, itemCount, emptyReason)
	if workspace == nil || workspace.AzureInventory == nil || !detailLoaded {
		return
	}
	state := workspace.AzureInventory[scope]
	state.DetailLoaded = true
	workspace.AzureInventory[scope] = state
}
