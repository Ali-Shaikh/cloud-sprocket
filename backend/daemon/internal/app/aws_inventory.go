// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"encoding/json"
	"errors"
	"sync"

	"cloudsprocket/backend/daemon/internal/models"
)

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
	if s.aws == nil {
		return nil, errors.New("aws inventory service is not available")
	}
	return s.aws.HandleInventoryGet(ctx, params)
}
