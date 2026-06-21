package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

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

func (s *Service) enrichAzureKeyVaultInventory(workspace *models.WorkspaceSnapshot, session models.SessionSnapshot) {
	if workspace.Provider == nil ||
		workspace.Provider.ProviderID != "azure" ||
		workspace.Profile == nil ||
		s.azure == nil {
		return
	}
	ctx, cancel := s.withAzureTimeout(context.Background())
	defer cancel()
	workspace.AzureKeyVaults = s.azureKeyVaults(ctx, *workspace.Profile)
	workspace.SelectedAzureKeyVault = s.selectedAzureKeyVault(session, workspace.AzureKeyVaults)
	workspace.AzureKeyVaultSecrets = s.azureKeyVaultSecrets(ctx, *workspace.Profile, workspace.SelectedAzureKeyVault)
	workspace.SelectedAzureSecret = s.selectedAzureSecret(session, workspace.AzureKeyVaultSecrets)
	if len(workspace.AzureKeyVaults) == 0 {
		workspace.AzureKeyVaultStatusMessage = "No Key Vaults found. Create one, then manage secrets here."
		return
	}
	workspace.AzureKeyVaultStatusMessage = fmt.Sprintf("Loaded %d Key Vault(s).", len(workspace.AzureKeyVaults))
}

func (s *Service) handleAzureKeyVaultSelectVault(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		VaultName string `json:"vaultName"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAzureWorkspace(ctx, "open an Azure workspace before selecting a key vault", func(session *models.SessionSnapshot) error {
		session.SelectedAzureKeyVault = strings.TrimSpace(request.VaultName)
		session.SelectedAzureSecret = ""
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAzureWorkspace(ctx, snapshot, session, notifier, "", "")
}

func (s *Service) handleAzureKeyVaultSelectSecret(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		SecretName string `json:"secretName"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAzureWorkspace(ctx, "open an Azure workspace before selecting a secret", func(session *models.SessionSnapshot) error {
		session.SelectedAzureSecret = strings.TrimSpace(request.SecretName)
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAzureWorkspace(ctx, snapshot, session, notifier, "", "")
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
	if !effectiveAzureWritesEnabled(session, profile, s.azureProviderCommandPath(snapshot)) {
		// Caller decides whether writes are required; return the profile and a sentinel.
		return profile, session, nil
	}
	return profile, session, nil
}

func (s *Service) handleAzureKeyVaultRevealSecret(ctx context.Context, params json.RawMessage, _ Notifier) (any, error) {
	var request struct {
		VaultName  string `json:"vaultName"`
		SecretName string `json:"secretName"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	if strings.TrimSpace(request.VaultName) == "" || strings.TrimSpace(request.SecretName) == "" {
		return nil, errors.New("a key vault and secret name are required")
	}
	profile, _, err := s.lockedAzureProfile(ctx)
	if err != nil {
		return nil, err
	}
	timeoutCtx, cancel := s.withAzureTimeout(ctx)
	defer cancel()
	value, err := s.azure.GetKeyVaultSecret(timeoutCtx, profile, request.VaultName, request.SecretName)
	if err != nil {
		return nil, err
	}
	return map[string]string{"value": value}, nil
}

func (s *Service) handleAzureKeyVaultSetSecret(ctx context.Context, params json.RawMessage, _ Notifier) (any, error) {
	var request struct {
		VaultName  string `json:"vaultName"`
		SecretName string `json:"secretName"`
		Value      string `json:"value"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	vaultName := strings.TrimSpace(request.VaultName)
	secretName := strings.TrimSpace(request.SecretName)
	if vaultName == "" || secretName == "" {
		return nil, errors.New("a key vault and secret name are required")
	}
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	s.mu.Lock()
	session, err := s.currentState(ctx, snapshot)
	if err != nil {
		s.mu.Unlock()
		return nil, err
	}
	if !session.IsLocked || session.CurrentProviderID != "azure" {
		s.mu.Unlock()
		return nil, errors.New("open a locked Azure workspace before setting a secret")
	}
	profile, ok := findProfile(filterProfiles(snapshot.Profiles, session.CurrentProviderID), session.SelectedProfileID)
	if !ok {
		s.mu.Unlock()
		return nil, errors.New("the workspace's Azure profile is not available")
	}
	if !effectiveAzureWritesEnabled(session, profile, s.azureProviderCommandPath(snapshot)) {
		s.mu.Unlock()
		return nil, errors.New("setting a secret requires write mode to be enabled for this Azure workspace")
	}
	s.mu.Unlock()

	timeoutCtx, cancel := s.withAzureTimeout(ctx)
	defer cancel()
	return s.azure.SetKeyVaultSecret(timeoutCtx, profile, vaultName, secretName, request.Value)
}
