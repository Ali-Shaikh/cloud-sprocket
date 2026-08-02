// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package aws

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"cloudsprocket/backend/daemon/internal/app/sessionport"
)

// HandleInventoryGet implements aws.inventory.get. It returns a scoped
// inventory slice, not a full WorkspaceSnapshot.
func (s *Service) HandleInventoryGet(ctx context.Context, params json.RawMessage) (any, error) {
	if s == nil || s.discovery == nil || s.session == nil || s.workspace == nil || s.gate == nil || s.catalog == nil {
		return nil, errors.New("aws inventory service is not available")
	}

	var request struct {
		Scope string `json:"scope"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	scope := strings.TrimSpace(strings.ToLower(request.Scope))
	if scope == "" {
		return nil, errors.New("scope is required")
	}
	if !s.catalog.IsValidScope(scope) {
		return nil, fmt.Errorf("unknown AWS inventory scope %q", request.Scope)
	}
	serviceID := s.catalog.ServiceIDForScope(scope)
	if !s.gate.IsServiceEnabled("aws", serviceID) {
		return nil, errors.New("that AWS service is disabled in settings")
	}

	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	session, err := s.session.Load(ctx, snapshot)
	if err != nil {
		return nil, err
	}
	if !session.IsLocked || session.CurrentProviderID != "aws" {
		return nil, errors.New("open an AWS workspace before loading service inventory")
	}

	workspace := s.workspace.Build(ctx, snapshot, session, sessionport.SnapshotOptions{
		LightweightAWS:     true,
		SkipAzureInventory: true,
		AWSScope:           scope,
	})
	return InventorySliceFromWorkspace(scope, workspace)
}
