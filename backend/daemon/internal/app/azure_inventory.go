// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"strings"
)

// Thin façade wrapper for azure.inventory.get owned by internal/app/azure (F-029 Phase 5a).

func (s *Service) requireAzureDomain() error {
	if s.azureDomain == nil {
		return errors.New("azure domain service is not available")
	}
	return nil
}

func (s *Service) handleAzureInventoryGet(ctx context.Context, params json.RawMessage, _ Notifier) (any, error) {
	if err := s.requireAzureDomain(); err != nil {
		return nil, err
	}
	return s.azureDomain.HandleInventoryGet(ctx, params)
}

func azureInventoryProfilingEnabled() bool {
	return strings.TrimSpace(os.Getenv("CLOUDSPROCKET_AZURE_PROFILE")) == "1"
}
