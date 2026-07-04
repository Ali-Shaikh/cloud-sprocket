// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"

	"cloudsprocket/backend/daemon/internal/models"
)

var validAwsInventoryScopes = map[string]struct{}{
	"s3":       {},
	"ec2":      {},
	"lambda":   {},
	"dynamodb": {},
	"sqs":      {},
	"sns":      {},
	"rds":      {},
	"logs":     {},
	"iam":      {},
}

func (s *Service) enrichAwsInventory(
	workspace *models.WorkspaceSnapshot,
	session models.SessionSnapshot,
	mu *sync.Mutex,
) {
	if workspace.Provider == nil ||
		workspace.Provider.ProviderID != "aws" ||
		workspace.Profile == nil {
		return
	}
	opts := awsEnrichmentOptions{lightweight: true}
	var wg sync.WaitGroup
	wg.Add(2)
	go func() {
		defer wg.Done()
		s.enrichS3Inventory(workspace, session, opts, mu)
	}()
	go func() {
		defer wg.Done()
		s.enrichEC2Inventory(workspace, session, opts, mu)
	}()
	wg.Wait()
}

func (s *Service) handleAwsInventoryGet(ctx context.Context, params json.RawMessage, _ Notifier) (any, error) {
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
	if _, ok := validAwsInventoryScopes[scope]; !ok {
		return nil, fmt.Errorf("unknown AWS inventory scope %q", request.Scope)
	}

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
	if !session.IsLocked || session.CurrentProviderID != "aws" {
		return nil, errors.New("open an AWS workspace before loading service inventory")
	}

	return s.buildWorkspaceSnapshotOpts(snapshot, session, workspaceSnapshotOptions{
		lightweightAWS:         true,
		skipAzureInventory:     true,
		awsScope:               scope,
		awsDeferredInventory:   false,
	}), nil
}