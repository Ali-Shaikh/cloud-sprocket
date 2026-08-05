// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"encoding/json"
)

// Thin façade wrappers for Azure selection RPCs owned by internal/app/azure (F-029 Phase 5b).

func (s *Service) handleAzureSelectResourceGroup(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAzureDomain(); err != nil {
		return nil, err
	}
	return s.azureDomain.HandleSelectResourceGroup(ctx, params, notifier)
}

func (s *Service) handleAzureSelectVirtualMachine(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAzureDomain(); err != nil {
		return nil, err
	}
	return s.azureDomain.HandleSelectVirtualMachine(ctx, params, notifier)
}

func (s *Service) handleAzureSelectWebApp(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAzureDomain(); err != nil {
		return nil, err
	}
	return s.azureDomain.HandleWebAppsSelect(ctx, params, notifier)
}

func (s *Service) handleAzureWebAppsSelectSlot(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAzureDomain(); err != nil {
		return nil, err
	}
	return s.azureDomain.HandleWebAppsSelectSlot(ctx, params, notifier)
}

func (s *Service) handleAzureStorageSelectAccount(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAzureDomain(); err != nil {
		return nil, err
	}
	return s.azureDomain.HandleStorageSelectAccount(ctx, params, notifier)
}

func (s *Service) handleAzureStorageSelectContainer(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAzureDomain(); err != nil {
		return nil, err
	}
	return s.azureDomain.HandleStorageSelectContainer(ctx, params, notifier)
}

func (s *Service) handleAzureStorageSelectBlob(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAzureDomain(); err != nil {
		return nil, err
	}
	return s.azureDomain.HandleStorageSelectBlob(ctx, params, notifier)
}

func (s *Service) handleAzureStorageSetPrefixFilter(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAzureDomain(); err != nil {
		return nil, err
	}
	return s.azureDomain.HandleStorageSetPrefixFilter(ctx, params, notifier)
}

func (s *Service) handleAzureLogAnalyticsSelectWorkspace(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAzureDomain(); err != nil {
		return nil, err
	}
	return s.azureDomain.HandleLogAnalyticsSelectWorkspace(ctx, params, notifier)
}

func (s *Service) handleAzureWafSelectPolicy(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAzureDomain(); err != nil {
		return nil, err
	}
	return s.azureDomain.HandleWafSelectPolicy(ctx, params, notifier)
}

func (s *Service) handleAzureFrontDoorSelectProfile(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAzureDomain(); err != nil {
		return nil, err
	}
	return s.azureDomain.HandleFrontDoorSelectProfile(ctx, params, notifier)
}

func (s *Service) handleAzureFrontDoorSelectEndpoint(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAzureDomain(); err != nil {
		return nil, err
	}
	return s.azureDomain.HandleFrontDoorSelectEndpoint(ctx, params, notifier)
}

func (s *Service) handleAzureFrontDoorSelectOriginGroup(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAzureDomain(); err != nil {
		return nil, err
	}
	return s.azureDomain.HandleFrontDoorSelectOriginGroup(ctx, params, notifier)
}

func (s *Service) handleAzureFunctionsSelectApp(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAzureDomain(); err != nil {
		return nil, err
	}
	return s.azureDomain.HandleFunctionsSelectApp(ctx, params, notifier)
}

func (s *Service) handleAzureFunctionsSelectFunction(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAzureDomain(); err != nil {
		return nil, err
	}
	return s.azureDomain.HandleFunctionsSelectFunction(ctx, params, notifier)
}

func (s *Service) handleAzureKeyVaultSelectVault(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAzureDomain(); err != nil {
		return nil, err
	}
	return s.azureDomain.HandleKeyVaultSelectVault(ctx, params, notifier)
}

func (s *Service) handleAzureKeyVaultSelectSecret(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAzureDomain(); err != nil {
		return nil, err
	}
	return s.azureDomain.HandleKeyVaultSelectSecret(ctx, params, notifier)
}

func (s *Service) handleAzureCosmosSelectAccount(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAzureDomain(); err != nil {
		return nil, err
	}
	return s.azureDomain.HandleCosmosSelectAccount(ctx, params, notifier)
}

func (s *Service) handleAzureCosmosSelectDatabase(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAzureDomain(); err != nil {
		return nil, err
	}
	return s.azureDomain.HandleCosmosSelectDatabase(ctx, params, notifier)
}

func (s *Service) handleAzureCosmosSelectContainer(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAzureDomain(); err != nil {
		return nil, err
	}
	return s.azureDomain.HandleCosmosSelectContainer(ctx, params, notifier)
}

func (s *Service) handleAzurePostgresSelectServer(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAzureDomain(); err != nil {
		return nil, err
	}
	return s.azureDomain.HandlePostgresSelectServer(ctx, params, notifier)
}

func (s *Service) handleAzureQueuesSelectQueue(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAzureDomain(); err != nil {
		return nil, err
	}
	return s.azureDomain.HandleQueuesSelectQueue(ctx, params, notifier)
}
