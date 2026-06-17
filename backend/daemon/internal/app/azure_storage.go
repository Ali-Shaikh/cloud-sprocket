package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

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
	const scope = "azure.storage.accounts"
	queryHash := profile.ProfileID
	accounts, err := s.azure.ListStorageAccounts(ctx, profile)
	if err == nil {
		_ = s.store.SaveResourceCache(ctx, scope, queryHash, accounts, s.timestamp())
		return accounts
	}
	var cached []models.AzureStorageAccount
	_, ok, cacheErr := s.store.LoadResourceCache(ctx, scope, queryHash, &cached)
	if cacheErr == nil && ok {
		return cached
	}
	return []models.AzureStorageAccount{}
}

func (s *Service) azureBlobContainers(
	ctx context.Context,
	profile models.ProfileSummary,
	accountName string,
) []models.AzureBlobContainer {
	if accountName == "" {
		return []models.AzureBlobContainer{}
	}
	const scope = "azure.storage.containers"
	queryHash := profile.ProfileID + "|" + accountName
	containers, err := s.azure.ListBlobContainers(ctx, profile, accountName)
	if err == nil {
		_ = s.store.SaveResourceCache(ctx, scope, queryHash, containers, s.timestamp())
		return containers
	}
	var cached []models.AzureBlobContainer
	_, ok, cacheErr := s.store.LoadResourceCache(ctx, scope, queryHash, &cached)
	if cacheErr == nil && ok {
		return cached
	}
	return []models.AzureBlobContainer{}
}

func (s *Service) azureBlobs(
	ctx context.Context,
	profile models.ProfileSummary,
	accountName string,
	containerName string,
	prefix string,
) []models.AzureBlob {
	if accountName == "" || containerName == "" {
		return []models.AzureBlob{}
	}
	const scope = "azure.storage.blobs"
	queryHash := profile.ProfileID + "|" + accountName + "|" + containerName + "|" + prefix
	blobs, err := s.azure.ListBlobs(ctx, profile, accountName, containerName, prefix)
	if err == nil {
		_ = s.store.SaveResourceCache(ctx, scope, queryHash, blobs, s.timestamp())
		return blobs
	}
	var cached []models.AzureBlob
	_, ok, cacheErr := s.store.LoadResourceCache(ctx, scope, queryHash, &cached)
	if cacheErr == nil && ok {
		return cached
	}
	return []models.AzureBlob{}
}

func (s *Service) enrichAzureStorageInventory(workspace *models.WorkspaceSnapshot, session models.SessionSnapshot) {
	if workspace.Provider == nil ||
		workspace.Provider.ProviderID != "azure" ||
		workspace.Profile == nil ||
		s.azure == nil {
		return
	}
	ctx, cancel := s.withAzureTimeout(context.Background())
	defer cancel()
	workspace.AzureStorageAccounts = s.azureStorageAccounts(ctx, *workspace.Profile)
	workspace.SelectedAzureStorageAccount = s.selectedAzureStorageAccount(session, workspace.AzureStorageAccounts)
	workspace.AzureBlobContainers = s.azureBlobContainers(ctx, *workspace.Profile, workspace.SelectedAzureStorageAccount)
	workspace.SelectedAzureBlobContainer = s.selectedAzureBlobContainer(session, workspace.AzureBlobContainers)
	workspace.AzureBlobPrefixFilter = session.AzureBlobPrefixFilter
	workspace.AzureBlobs = s.azureBlobs(
		ctx,
		*workspace.Profile,
		workspace.SelectedAzureStorageAccount,
		workspace.SelectedAzureBlobContainer,
		session.AzureBlobPrefixFilter,
	)
	workspace.SelectedAzureBlobName = s.selectedAzureBlobName(session, workspace.AzureBlobs)
	if workspace.SelectedAzureStorageAccount == "" {
		workspace.AzureStorageStatusMessage = "No Azure storage accounts are currently available for this workspace."
	} else if workspace.SelectedAzureBlobContainer == "" {
		workspace.AzureStorageStatusMessage = fmt.Sprintf(
			"Select a blob container in %s to browse objects.",
			workspace.SelectedAzureStorageAccount,
		)
	} else if len(workspace.AzureBlobs) == 0 {
		if session.AzureBlobPrefixFilter != "" {
			workspace.AzureStorageStatusMessage = fmt.Sprintf(
				"No blobs matched prefix %q in %s/%s.",
				session.AzureBlobPrefixFilter,
				workspace.SelectedAzureStorageAccount,
				workspace.SelectedAzureBlobContainer,
			)
		} else {
			workspace.AzureStorageStatusMessage = fmt.Sprintf(
				"No blobs were returned for %s/%s.",
				workspace.SelectedAzureStorageAccount,
				workspace.SelectedAzureBlobContainer,
			)
		}
	} else {
		workspace.AzureStorageStatusMessage = fmt.Sprintf(
			"Loaded %d blobs from %s/%s.",
			len(workspace.AzureBlobs),
			workspace.SelectedAzureStorageAccount,
			workspace.SelectedAzureBlobContainer,
		)
	}
	if len(workspace.AzureBlobs) > 0 && workspace.SelectedAzureBlobName != "" {
		for _, blob := range workspace.AzureBlobs {
			if blob.Name == workspace.SelectedAzureBlobName {
				workspace.AzureBlobMetadata = []models.DetailField{
					{Label: "Name", Value: blob.Name},
					{Label: "Size", Value: blob.Size},
					{Label: "Last Modified", Value: blob.ModifiedAt},
					{Label: "Content Type", Value: blob.ContentType},
				}
				break
			}
		}
	}
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

func (s *Service) handleAzureStorageSelectAccount(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		AccountName string `json:"accountName"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAzureWorkspace(ctx, "open an Azure workspace before selecting a storage account", func(session *models.SessionSnapshot) error {
		session.SelectedAzureStorageAccount = request.AccountName
		session.SelectedAzureBlobContainer = ""
		session.SelectedAzureBlobName = ""
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAzureWorkspace(ctx, snapshot, session, notifier, "info", fmt.Sprintf("Selected Azure storage account %s.", request.AccountName))
}

func (s *Service) handleAzureStorageSelectContainer(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		ContainerName string `json:"containerName"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAzureWorkspace(ctx, "open an Azure workspace before selecting a blob container", func(session *models.SessionSnapshot) error {
		session.SelectedAzureBlobContainer = request.ContainerName
		session.SelectedAzureBlobName = ""
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAzureWorkspace(ctx, snapshot, session, notifier, "info", fmt.Sprintf("Selected Azure blob container %s.", request.ContainerName))
}

func (s *Service) handleAzureStorageSelectBlob(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		BlobName string `json:"blobName"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAzureWorkspace(ctx, "open an Azure workspace before selecting a blob", func(session *models.SessionSnapshot) error {
		session.SelectedAzureBlobName = request.BlobName
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAzureWorkspace(ctx, snapshot, session, notifier, "", "")
}

func (s *Service) handleAzureStorageSetPrefixFilter(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		Prefix string `json:"prefix"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAzureWorkspace(ctx, "open an Azure workspace before setting a blob prefix filter", func(session *models.SessionSnapshot) error {
		session.AzureBlobPrefixFilter = request.Prefix
		session.SelectedAzureBlobName = ""
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAzureWorkspace(ctx, snapshot, session, notifier, "info", fmt.Sprintf("Updated Azure blob prefix filter to %q.", request.Prefix))
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
	return s.finishAzureWorkspace(ctx, snapshot, session, notifier, "success", fmt.Sprintf("Created blob container %s in %s.", containerName, accountName))
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
	workspace, notifyErr := s.finishAzureWorkspace(
		ctx,
		snapshot,
		session,
		notifier,
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
	return s.finishAzureWorkspace(ctx, snapshot, session, notifier, "success", fmt.Sprintf("Deleted blob %s from %s/%s.", blobName, accountName, containerName))
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