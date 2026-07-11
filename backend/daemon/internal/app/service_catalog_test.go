// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"slices"
	"testing"

	"cloudsprocket/backend/daemon/internal/models"
)

func TestAwsWorkspaceTabsIncludePhaseTwoServices(t *testing.T) {
	tabs := workspaceTabs("aws")
	ids := workspaceTabIDs(tabs)
	for _, expected := range []string{"ecs", "eks", "cloudformation", "eventbridge", "apigateway", "secrets"} {
		if !slices.Contains(ids, expected) {
			t.Fatalf("aws workspace tabs missing %s: %v", expected, ids)
		}
	}
}

func TestAwsInventoryScopesMatchCatalogue(t *testing.T) {
	scopes := awsInventoryScopesFromCatalog()
	for _, entry := range awsServiceCatalog() {
		if entry.InventoryScope == "" {
			continue
		}
		if _, ok := scopes[entry.InventoryScope]; !ok {
			t.Fatalf("catalogue scope %q missing from inventory scopes", entry.InventoryScope)
		}
	}
	entriesWithScope := 0
	for _, entry := range awsServiceCatalog() {
		if entry.InventoryScope != "" {
			entriesWithScope++
		}
	}
	if len(scopes) != entriesWithScope {
		t.Fatalf("scope count = %d, catalogue entries with scope = %d", len(scopes), entriesWithScope)
	}
}

func TestCatalogueServiceDomainsAreKnown(t *testing.T) {
	known := knownServiceDomains()
	coverage := map[string]map[string]bool{}
	for _, entry := range allServiceCatalogEntries() {
		switch entry.Category {
		case workspaceTabCategoryService, workspaceTabCategoryComingSoon:
			if entry.Domain == "" {
				t.Fatalf("%s/%s: service entry is missing a domain", entry.ProviderID, entry.ServiceID)
			}
			if _, ok := known[entry.Domain]; !ok {
				t.Fatalf("%s/%s: unknown domain %q", entry.ProviderID, entry.ServiceID, entry.Domain)
			}
			if coverage[entry.ProviderID] == nil {
				coverage[entry.ProviderID] = map[string]bool{}
			}
			coverage[entry.ProviderID][entry.Domain] = true
		default:
			if entry.Domain != "" {
				t.Fatalf("%s/%s: %s entries must not carry a domain (got %q)", entry.ProviderID, entry.ServiceID, entry.Category, entry.Domain)
			}
		}
	}
	for _, providerID := range []string{"aws", "azure"} {
		for _, domain := range []string{serviceDomainCompute, serviceDomainStorage, serviceDomainDatabase} {
			if !coverage[providerID][domain] {
				t.Fatalf("provider %s has no %s service", providerID, domain)
			}
		}
	}
}

func TestCatalogueDomainFlowsToTabsAndModels(t *testing.T) {
	entry := awsServiceCatalog()[0]
	if entry.Domain == "" {
		t.Fatal("expected first AWS entry to carry a domain")
	}
	if tab := catalogEntryToTab(entry); tab.Domain != entry.Domain {
		t.Fatalf("tab domain = %q, want %q", tab.Domain, entry.Domain)
	}
	if model := catalogEntryToModel(entry, true); model.Domain != entry.Domain {
		t.Fatalf("model domain = %q, want %q", model.Domain, entry.Domain)
	}
}

func workspaceTabIDs(tabs []models.WorkspaceTab) []string {
	ids := make([]string, 0, len(tabs))
	for _, tab := range tabs {
		ids = append(ids, tab.TabID)
	}
	return ids
}