// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"cloudsprocket/backend/daemon/internal/app/sessionport"
	"cloudsprocket/backend/daemon/internal/models"
)

// validGcpInventoryScopes is the closed set accepted by gcp.inventory.get.
// Keep in sync with gcpServiceCatalog InventoryScope values.
var validGcpInventoryScopes = map[string]struct{}{
	"gcs": {},
	"gce": {},
	"gcf": {},
	"gke": {},
}

func normaliseGcpInventoryScope(scope string) string {
	return strings.TrimSpace(strings.ToLower(scope))
}

func isValidGcpInventoryScope(scope string) bool {
	_, ok := validGcpInventoryScopes[normaliseGcpInventoryScope(scope)]
	return ok
}

func gcpServiceIDForInventoryScope(scope string) string {
	scope = normaliseGcpInventoryScope(scope)
	for _, entry := range gcpServiceCatalog() {
		if entry.InventoryScope == scope {
			return entry.ServiceID
		}
	}
	return ""
}

// gcpInventoryListEmptyReason is none_found for a genuine empty list, and
// error when the live list failed. Cached rows do not hide that failure.
func gcpInventoryListEmptyReason(itemCount int, listErr error) models.InventoryEmptyReason {
	if listErr != nil {
		return models.InventoryEmptyError
	}
	if itemCount == 0 {
		return models.InventoryEmptyNoneFound
	}
	return ""
}

func gcpCachedInventoryStatus(resource string, count int, listErr error) string {
	return fmt.Sprintf(
		"Showing %d cached %s because the live list failed.\nDetail: %v",
		count,
		resource,
		listErr,
	)
}

func markGcpInventory(
	workspace *models.WorkspaceSnapshot,
	scope string,
	itemCount int,
	emptyReason models.InventoryEmptyReason,
) {
	if workspace == nil || strings.TrimSpace(scope) == "" {
		return
	}
	if workspace.GcpInventory == nil {
		workspace.GcpInventory = make(models.GcpInventoryStates)
	}
	state := models.InventoryScopeState{Loaded: true}
	if emptyReason == models.InventoryEmptyError {
		state.EmptyReason = models.InventoryEmptyError
	} else if itemCount == 0 {
		if emptyReason == "" {
			emptyReason = models.InventoryEmptyNoneFound
		}
		state.EmptyReason = emptyReason
	}
	workspace.GcpInventory[scope] = state
}

// enrichGcpInventoryScope loads one GCP service. Unknown scopes are ignored
// so a bad flag cannot fall through to the full four-list enrich.
func (s *Service) enrichGcpInventoryScope(
	workspace *models.WorkspaceSnapshot,
	session models.SessionSnapshot,
	scope string,
) {
	switch normaliseGcpInventoryScope(scope) {
	case "gcs":
		s.enrichGcpStorageInventory(workspace, session, nil)
	case "gce":
		s.enrichGcpComputeInventory(workspace, session, nil)
	case "gcf":
		s.enrichGcpFunctionsInventory(workspace, session, nil)
	case "gke":
		s.enrichGcpGkeInventory(workspace, session, nil)
	}
}

// handleGcpInventoryGet implements gcp.inventory.get. It returns a WorkspaceSnapshot
// for one scope. Callers must merge that scope; replacing the workspace would
// blank the other three GCP tabs.
func (s *Service) handleGcpInventoryGet(ctx context.Context, params json.RawMessage, _ Notifier) (any, error) {
	var request struct {
		Scope string `json:"scope"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	scope := normaliseGcpInventoryScope(request.Scope)
	if scope == "" {
		return nil, errors.New("scope is required")
	}
	if !isValidGcpInventoryScope(scope) {
		return nil, fmt.Errorf("unknown GCP inventory scope %q", request.Scope)
	}
	serviceID := gcpServiceIDForInventoryScope(scope)
	if serviceID == "" || !s.isServiceEnabled("gcp", serviceID) {
		return nil, errors.New("that GCP service is disabled in settings")
	}

	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	session, err := s.Load(ctx, snapshot)
	if err != nil {
		return nil, err
	}
	if !session.IsLocked || session.CurrentProviderID != "gcp" {
		return nil, errors.New("open a GCP workspace before loading service inventory")
	}

	return s.Build(ctx, snapshot, session, sessionport.SnapshotOptions{
		SkipAwsInventory:     true,
		SkipAzureInventory:   true,
		GcpScope:             scope,
		GcpDeferredInventory: false,
	}), nil
}
