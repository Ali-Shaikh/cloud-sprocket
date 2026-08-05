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

	"cloudsprocket/backend/daemon/internal/discovery"
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
	})
}

func (s *Service) activeAzureStorageSelection(
	snapshot discovery.Snapshot,
	session models.SessionSnapshot,
	requireContainer bool,
) (models.ProfileSummary, string, string, error) {
	if !session.IsLocked || session.CurrentProviderID != "azure" {
		return models.ProfileSummary{}, "", "", errors.New("open an Azure workspace before using storage actions")
	}
	profile, ok := findProfile(filterProfiles(snapshot.Profiles, session.CurrentProviderID), session.SelectedProfileID)
	if !ok {
		return models.ProfileSummary{}, "", "", errors.New("the workspace's Azure profile is not available")
	}
	accountName := session.SelectedAzureStorageAccount
	if accountName == "" {
		accountName = s.selectedAzureStorageAccount(session, s.azureStorageAccounts(context.Background(), profile))
	}
	if accountName == "" {
		return models.ProfileSummary{}, "", "", errors.New("select a storage account before using this action")
	}
	containerName := session.SelectedAzureBlobContainer
	if requireContainer {
		if containerName == "" {
			containerName = s.selectedAzureBlobContainer(session, s.azureBlobContainers(context.Background(), profile, accountName))
		}
		if containerName == "" {
			return models.ProfileSummary{}, "", "", errors.New("select a blob container before using this action")
		}
	}
	return profile, accountName, containerName, nil
}

func (s *Service) handleAzureStorageCreateAccount(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		ResourceGroup string `json:"resourceGroup"`
		AccountName   string `json:"accountName"`
		Location      string `json:"location"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	resourceGroup := strings.TrimSpace(request.ResourceGroup)
	accountName := strings.ToLower(strings.TrimSpace(request.AccountName))
	if resourceGroup == "" || accountName == "" {
		return nil, errors.New("resource group and storage account name are required")
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
		return nil, errors.New("open a locked Azure workspace before creating a storage account")
	}
	profile, ok := findProfile(filterProfiles(snapshot.Profiles, session.CurrentProviderID), session.SelectedProfileID)
	if !ok {
		s.mu.Unlock()
		return nil, errors.New("the workspace's Azure profile is not available")
	}
	if !effectiveAzureWritesEnabled(session, profile, s.azureProviderCommandPath(snapshot)) {
		s.mu.Unlock()
		return nil, errors.New("storage account create requires write mode to be enabled for this Azure workspace")
	}
	s.mu.Unlock()

	timeoutCtx, cancel := s.withAzureTimeout(ctx)
	defer cancel()
	created, err := s.azure.CreateStorageAccount(timeoutCtx, profile, resourceGroup, accountName, request.Location)
	if err != nil {
		return nil, err
	}
	s.invalidateResourceCache(ctx, "azure.storage.accounts", profile.ProfileID)
	s.mu.Lock()
	session, err = s.currentState(ctx, snapshot)
	if err != nil {
		s.mu.Unlock()
		return nil, err
	}
	session.SelectedAzureStorageAccount = created.Name
	session.SelectedAzureBlobContainer = ""
	session.SelectedAzureBlobName = ""
	if err := s.store.SaveSession(ctx, session); err != nil {
		s.mu.Unlock()
		return nil, err
	}
	s.mu.Unlock()
	return s.finishAzureWorkspaceOpts(ctx, snapshot, session, notifier, workspaceSnapshotOptions{
		skipAwsInventory: true,
		azureScope:       "storage",
	}, "success", fmt.Sprintf("Created storage account %s.", created.Name))
}

func (s *Service) handleAzureStorageCreateContainer(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		ContainerName string `json:"containerName"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	containerName := strings.TrimSpace(request.ContainerName)
	if containerName == "" {
		return nil, errors.New("container name is required")
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
	profile, accountName, _, err := s.activeAzureStorageSelection(snapshot, session, false)
	if err != nil {
		s.mu.Unlock()
		return nil, err
	}
	if !effectiveAzureWritesEnabled(session, profile, s.azureProviderCommandPath(snapshot)) {
		s.mu.Unlock()
		return nil, errors.New("blob container create requires write mode to be enabled for this Azure workspace")
	}
	s.mu.Unlock()

	timeoutCtx, cancel := s.withAzureTimeout(ctx)
	defer cancel()
	if err := s.azure.CreateBlobContainer(timeoutCtx, profile, accountName, containerName); err != nil {
		return nil, err
	}
	s.invalidateResourceCache(ctx, "azure.storage.containers", profile.ProfileID+"|"+accountName)
	s.mu.Lock()
	session, err = s.currentState(ctx, snapshot)
	if err != nil {
		s.mu.Unlock()
		return nil, err
	}
	session.SelectedAzureStorageAccount = accountName
	session.SelectedAzureBlobContainer = containerName
	session.SelectedAzureBlobName = ""
	if err := s.store.SaveSession(ctx, session); err != nil {
		s.mu.Unlock()
		return nil, err
	}
	s.mu.Unlock()
	return s.finishAzureWorkspaceOpts(ctx, snapshot, session, notifier, workspaceSnapshotOptions{
		skipAwsInventory: true,
		azureScope:       "storage",
	}, "success", fmt.Sprintf("Created blob container %s in %s.", containerName, accountName))
}

func (s *Service) handleAzureStorageUploadBlob(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		SourcePath string `json:"sourcePath"`
		BlobName   string `json:"blobName"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	if err := validateAzureBlobUploadRequest(request.SourcePath, request.BlobName); err != nil {
		return nil, err
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
	profile, accountName, containerName, err := s.activeAzureStorageSelection(snapshot, session, true)
	if err != nil {
		s.mu.Unlock()
		return nil, err
	}
	if !effectiveAzureWritesEnabled(session, profile, s.azureProviderCommandPath(snapshot)) {
		s.mu.Unlock()
		return nil, errors.New("blob upload requires write mode to be enabled for this Azure workspace")
	}
	prefix := session.AzureBlobPrefixFilter
	s.mu.Unlock()

	timeoutCtx, cancel := s.withAzureTimeout(ctx)
	defer cancel()
	result, err := s.azure.UploadBlob(timeoutCtx, profile, accountName, containerName, request.BlobName, request.SourcePath)
	if err != nil {
		return nil, err
	}
	s.invalidateResourceCache(ctx, "azure.storage.blobs", profile.ProfileID+"|"+accountName+"|"+containerName+"|"+prefix)
	s.mu.Lock()
	session, err = s.currentState(ctx, snapshot)
	if err != nil {
		s.mu.Unlock()
		return nil, err
	}
	session.SelectedAzureStorageAccount = accountName
	session.SelectedAzureBlobContainer = containerName
	session.SelectedAzureBlobName = request.BlobName
	session.AzureBlobPrefixFilter = prefix
	if err := s.store.SaveSession(ctx, session); err != nil {
		s.mu.Unlock()
		return nil, err
	}
	s.mu.Unlock()
	workspace, notifyErr := s.finishAzureWorkspaceOpts(
		ctx,
		snapshot,
		session,
		notifier,
		workspaceSnapshotOptions{
			skipAwsInventory: true,
			azureScope:       "storage",
		},
		"success",
		fmt.Sprintf("Uploaded blob %s to %s/%s.", request.BlobName, accountName, containerName),
	)
	if notifyErr != nil {
		return nil, notifyErr
	}
	return map[string]any{
		"workspace": workspace,
		"result":    result,
	}, nil
}

func (s *Service) handleAzureStorageDeleteBlob(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		BlobName string `json:"blobName"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	blobName := strings.TrimSpace(request.BlobName)
	if blobName == "" {
		return nil, errors.New("blob name is required")
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
	profile, accountName, containerName, err := s.activeAzureStorageSelection(snapshot, session, true)
	if err != nil {
		s.mu.Unlock()
		return nil, err
	}
	if !effectiveAzureWritesEnabled(session, profile, s.azureProviderCommandPath(snapshot)) {
		s.mu.Unlock()
		return nil, errors.New("blob delete requires write mode to be enabled for this Azure workspace")
	}
	s.mu.Unlock()

	timeoutCtx, cancel := s.withAzureTimeout(ctx)
	defer cancel()
	if err := s.azure.DeleteBlob(timeoutCtx, profile, accountName, containerName, blobName); err != nil {
		return nil, err
	}
	s.invalidateResourceCacheScope(ctx, "azure.storage.blobs")
	s.mu.Lock()
	session, err = s.currentState(ctx, snapshot)
	if err != nil {
		s.mu.Unlock()
		return nil, err
	}
	if session.SelectedAzureBlobName == blobName {
		session.SelectedAzureBlobName = ""
	}
	if err := s.store.SaveSession(ctx, session); err != nil {
		s.mu.Unlock()
		return nil, err
	}
	s.mu.Unlock()
	return s.finishAzureWorkspaceOpts(ctx, snapshot, session, notifier, workspaceSnapshotOptions{
		skipAwsInventory: true,
		azureScope:       "storage",
	}, "success", fmt.Sprintf("Deleted blob %s from %s/%s.", blobName, accountName, containerName))
}

func (s *Service) handleAzureStorageCopyBlob(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		SourceBlobName      string `json:"sourceBlobName"`
		DestinationBlobName string `json:"destinationBlobName"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	destinationBlobName := strings.TrimSpace(request.DestinationBlobName)
	if destinationBlobName == "" {
		return nil, errors.New("destination blob name is required")
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
	profile, accountName, containerName, err := s.activeAzureStorageSelection(snapshot, session, true)
	if err != nil {
		s.mu.Unlock()
		return nil, err
	}
	if !effectiveAzureWritesEnabled(session, profile, s.azureProviderCommandPath(snapshot)) {
		s.mu.Unlock()
		return nil, errors.New("blob copy requires write mode to be enabled for this Azure workspace")
	}
	sourceBlobName := strings.TrimSpace(request.SourceBlobName)
	if sourceBlobName == "" {
		sourceBlobName = session.SelectedAzureBlobName
	}
	if sourceBlobName == "" {
		s.mu.Unlock()
		return nil, errors.New("select a source blob before copying")
	}
	prefix := session.AzureBlobPrefixFilter
	s.mu.Unlock()

	timeoutCtx, cancel := s.withAzureTimeout(ctx)
	defer cancel()
	result, err := s.azure.CopyBlob(timeoutCtx, profile, accountName, containerName, sourceBlobName, destinationBlobName)
	if err != nil {
		return nil, err
	}
	s.invalidateResourceCache(ctx, "azure.storage.blobs", profile.ProfileID+"|"+accountName+"|"+containerName+"|"+prefix)
	s.mu.Lock()
	session, err = s.currentState(ctx, snapshot)
	if err != nil {
		s.mu.Unlock()
		return nil, err
	}
	session.SelectedAzureStorageAccount = accountName
	session.SelectedAzureBlobContainer = containerName
	session.SelectedAzureBlobName = destinationBlobName
	session.AzureBlobPrefixFilter = prefix
	if err := s.store.SaveSession(ctx, session); err != nil {
		s.mu.Unlock()
		return nil, err
	}
	s.mu.Unlock()
	workspace, notifyErr := s.finishAzureWorkspaceOpts(
		ctx,
		snapshot,
		session,
		notifier,
		workspaceSnapshotOptions{
			skipAwsInventory: true,
			azureScope:       "storage",
		},
		"success",
		fmt.Sprintf("Copied blob %s to %s in %s/%s.", sourceBlobName, destinationBlobName, accountName, containerName),
	)
	if notifyErr != nil {
		return nil, notifyErr
	}
	return map[string]any{
		"workspace": workspace,
		"result":    result,
	}, nil
}

func (s *Service) handleAzureStorageCreateFolderPrefix(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		FolderPrefix string `json:"folderPrefix"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	folderPrefix := strings.TrimSpace(request.FolderPrefix)
	if folderPrefix == "" {
		return nil, errors.New("folder prefix is required")
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
	profile, accountName, containerName, err := s.activeAzureStorageSelection(snapshot, session, true)
	if err != nil {
		s.mu.Unlock()
		return nil, err
	}
	if !effectiveAzureWritesEnabled(session, profile, s.azureProviderCommandPath(snapshot)) {
		s.mu.Unlock()
		return nil, errors.New("folder create requires write mode to be enabled for this Azure workspace")
	}
	s.mu.Unlock()

	timeoutCtx, cancel := s.withAzureTimeout(ctx)
	defer cancel()
	result, err := s.azure.CreateFolderPrefix(timeoutCtx, profile, accountName, containerName, folderPrefix)
	if err != nil {
		return nil, err
	}
	s.invalidateResourceCacheScope(ctx, "azure.storage.blobs")
	s.mu.Lock()
	session, err = s.currentState(ctx, snapshot)
	if err != nil {
		s.mu.Unlock()
		return nil, err
	}
	session.SelectedAzureStorageAccount = accountName
	session.SelectedAzureBlobContainer = containerName
	session.AzureBlobPrefixFilter = result.FolderPrefix
	session.SelectedAzureBlobName = ""
	if err := s.store.SaveSession(ctx, session); err != nil {
		s.mu.Unlock()
		return nil, err
	}
	s.mu.Unlock()
	return s.finishAzureWorkspaceOpts(
		ctx,
		snapshot,
		session,
		notifier,
		workspaceSnapshotOptions{
			skipAwsInventory: true,
			azureScope:       "storage",
		},
		"success",
		fmt.Sprintf("Created folder prefix %s in %s/%s.", result.FolderPrefix, accountName, containerName),
	)
}

func validateAzureBlobUploadRequest(sourcePath string, blobName string) error {
	sourcePath = strings.TrimSpace(sourcePath)
	blobName = strings.TrimSpace(blobName)
	if sourcePath == "" || blobName == "" {
		return errors.New("source path and destination blob name are required")
	}
	if strings.HasPrefix(blobName, "/") || strings.HasPrefix(blobName, "\\") {
		return errors.New("destination blob name must be relative to the selected container")
	}
	if strings.Contains(blobName, "\\") {
		return errors.New("destination blob name must use forward slashes")
	}
	return validateS3UploadRequest(sourcePath, blobName)
}