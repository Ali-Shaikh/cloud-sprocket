// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"fmt"
	"strings"
	"sync"

	"cloudsprocket/backend/daemon/internal/models"
)

func (s *Service) selectedAzureStorageAccount(
	session models.SessionSnapshot,
	accounts []models.AzureStorageAccount,
) string {
	if session.SelectedAzureStorageAccount != "" {
		for _, account := range accounts {
			if account.Name == session.SelectedAzureStorageAccount {
				return session.SelectedAzureStorageAccount
			}
		}
	}
	if len(accounts) == 0 {
		return ""
	}
	return accounts[0].Name
}

func (s *Service) selectedAzureBlobContainer(
	session models.SessionSnapshot,
	containers []models.AzureBlobContainer,
) string {
	if session.SelectedAzureBlobContainer != "" {
		for _, container := range containers {
			if container.Name == session.SelectedAzureBlobContainer {
				return session.SelectedAzureBlobContainer
			}
		}
	}
	if len(containers) == 0 {
		return ""
	}
	return containers[0].Name
}

func (s *Service) selectedAzureBlobName(
	session models.SessionSnapshot,
	blobs []models.AzureBlob,
) string {
	if session.SelectedAzureBlobName != "" {
		for _, blob := range blobs {
			if blob.Name == session.SelectedAzureBlobName {
				return session.SelectedAzureBlobName
			}
		}
	}
	if len(blobs) == 0 {
		return ""
	}
	return blobs[0].Name
}

func (s *Service) azureStorageAccounts(
	ctx context.Context,
	profile models.ProfileSummary,
) []models.AzureStorageAccount {
	accounts, _ := s.azureStorageAccountsResult(ctx, profile)
	return accounts
}

// azureStorageAccountsResult lists storage accounts and surfaces list failures
// when no cache is available (callers previously saw a silent empty list).
func (s *Service) azureStorageAccountsResult(
	ctx context.Context,
	profile models.ProfileSummary,
) ([]models.AzureStorageAccount, error) {
	const scope = "azure.storage.accounts"
	queryHash := profile.ProfileID
	var cached []models.AzureStorageAccount
	if _, ok, _ := s.loadCachedResource(ctx, scope, queryHash, &cached); ok {
		return cached, nil
	}

	accounts, err := s.azure.ListStorageAccounts(ctx, profile)
	if err == nil {
		_ = s.saveResourceCacheWithTTL(ctx, scope, queryHash, accounts)
		return accounts, nil
	}
	_, ok, cacheErr := s.store.LoadResourceCache(ctx, scope, queryHash, &cached)
	if cacheErr == nil && ok {
		return cached, nil
	}
	return []models.AzureStorageAccount{}, err
}

func (s *Service) azureBlobContainers(
	ctx context.Context,
	profile models.ProfileSummary,
	accountName string,
) []models.AzureBlobContainer {
	containers, _ := s.azureBlobContainersResult(ctx, profile, accountName)
	return containers
}

func (s *Service) azureBlobContainersResult(
	ctx context.Context,
	profile models.ProfileSummary,
	accountName string,
) ([]models.AzureBlobContainer, error) {
	if accountName == "" {
		return []models.AzureBlobContainer{}, nil
	}
	const scope = "azure.storage.containers"
	queryHash := profile.ProfileID + "|" + accountName
	var cached []models.AzureBlobContainer
	if _, ok, _ := s.loadCachedResource(ctx, scope, queryHash, &cached); ok {
		return cached, nil
	}

	containers, err := s.azure.ListBlobContainers(ctx, profile, accountName)
	if err == nil {
		_ = s.saveResourceCacheWithTTL(ctx, scope, queryHash, containers)
		return containers, nil
	}
	_, ok, cacheErr := s.store.LoadResourceCache(ctx, scope, queryHash, &cached)
	if cacheErr == nil && ok {
		return cached, nil
	}
	return []models.AzureBlobContainer{}, err
}

func (s *Service) azureBlobs(
	ctx context.Context,
	profile models.ProfileSummary,
	accountName string,
	containerName string,
	prefix string,
) []models.AzureBlob {
	blobs, _ := s.azureBlobsResult(ctx, profile, accountName, containerName, prefix)
	return blobs
}

func (s *Service) azureBlobsResult(
	ctx context.Context,
	profile models.ProfileSummary,
	accountName string,
	containerName string,
	prefix string,
) ([]models.AzureBlob, error) {
	if accountName == "" || containerName == "" {
		return []models.AzureBlob{}, nil
	}
	const scope = "azure.storage.blobs"
	queryHash := profile.ProfileID + "|" + accountName + "|" + containerName + "|" + prefix
	var cached []models.AzureBlob
	if _, ok, _ := s.loadCachedResource(ctx, scope, queryHash, &cached); ok {
		return cached, nil
	}

	blobs, err := s.azure.ListBlobs(ctx, profile, accountName, containerName, prefix)
	if err == nil {
		_ = s.saveResourceCacheWithTTL(ctx, scope, queryHash, blobs)
		return blobs, nil
	}
	_, ok, cacheErr := s.store.LoadResourceCache(ctx, scope, queryHash, &cached)
	if cacheErr == nil && ok {
		return cached, nil
	}
	return []models.AzureBlob{}, err
}

// azureStorageErrorStatus builds a multi-line status the UI can render as a banner:
//
//	line 0: short title (what failed)
//	line 1: plain-language guidance
//	line 2+: technical detail (optional)
func azureStorageErrorStatus(title string, err error) string {
	if err == nil {
		return title
	}
	guidance, detail := classifyAzureStorageListError(err)
	var b strings.Builder
	b.WriteString(strings.TrimSpace(title))
	b.WriteByte('\n')
	b.WriteString(guidance)
	if detail != "" {
		b.WriteByte('\n')
		b.WriteString(detail)
	}
	return b.String()
}

// classifyAzureStorageListError returns user guidance and optional technical detail.
// Network-isolated accounts are the common real-world case for empty containers.
func classifyAzureStorageListError(err error) (guidance string, detail string) {
	if err == nil {
		return "", ""
	}
	msg := strings.TrimSpace(err.Error())
	lower := strings.ToLower(msg)
	switch {
	case strings.Contains(lower, "network rule") ||
		strings.Contains(lower, "publicnetworkaccess") ||
		strings.Contains(lower, "public network access") ||
		(strings.Contains(lower, "authorizationfailure") && strings.Contains(lower, "firewall")) ||
		strings.Contains(lower, "this request is not authorized to perform this operation") ||
		strings.Contains(lower, "blocked by network"):
		return "This storage account blocks public network access (firewall or private endpoint). " +
			"Private container access settings are unrelated. Connect via VPN/private network, or allow this machine's IP on the storage firewall.", msg
	case strings.Contains(lower, "deadline exceeded") ||
		strings.Contains(lower, "context deadline") ||
		strings.Contains(lower, "timed out") ||
		strings.Contains(lower, "timeout"):
		return "The storage request timed out. Check network connectivity to Azure and try again.", msg
	case strings.Contains(lower, "authentication") || strings.Contains(lower, "unauthorized") || strings.Contains(lower, "login"):
		return "Authentication failed. Sign in with Azure CLI (az login) and confirm you can access this subscription.", msg
	default:
		return "The storage data plane request failed. Check permissions, network rules, and Azure CLI sign-in.", msg
	}
}

// formatAzureStorageListError is a single-line form for tests and log-style call sites.
func formatAzureStorageListError(err error) string {
	if err == nil {
		return ""
	}
	guidance, detail := classifyAzureStorageListError(err)
	if detail == "" || detail == guidance {
		return guidance
	}
	return guidance + " Detail: " + detail
}

func (s *Service) enrichAzureStorageInventory(
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

	accounts, listErr := s.azureStorageAccountsResult(ctx, profile)
	selectedAccount := s.selectedAzureStorageAccount(session, accounts)

	var (
		containers        []models.AzureBlobContainer
		selectedContainer string
		blobs             []models.AzureBlob
		selectedBlob      string
		metadata          []models.DetailField
		status            string
	)

	if opts.lightweight {
		switch {
		case listErr != nil && len(accounts) == 0:
			status = azureStorageErrorStatus("Could not list storage accounts", listErr)
		case len(accounts) == 0:
			status = "No Azure storage accounts are currently available for this workspace."
		case selectedAccount == "":
			status = "Select a storage account to browse blob containers."
		default:
			status = fmt.Sprintf("Loaded %d storage account(s). Select one to browse containers.", len(accounts))
		}
		lockWorkspace(mu, func() {
			workspace.AzureStorageAccounts = accounts
			workspace.SelectedAzureStorageAccount = selectedAccount
			workspace.AzureBlobContainers = []models.AzureBlobContainer{}
			workspace.SelectedAzureBlobContainer = ""
			workspace.AzureBlobPrefixFilter = session.AzureBlobPrefixFilter
			workspace.AzureBlobs = []models.AzureBlob{}
			workspace.SelectedAzureBlobName = ""
			workspace.AzureBlobMetadata = nil
			workspace.AzureStorageStatusMessage = status
			reason := models.InventoryEmptyNoneFound
			if listErr != nil && len(accounts) == 0 {
				reason = models.InventoryEmptyError
			}
			markAzureInventory(workspace, "storage", len(accounts), reason)
		})
		return
	}

	var containersErr error
	var blobsErr error
	containers, containersErr = s.azureBlobContainersResult(ctx, profile, selectedAccount)
	selectedContainer = s.selectedAzureBlobContainer(session, containers)
	blobs, blobsErr = s.azureBlobsResult(ctx, profile, selectedAccount, selectedContainer, session.AzureBlobPrefixFilter)
	selectedBlob = s.selectedAzureBlobName(session, blobs)

	switch {
	case listErr != nil && len(accounts) == 0:
		status = azureStorageErrorStatus("Could not list storage accounts", listErr)
	case selectedAccount == "":
		status = "No Azure storage accounts are currently available for this workspace."
	case containersErr != nil && len(containers) == 0:
		status = azureStorageErrorStatus(
			fmt.Sprintf("Could not list containers in %s", selectedAccount),
			containersErr,
		)
	case selectedContainer == "":
		if len(containers) == 0 {
			status = fmt.Sprintf("No blob containers found in %s.", selectedAccount)
		} else {
			status = fmt.Sprintf("Select a blob container in %s to browse objects.", selectedAccount)
		}
	case blobsErr != nil && len(blobs) == 0:
		status = azureStorageErrorStatus(
			fmt.Sprintf("Could not list blobs in %s/%s", selectedAccount, selectedContainer),
			blobsErr,
		)
	case len(blobs) == 0:
		if session.AzureBlobPrefixFilter != "" {
			status = fmt.Sprintf(
				"No blobs matched prefix %q in %s/%s.",
				session.AzureBlobPrefixFilter,
				selectedAccount,
				selectedContainer,
			)
		} else {
			status = fmt.Sprintf("No blobs were returned for %s/%s.", selectedAccount, selectedContainer)
		}
	default:
		status = fmt.Sprintf("Loaded %d blobs from %s/%s.", len(blobs), selectedAccount, selectedContainer)
	}

	if len(blobs) > 0 && selectedBlob != "" {
		for _, blob := range blobs {
			if blob.Name == selectedBlob {
				metadata = []models.DetailField{
					{Label: "Name", Value: blob.Name},
					{Label: "Size", Value: blob.Size},
					{Label: "Last Modified", Value: blob.ModifiedAt},
					{Label: "Content Type", Value: blob.ContentType},
				}
				break
			}
		}
	}

	lockWorkspace(mu, func() {
		workspace.AzureStorageAccounts = accounts
		workspace.SelectedAzureStorageAccount = selectedAccount
		workspace.AzureBlobContainers = containers
		workspace.SelectedAzureBlobContainer = selectedContainer
		workspace.AzureBlobPrefixFilter = session.AzureBlobPrefixFilter
		workspace.AzureBlobs = blobs
		workspace.SelectedAzureBlobName = selectedBlob
		workspace.AzureBlobMetadata = metadata
		workspace.AzureStorageStatusMessage = status
		reason := models.InventoryEmptyNoneFound
		if listErr != nil && len(accounts) == 0 {
			reason = models.InventoryEmptyError
		}
		markAzureInventory(workspace, "storage", len(accounts), reason)
	})
}
