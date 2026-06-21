// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package azureadapter

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strings"

	"cloudsprocket/backend/daemon/internal/models"
)

const keyVaultAPIVersion = "7.4"

// ListKeyVaults returns the Key Vaults visible to the profile. floci-az serves the
// ARM vault list locally; cloud uses the az CLI.
func (i *Inventory) ListKeyVaults(
	ctx context.Context,
	profile models.ProfileSummary,
) ([]models.AzureKeyVault, error) {
	if isLocalFlociProfile(profile) {
		return i.listLocalKeyVaults(ctx)
	}
	args := []string{
		"keyvault", "list",
		"--subscription", profile.ProfileID,
		"--output", "json",
		"--only-show-errors",
	}
	payload, err := i.run(ctx, args...)
	if err != nil {
		return nil, err
	}
	var decoded []struct {
		Name          string `json:"name"`
		ResourceGroup string `json:"resourceGroup"`
		Location      string `json:"location"`
		Properties    struct {
			VaultURI string `json:"vaultUri"`
		} `json:"properties"`
	}
	if err := json.Unmarshal(payload, &decoded); err != nil {
		return nil, fmt.Errorf("decode azure key vaults: %w", err)
	}
	vaults := make([]models.AzureKeyVault, 0, len(decoded))
	for _, item := range decoded {
		vaults = append(vaults, models.AzureKeyVault{
			Name:          item.Name,
			ResourceGroup: item.ResourceGroup,
			Location:      item.Location,
			VaultURI:      item.Properties.VaultURI,
		})
	}
	sortKeyVaults(vaults)
	return vaults, nil
}

func (i *Inventory) listLocalKeyVaults(ctx context.Context) ([]models.AzureKeyVault, error) {
	url := fmt.Sprintf("%s/subscriptions/%s/providers/Microsoft.KeyVault/vaults?api-version=2023-07-01",
		i.flociBaseURL(), i.localSubscriptionID)
	var decoded struct {
		Value []struct {
			Name       string `json:"name"`
			Location   string `json:"location"`
			Properties struct {
				VaultURI string `json:"vaultUri"`
			} `json:"properties"`
		} `json:"value"`
	}
	if err := i.flociJSON(ctx, http.MethodGet, url, nil, &decoded); err != nil {
		return nil, err
	}
	vaults := make([]models.AzureKeyVault, 0, len(decoded.Value))
	for _, item := range decoded.Value {
		vaults = append(vaults, models.AzureKeyVault{
			Name:     item.Name,
			Location: item.Location,
			VaultURI: item.Properties.VaultURI,
		})
	}
	sortKeyVaults(vaults)
	return vaults, nil
}

func sortKeyVaults(vaults []models.AzureKeyVault) {
	sort.Slice(vaults, func(left, right int) bool {
		return strings.ToLower(vaults[left].Name) < strings.ToLower(vaults[right].Name)
	})
}

// ListKeyVaultSecrets lists secret metadata (no values) in a vault.
func (i *Inventory) ListKeyVaultSecrets(
	ctx context.Context,
	profile models.ProfileSummary,
	vaultName string,
) ([]models.AzureKeyVaultSecret, error) {
	vaultName = strings.TrimSpace(vaultName)
	if vaultName == "" {
		return nil, fmt.Errorf("a key vault is required")
	}
	if isLocalFlociProfile(profile) {
		url := fmt.Sprintf("%s/secrets?api-version=%s", i.flociVaultURL(vaultName), keyVaultAPIVersion)
		var decoded struct {
			Value []struct {
				ID         string `json:"id"`
				Attributes struct {
					Enabled bool  `json:"enabled"`
					Updated int64 `json:"updated"`
				} `json:"attributes"`
			} `json:"value"`
		}
		if err := i.flociJSON(ctx, http.MethodGet, url, nil, &decoded); err != nil {
			return nil, err
		}
		secrets := make([]models.AzureKeyVaultSecret, 0, len(decoded.Value))
		for _, item := range decoded.Value {
			secrets = append(secrets, models.AzureKeyVaultSecret{
				Name:    secretNameFromID(item.ID),
				Enabled: item.Attributes.Enabled,
			})
		}
		sortKeyVaultSecrets(secrets)
		return secrets, nil
	}
	args := []string{
		"keyvault", "secret", "list",
		"--subscription", profile.ProfileID,
		"--vault-name", vaultName,
		"--output", "json",
		"--only-show-errors",
	}
	payload, err := i.run(ctx, args...)
	if err != nil {
		return nil, err
	}
	var decoded []struct {
		ID         string `json:"id"`
		Name       string `json:"name"`
		Attributes struct {
			Enabled bool `json:"enabled"`
		} `json:"attributes"`
	}
	if err := json.Unmarshal(payload, &decoded); err != nil {
		return nil, fmt.Errorf("decode key vault secrets: %w", err)
	}
	secrets := make([]models.AzureKeyVaultSecret, 0, len(decoded))
	for _, item := range decoded {
		name := item.Name
		if name == "" {
			name = secretNameFromID(item.ID)
		}
		secrets = append(secrets, models.AzureKeyVaultSecret{Name: name, Enabled: item.Attributes.Enabled})
	}
	sortKeyVaultSecrets(secrets)
	return secrets, nil
}

// GetKeyVaultSecret fetches a secret's value (an explicit reveal action).
func (i *Inventory) GetKeyVaultSecret(
	ctx context.Context,
	profile models.ProfileSummary,
	vaultName string,
	secretName string,
) (string, error) {
	vaultName = strings.TrimSpace(vaultName)
	secretName = strings.TrimSpace(secretName)
	if vaultName == "" || secretName == "" {
		return "", fmt.Errorf("a key vault and secret name are required")
	}
	if isLocalFlociProfile(profile) {
		url := fmt.Sprintf("%s/secrets/%s?api-version=%s", i.flociVaultURL(vaultName), secretName, keyVaultAPIVersion)
		var decoded struct {
			Value string `json:"value"`
		}
		if err := i.flociJSON(ctx, http.MethodGet, url, nil, &decoded); err != nil {
			return "", err
		}
		return decoded.Value, nil
	}
	payload, err := i.run(ctx,
		"keyvault", "secret", "show",
		"--subscription", profile.ProfileID,
		"--vault-name", vaultName,
		"--name", secretName,
		"--output", "json",
		"--only-show-errors",
	)
	if err != nil {
		return "", err
	}
	var decoded struct {
		Value string `json:"value"`
	}
	if err := json.Unmarshal(payload, &decoded); err != nil {
		return "", fmt.Errorf("decode key vault secret: %w", err)
	}
	return decoded.Value, nil
}

// SetKeyVaultSecret creates or updates a secret value.
func (i *Inventory) SetKeyVaultSecret(
	ctx context.Context,
	profile models.ProfileSummary,
	vaultName string,
	secretName string,
	value string,
) (models.AzureKeyVaultSecret, error) {
	vaultName = strings.TrimSpace(vaultName)
	secretName = strings.TrimSpace(secretName)
	if vaultName == "" || secretName == "" {
		return models.AzureKeyVaultSecret{}, fmt.Errorf("a key vault and secret name are required")
	}
	if isLocalFlociProfile(profile) {
		url := fmt.Sprintf("%s/secrets/%s?api-version=%s", i.flociVaultURL(vaultName), secretName, keyVaultAPIVersion)
		var decoded struct {
			ID         string `json:"id"`
			Attributes struct {
				Enabled bool `json:"enabled"`
			} `json:"attributes"`
		}
		if err := i.flociJSON(ctx, http.MethodPut, url, map[string]string{"value": value}, &decoded); err != nil {
			return models.AzureKeyVaultSecret{}, err
		}
		return models.AzureKeyVaultSecret{Name: secretName, Enabled: decoded.Attributes.Enabled}, nil
	}
	_, err := i.run(ctx,
		"keyvault", "secret", "set",
		"--subscription", profile.ProfileID,
		"--vault-name", vaultName,
		"--name", secretName,
		"--value", value,
		"--output", "json",
		"--only-show-errors",
	)
	if err != nil {
		return models.AzureKeyVaultSecret{}, err
	}
	return models.AzureKeyVaultSecret{Name: secretName, Enabled: true}, nil
}

// flociVaultURL is the floci-az data-plane base for a vault.
func (i *Inventory) flociVaultURL(vaultName string) string {
	return fmt.Sprintf("%s/%s-keyvault", i.flociBaseURL(), vaultName)
}

// secretNameFromID extracts the secret name from a Key Vault secret id URL.
func secretNameFromID(id string) string {
	marker := "/secrets/"
	idx := strings.Index(id, marker)
	if idx < 0 {
		return ""
	}
	rest := id[idx+len(marker):]
	if slash := strings.Index(rest, "/"); slash >= 0 {
		rest = rest[:slash]
	}
	return rest
}

func sortKeyVaultSecrets(secrets []models.AzureKeyVaultSecret) {
	sort.Slice(secrets, func(left, right int) bool {
		return strings.ToLower(secrets[left].Name) < strings.ToLower(secrets[right].Name)
	})
}
