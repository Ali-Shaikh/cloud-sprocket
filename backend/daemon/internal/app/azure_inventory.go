// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"
)

var validAzureInventoryScopes = map[string]struct{}{
	"storage":       {},
	"functions":     {},
	"keyvault":      {},
	"cosmos":        {},
	"postgres":      {},
	"waf":           {},
	"queues":        {},
	"webapps":       {},
	"frontdoor":     {},
	"loganalytics":  {},
	"entra":         {},
}

func (s *Service) handleAzureInventoryGet(ctx context.Context, params json.RawMessage, _ Notifier) (any, error) {
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
	if _, ok := validAzureInventoryScopes[scope]; !ok {
		return nil, fmt.Errorf("unknown Azure inventory scope %q", request.Scope)
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
	if !session.IsLocked || session.CurrentProviderID != "azure" {
		return nil, errors.New("open an Azure workspace before loading service inventory")
	}

	return s.buildWorkspaceSnapshotOpts(snapshot, session, workspaceSnapshotOptions{
		lightweightAzure:       true,
		skipAwsInventory:       true,
		azureScope:             scope,
		azureDeferredInventory: false,
	}), nil
}

func azureInventoryProfilingEnabled() bool {
	return strings.TrimSpace(os.Getenv("CLOUDSPROCKET_AZURE_PROFILE")) == "1"
}