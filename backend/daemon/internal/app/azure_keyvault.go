// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"errors"
	"fmt"
	"sync"

	"cloudsprocket/backend/daemon/internal/models"
)

func (s *Service) azureKeyVaults(
	ctx context.Context,
	profile models.ProfileSummary,
) []models.AzureKeyVault {
	const scope = "azure.key-vaults"
	vaults, err := s.azure.ListKeyVaults(ctx, profile)
	if err == nil {
		_ = s.store.SaveResourceCache(ctx, scope, profile.ProfileID, vaults, s.timestamp())
		return vaults
	}
	var cached []models.AzureKeyVault
	_, ok, cacheErr := s.store.LoadResourceCache(ctx, scope, profile.ProfileID, &cached)
	if cacheErr == nil && ok {
		return cached
	}
	return []models.AzureKeyVault{}
}

func (s *Service) azureKeyVaultSecrets(
	ctx context.Context,
	profile models.ProfileSummary,
	vaultName string,
) []models.AzureKeyVaultSecret {
	if vaultName == "" {
		return []models.AzureKeyVaultSecret{}
	}
	const scope = "azure.key-vault-secrets"
	queryHash := profile.ProfileID + "|" + vaultName
	secrets, err := s.azure.ListKeyVaultSecrets(ctx, profile, vaultName)
	if err == nil {
		_ = s.store.SaveResourceCache(ctx, scope, queryHash, secrets, s.timestamp())
		return secrets
	}
	var cached []models.AzureKeyVaultSecret
	_, ok, cacheErr := s.store.LoadResourceCache(ctx, scope, queryHash, &cached)
	if cacheErr == nil && ok {
		return cached
	}
	return []models.AzureKeyVaultSecret{}
}

func (s *Service) selectedAzureKeyVault(
	session models.SessionSnapshot,
	vaults []models.AzureKeyVault,
) string {
	if session.SelectedAzureKeyVault != "" {
		for _, vault := range vaults {
			if vault.Name == session.SelectedAzureKeyVault {
				return session.SelectedAzureKeyVault
			}
		}
	}
	if len(vaults) == 0 {
		return ""
	}
	return vaults[0].Name
}

func (s *Service) selectedAzureSecret(
	session models.SessionSnapshot,
	secrets []models.AzureKeyVaultSecret,
) string {
	if session.SelectedAzureSecret != "" {
		for _, secret := range secrets {
			if secret.Name == session.SelectedAzureSecret {
				return session.SelectedAzureSecret
			}
		}
	}
	if len(secrets) == 0 {
		return ""
	}
	return secrets[0].Name
}

func (s *Service) enrichAzureKeyVaultInventory(
	workspace *models.WorkspaceSnapshot,
	session models.SessionSnapshot,
	opts azureEnrichmentOptions,
	mu *sync.Mutex,
) {
	if workspace.Provider == nil ||
		workspace.Provider.ProviderID != "azure" ||
		workspace.Profile == nil ||
		s.azure == nil {
		return
	}
	ctx, cancel := s.withAzureTimeout(context.Background())
	defer cancel()
	profile := *workspace.Profile

	vaults := s.azureKeyVaults(ctx, profile)
	selectedVault := s.selectedAzureKeyVault(session, vaults)

	var (
		secrets        []models.AzureKeyVaultSecret
		selectedSecret string
		status         string
	)
	if opts.lightweight {
		if len(vaults) == 0 {
			status = "No Key Vaults found. Create one, then manage secrets here."
		} else {
			status = fmt.Sprintf("Loaded %d Key Vault(s).", len(vaults))
		}
		lockWorkspace(mu, func() {
			workspace.AzureKeyVaults = vaults
			workspace.SelectedAzureKeyVault = selectedVault
			workspace.AzureKeyVaultSecrets = []models.AzureKeyVaultSecret{}
			workspace.SelectedAzureSecret = ""
			workspace.AzureKeyVaultStatusMessage = status
		})
		return
	}

	secrets = s.azureKeyVaultSecrets(ctx, profile, selectedVault)
	selectedSecret = s.selectedAzureSecret(session, secrets)
	if len(vaults) == 0 {
		status = "No Key Vaults found. Create one, then manage secrets here."
	} else {
		status = fmt.Sprintf("Loaded %d Key Vault(s).", len(vaults))
	}
	lockWorkspace(mu, func() {
		workspace.AzureKeyVaults = vaults
		workspace.SelectedAzureKeyVault = selectedVault
		workspace.AzureKeyVaultSecrets = secrets
		workspace.SelectedAzureSecret = selectedSecret
		workspace.AzureKeyVaultStatusMessage = status
	})
}

// lockedAzureProfile resolves the locked Azure workspace's profile, returning an
// error when the workspace is not an open Azure session.
func (s *Service) lockedAzureProfile(ctx context.Context) (models.ProfileSummary, models.SessionSnapshot, error) {
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return models.ProfileSummary{}, models.SessionSnapshot{}, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	session, err := s.currentState(ctx, snapshot)
	if err != nil {
		return models.ProfileSummary{}, models.SessionSnapshot{}, err
	}
	if !session.IsLocked || session.CurrentProviderID != "azure" {
		return models.ProfileSummary{}, session, errors.New("open a locked Azure workspace first")
	}
	profile, ok := findProfile(filterProfiles(snapshot.Profiles, session.CurrentProviderID), session.SelectedProfileID)
	if !ok {
		return models.ProfileSummary{}, session, errors.New("the workspace's Azure profile is not available")
	}
	return profile, session, nil
}
