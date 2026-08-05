// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"encoding/json"
)

// Thin façade wrappers for Azure write RPCs owned by internal/app/azure (F-029 Phase 5c).

func (s *Service) handleAzureStorageCreateAccount(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAzureDomain(); err != nil {
		return nil, err
	}
	return s.azureDomain.HandleStorageCreateAccount(ctx, params, notifier)
}

func (s *Service) handleAzureStorageCreateContainer(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAzureDomain(); err != nil {
		return nil, err
	}
	return s.azureDomain.HandleStorageCreateContainer(ctx, params, notifier)
}

func (s *Service) handleAzureStorageUploadBlob(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAzureDomain(); err != nil {
		return nil, err
	}
	return s.azureDomain.HandleStorageUploadBlob(ctx, params, notifier)
}

func (s *Service) handleAzureStorageDeleteBlob(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAzureDomain(); err != nil {
		return nil, err
	}
	return s.azureDomain.HandleStorageDeleteBlob(ctx, params, notifier)
}

func (s *Service) handleAzureStorageCopyBlob(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAzureDomain(); err != nil {
		return nil, err
	}
	return s.azureDomain.HandleStorageCopyBlob(ctx, params, notifier)
}

func (s *Service) handleAzureStorageCreateFolderPrefix(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAzureDomain(); err != nil {
		return nil, err
	}
	return s.azureDomain.HandleStorageCreateFolderPrefix(ctx, params, notifier)
}

func (s *Service) handleAzureStoragePresignBlob(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAzureDomain(); err != nil {
		return nil, err
	}
	return s.azureDomain.HandleStoragePresignBlob(ctx, params, notifier)
}

func (s *Service) handleAzureKeyVaultRevealSecret(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAzureDomain(); err != nil {
		return nil, err
	}
	return s.azureDomain.HandleKeyVaultRevealSecret(ctx, params, notifier)
}

func (s *Service) handleAzureKeyVaultSetSecret(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAzureDomain(); err != nil {
		return nil, err
	}
	return s.azureDomain.HandleKeyVaultSetSecret(ctx, params, notifier)
}

func (s *Service) handleAzurePostgresStartServer(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAzureDomain(); err != nil {
		return nil, err
	}
	return s.azureDomain.HandlePostgresStartServer(ctx, params, notifier)
}

func (s *Service) handleAzurePostgresStopServer(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAzureDomain(); err != nil {
		return nil, err
	}
	return s.azureDomain.HandlePostgresStopServer(ctx, params, notifier)
}

func (s *Service) handleAzureFunctionsInvoke(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAzureDomain(); err != nil {
		return nil, err
	}
	return s.azureDomain.HandleFunctionsInvoke(ctx, params, notifier)
}

func (s *Service) handleAzureWebAppsInvokeAction(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAzureDomain(); err != nil {
		return nil, err
	}
	return s.azureDomain.HandleWebAppsInvokeAction(ctx, params, notifier)
}

func (s *Service) handleAzureWebAppsSetSetting(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAzureDomain(); err != nil {
		return nil, err
	}
	return s.azureDomain.HandleWebAppsSetSetting(ctx, params, notifier)
}

func (s *Service) handleAzureWebAppsDeleteSetting(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAzureDomain(); err != nil {
		return nil, err
	}
	return s.azureDomain.HandleWebAppsDeleteSetting(ctx, params, notifier)
}

func (s *Service) handleAzureWebAppsCreateSlot(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAzureDomain(); err != nil {
		return nil, err
	}
	return s.azureDomain.HandleWebAppsCreateSlot(ctx, params, notifier)
}

func (s *Service) handleAzureWebAppsSwapSlots(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAzureDomain(); err != nil {
		return nil, err
	}
	return s.azureDomain.HandleWebAppsSwapSlots(ctx, params, notifier)
}

func (s *Service) handleAzureWebAppsCreate(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAzureDomain(); err != nil {
		return nil, err
	}
	return s.azureDomain.HandleWebAppsCreate(ctx, params, notifier)
}

func (s *Service) handleAzureWafConfigSetMode(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAzureDomain(); err != nil {
		return nil, err
	}
	return s.azureDomain.HandleWafConfigSetMode(ctx, params, notifier)
}

func (s *Service) handleAzureWafConfigSetManagedRule(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAzureDomain(); err != nil {
		return nil, err
	}
	return s.azureDomain.HandleWafConfigSetManagedRule(ctx, params, notifier)
}

func (s *Service) handleAzureWafConfigAddExclusion(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAzureDomain(); err != nil {
		return nil, err
	}
	return s.azureDomain.HandleWafConfigAddExclusion(ctx, params, notifier)
}

func (s *Service) handleAzureWafConfigRemoveExclusion(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAzureDomain(); err != nil {
		return nil, err
	}
	return s.azureDomain.HandleWafConfigRemoveExclusion(ctx, params, notifier)
}
