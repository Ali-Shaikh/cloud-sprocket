// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"encoding/json"
	"errors"
	"strings"

	"cloudsprocket/backend/daemon/internal/models"
)

func (s *Service) handleResourcesList(ctx context.Context, params json.RawMessage) (any, error) {
	var filter models.ResourceListFilter
	if len(params) > 0 {
		if err := json.Unmarshal(params, &filter); err != nil {
			return nil, err
		}
	}
	return s.store.ListResources(ctx, filter)
}

func (s *Service) handleResourcesGet(ctx context.Context, params json.RawMessage) (any, error) {
	var request struct {
		ScopeID    string `json:"scopeId"`
		ResourceID string `json:"resourceId"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	if strings.TrimSpace(request.ScopeID) == "" || strings.TrimSpace(request.ResourceID) == "" {
		return nil, errors.New("scopeId and resourceId are required")
	}
	resource, ok, err := s.store.GetResource(ctx, request.ScopeID, request.ResourceID)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, errors.New("resource not found")
	}
	return resource, nil
}

func (s *Service) handleInventoryStatus(ctx context.Context) (any, error) {
	return s.store.ListLatestInventoryRuns(ctx)
}

func (s *Service) handleCloudOverview(ctx context.Context) (any, error) {
	return s.store.GetCloudOverview(ctx)
}

func (s *Service) handleInventoryRefresh(ctx context.Context, notifier Notifier) (any, error) {
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	s.mu.Lock()
	session, err := s.currentState(ctx, snapshot)
	s.mu.Unlock()
	if err != nil {
		return nil, err
	}
	if !session.IsLocked {
		return nil, errors.New("open a provider workspace before refreshing inventory")
	}
	workspace := s.buildWorkspaceSnapshotOpts(
		snapshot,
		session,
		workspaceSnapshotOptions{lightweightAzure: true},
	)
	run, err := s.indexWorkspaceSnapshot(ctx, workspace)
	if err != nil {
		return nil, err
	}
	if run.RunID == "" {
		return nil, errors.New("open workspace has no provider profile to index")
	}
	if notifier != nil {
		_ = notifier.Notify("inventory.updated", run)
	}
	return run, nil
}
