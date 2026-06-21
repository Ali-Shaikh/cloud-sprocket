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

	var mu sync.Mutex
	var wg sync.WaitGroup

	run := func(fn func(*sync.Mutex)) {
		wg.Add(1)
		go func() {
			defer wg.Done()
			fn(&mu)
		}()
	}

	// Phase 1: independent service inventories (parallel I/O, brief locked writes).
	run(func(mu *sync.Mutex) { s.enrichAzureInventory(workspace, session, mu) })
	run(func(mu *sync.Mutex) { s.enrichAzureStorageInventory(workspace, session, opts, mu) })
	run(func(mu *sync.Mutex) { s.enrichAzureLogAnalyticsInventory(workspace, session, mu) })
	run(func(mu *sync.Mutex) { s.enrichAzureFunctionsInventory(workspace, session, opts, mu) })
	run(func(mu *sync.Mutex) { s.enrichAzureKeyVaultInventory(workspace, session, opts, mu) })
	run(func(mu *sync.Mutex) { s.enrichAzureCosmosInventory(workspace, session, opts, mu) })
	run(func(mu *sync.Mutex) { s.enrichAzureEntraInventory(workspace, session, mu) })
	wg.Wait()

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