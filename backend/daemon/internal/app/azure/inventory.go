// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package azure

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"cloudsprocket/backend/daemon/internal/app/sessionport"
)

// validInventoryScopes is the closed set accepted by azure.inventory.get.
// Keep in sync with azureServiceCatalog InventoryScope values on the façade.
var validInventoryScopes = map[string]struct{}{
	"storage":      {},
	"functions":    {},
	"keyvault":     {},
	"cosmos":       {},
	"postgres":     {},
	"waf":          {},
	"queues":       {},
	"webapps":      {},
	"frontdoor":    {},
	"loganalytics": {},
	"entra":        {},
}

// IsValidInventoryScope reports whether scope is in the closed azure.inventory.get set.
func IsValidInventoryScope(scope string) bool {
	_, ok := validInventoryScopes[NormaliseInventoryScope(scope)]
	return ok
}

// NormaliseInventoryScope trims and lowercases an inventory scope token.
func NormaliseInventoryScope(scope string) string {
	return strings.TrimSpace(strings.ToLower(scope))
}

// LightweightAzureForInventoryScope reports whether azure.inventory.get should
// build a lightweight workspace for the given scope. Storage needs full blob
// browser detail (accounts + containers + blobs) on first open; other scopes
// stay lightweight so expensive drill-down still loads only when selected.
func LightweightAzureForInventoryScope(scope string) bool {
	return NormaliseInventoryScope(scope) != "storage"
}

// HandleInventoryGet implements azure.inventory.get. It returns a scoped
// WorkspaceSnapshot (full snapshot shape, Azure-scoped enrichment), not a
// typed slice. Preserve this contract for desktop merge callers.
func (s *Service) HandleInventoryGet(ctx context.Context, params json.RawMessage) (any, error) {
	if s == nil || s.discovery == nil || s.session == nil || s.workspace == nil || s.gate == nil || s.catalog == nil {
		return nil, errors.New("azure inventory service is not available")
	}

	var request struct {
		Scope string `json:"scope"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	scope := NormaliseInventoryScope(request.Scope)
	if scope == "" {
		return nil, errors.New("scope is required")
	}
	if !s.catalog.IsValidScope(scope) {
		return nil, fmt.Errorf("unknown Azure inventory scope %q", request.Scope)
	}
	serviceID := s.catalog.ServiceIDForScope(scope)
	if serviceID != "" && !s.gate.IsServiceEnabled("azure", serviceID) {
		return nil, errors.New("that Azure service is disabled in settings")
	}

	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	session, err := s.session.Load(ctx, snapshot)
	if err != nil {
		return nil, err
	}
	if !session.IsLocked || session.CurrentProviderID != "azure" {
		return nil, errors.New("open an Azure workspace before loading service inventory")
	}

	return s.workspace.Build(ctx, snapshot, session, sessionport.SnapshotOptions{
		LightweightAzure:       LightweightAzureForInventoryScope(scope),
		SkipAwsInventory:       true,
		AzureScope:             scope,
		AzureDeferredInventory: false,
	}), nil
}
