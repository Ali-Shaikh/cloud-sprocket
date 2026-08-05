// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package azure

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"cloudsprocket/backend/daemon/internal/app/sessionport"
	"cloudsprocket/backend/daemon/internal/models"
)

func storageWriteOpts() sessionport.SnapshotOptions {
	return sessionport.SnapshotOptions{AzureScope: "storage"}
}

// HandleStorageCreateAccount implements azure.storage.createAccount.
func (s *Service) HandleStorageCreateAccount(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	if s == nil || s.storage == nil {
		return nil, errors.New("azure write service is not available")
	}
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
	_, profile, err := s.AuthorizeWrite(
		ctx, snapshot,
		"open a locked Azure workspace before creating a storage account",
		"storage account create requires write mode to be enabled for this Azure workspace",
	)
	if err != nil {
		return nil, err
	}

	actionCtx, cancel := s.WithActionTimeout(ctx)
	created, err := s.storage.CreateStorageAccount(actionCtx, profile, resourceGroup, accountName, request.Location)
	cancel()
	if err != nil {
		return nil, err
	}
	if s.invalidator != nil {
		s.invalidator.InvalidateResourceCache(ctx, "azure.storage.accounts", profile.ProfileID)
	}

	return s.FinishWriteAction(
		ctx, snapshot, notifier, storageWriteOpts(),
		fmt.Sprintf("Created storage account %s.", created.Name),
		func(session *models.SessionSnapshot) {
			session.SelectedAzureStorageAccount = created.Name
			session.SelectedAzureBlobContainer = ""
			session.SelectedAzureBlobName = ""
		},
	)
}

// HandleStorageCreateContainer implements azure.storage.createContainer.
func (s *Service) HandleStorageCreateContainer(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	if s == nil || s.storage == nil {
		return nil, errors.New("azure write service is not available")
	}
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
	session, profile, err := s.AuthorizeWrite(
		ctx, snapshot,
		"open an Azure workspace before using storage actions",
		"blob container create requires write mode to be enabled for this Azure workspace",
	)
	if err != nil {
		return nil, err
	}
	_, accountName, _, err := ActiveStorageSelection(ctx, s.storage, snapshot, session, false)
	if err != nil {
		return nil, err
	}

	actionCtx, cancel := s.WithActionTimeout(ctx)
	err = s.storage.CreateBlobContainer(actionCtx, profile, accountName, containerName)
	cancel()
	if err != nil {
		return nil, err
	}
	if s.invalidator != nil {
		s.invalidator.InvalidateResourceCache(ctx, "azure.storage.containers", profile.ProfileID+"|"+accountName)
	}

	return s.FinishWriteAction(
		ctx, snapshot, notifier, storageWriteOpts(),
		fmt.Sprintf("Created blob container %s in %s.", containerName, accountName),
		func(session *models.SessionSnapshot) {
			session.SelectedAzureStorageAccount = accountName
			session.SelectedAzureBlobContainer = containerName
			session.SelectedAzureBlobName = ""
		},
	)
}

// HandleStorageUploadBlob implements azure.storage.uploadBlob.
func (s *Service) HandleStorageUploadBlob(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	if s == nil || s.storage == nil {
		return nil, errors.New("azure write service is not available")
	}
	var request struct {
		SourcePath string `json:"sourcePath"`
		BlobName   string `json:"blobName"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	if err := ValidateBlobUploadRequest(request.SourcePath, request.BlobName); err != nil {
		return nil, err
	}
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	session, profile, err := s.AuthorizeWrite(
		ctx, snapshot,
		"open an Azure workspace before using storage actions",
		"blob upload requires write mode to be enabled for this Azure workspace",
	)
	if err != nil {
		return nil, err
	}
	_, accountName, containerName, err := ActiveStorageSelection(ctx, s.storage, snapshot, session, true)
	if err != nil {
		return nil, err
	}
	prefix := session.AzureBlobPrefixFilter

	actionCtx, cancel := s.WithActionTimeout(ctx)
	result, err := s.storage.UploadBlob(actionCtx, profile, accountName, containerName, request.BlobName, request.SourcePath)
	cancel()
	if err != nil {
		return nil, err
	}
	if s.invalidator != nil {
		s.invalidator.InvalidateResourceCache(ctx, "azure.storage.blobs", profile.ProfileID+"|"+accountName+"|"+containerName+"|"+prefix)
	}

	workspace, notifyErr := s.FinishWriteAction(
		ctx, snapshot, notifier, storageWriteOpts(),
		fmt.Sprintf("Uploaded blob %s to %s/%s.", request.BlobName, accountName, containerName),
		func(session *models.SessionSnapshot) {
			session.SelectedAzureStorageAccount = accountName
			session.SelectedAzureBlobContainer = containerName
			session.SelectedAzureBlobName = request.BlobName
			session.AzureBlobPrefixFilter = prefix
		},
	)
	if notifyErr != nil {
		return nil, notifyErr
	}
	return map[string]any{
		"workspace": workspace,
		"result":    result,
	}, nil
}

// HandleStorageDeleteBlob implements azure.storage.deleteBlob.
func (s *Service) HandleStorageDeleteBlob(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	if s == nil || s.storage == nil {
		return nil, errors.New("azure write service is not available")
	}
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
	session, profile, err := s.AuthorizeWrite(
		ctx, snapshot,
		"open an Azure workspace before using storage actions",
		"blob delete requires write mode to be enabled for this Azure workspace",
	)
	if err != nil {
		return nil, err
	}
	_, accountName, containerName, err := ActiveStorageSelection(ctx, s.storage, snapshot, session, true)
	if err != nil {
		return nil, err
	}

	actionCtx, cancel := s.WithActionTimeout(ctx)
	err = s.storage.DeleteBlob(actionCtx, profile, accountName, containerName, blobName)
	cancel()
	if err != nil {
		return nil, err
	}
	if s.invalidator != nil {
		s.invalidator.InvalidateResourceCacheScope(ctx, "azure.storage.blobs")
	}

	return s.FinishWriteAction(
		ctx, snapshot, notifier, storageWriteOpts(),
		fmt.Sprintf("Deleted blob %s from %s/%s.", blobName, accountName, containerName),
		func(session *models.SessionSnapshot) {
			if session.SelectedAzureBlobName == blobName {
				session.SelectedAzureBlobName = ""
			}
		},
	)
}

// HandleStorageCopyBlob implements azure.storage.copyBlob.
func (s *Service) HandleStorageCopyBlob(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	if s == nil || s.storage == nil {
		return nil, errors.New("azure write service is not available")
	}
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
	session, profile, err := s.AuthorizeWrite(
		ctx, snapshot,
		"open an Azure workspace before using storage actions",
		"blob copy requires write mode to be enabled for this Azure workspace",
	)
	if err != nil {
		return nil, err
	}
	_, accountName, containerName, err := ActiveStorageSelection(ctx, s.storage, snapshot, session, true)
	if err != nil {
		return nil, err
	}
	sourceBlobName := strings.TrimSpace(request.SourceBlobName)
	if sourceBlobName == "" {
		sourceBlobName = session.SelectedAzureBlobName
	}
	if sourceBlobName == "" {
		return nil, errors.New("select a source blob before copying")
	}
	prefix := session.AzureBlobPrefixFilter

	actionCtx, cancel := s.WithActionTimeout(ctx)
	result, err := s.storage.CopyBlob(actionCtx, profile, accountName, containerName, sourceBlobName, destinationBlobName)
	cancel()
	if err != nil {
		return nil, err
	}
	if s.invalidator != nil {
		s.invalidator.InvalidateResourceCache(ctx, "azure.storage.blobs", profile.ProfileID+"|"+accountName+"|"+containerName+"|"+prefix)
	}

	workspace, notifyErr := s.FinishWriteAction(
		ctx, snapshot, notifier, storageWriteOpts(),
		fmt.Sprintf("Copied blob %s to %s in %s/%s.", sourceBlobName, destinationBlobName, accountName, containerName),
		func(session *models.SessionSnapshot) {
			session.SelectedAzureStorageAccount = accountName
			session.SelectedAzureBlobContainer = containerName
			session.SelectedAzureBlobName = destinationBlobName
			session.AzureBlobPrefixFilter = prefix
		},
	)
	if notifyErr != nil {
		return nil, notifyErr
	}
	return map[string]any{
		"workspace": workspace,
		"result":    result,
	}, nil
}

// HandleStorageCreateFolderPrefix implements azure.storage.createFolderPrefix.
func (s *Service) HandleStorageCreateFolderPrefix(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	if s == nil || s.storage == nil {
		return nil, errors.New("azure write service is not available")
	}
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
	session, profile, err := s.AuthorizeWrite(
		ctx, snapshot,
		"open an Azure workspace before using storage actions",
		"folder create requires write mode to be enabled for this Azure workspace",
	)
	if err != nil {
		return nil, err
	}
	_, accountName, containerName, err := ActiveStorageSelection(ctx, s.storage, snapshot, session, true)
	if err != nil {
		return nil, err
	}

	actionCtx, cancel := s.WithActionTimeout(ctx)
	result, err := s.storage.CreateFolderPrefix(actionCtx, profile, accountName, containerName, folderPrefix)
	cancel()
	if err != nil {
		return nil, err
	}
	if s.invalidator != nil {
		s.invalidator.InvalidateResourceCacheScope(ctx, "azure.storage.blobs")
	}

	return s.FinishWriteAction(
		ctx, snapshot, notifier, storageWriteOpts(),
		fmt.Sprintf("Created folder prefix %s in %s/%s.", result.FolderPrefix, accountName, containerName),
		func(session *models.SessionSnapshot) {
			session.SelectedAzureStorageAccount = accountName
			session.SelectedAzureBlobContainer = containerName
			session.AzureBlobPrefixFilter = result.FolderPrefix
			session.SelectedAzureBlobName = ""
		},
	)
}

// HandleStoragePresignBlob implements azure.storage.presignBlob (read-only SAS; no write gate).
func (s *Service) HandleStoragePresignBlob(ctx context.Context, params json.RawMessage, _ sessionport.Notifier) (any, error) {
	if s == nil || s.storage == nil || s.session == nil || s.discovery == nil {
		return nil, errors.New("azure write service is not available")
	}
	var request struct {
		BlobName        string `json:"blobName"`
		DurationSeconds int    `json:"durationSeconds"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	session, err := s.session.Load(ctx, snapshot)
	if err != nil {
		return nil, err
	}
	profile, accountName, containerName, err := ActiveStorageSelection(ctx, s.storage, snapshot, session, true)
	if err != nil {
		return nil, err
	}
	blobName := strings.TrimSpace(request.BlobName)
	if blobName == "" {
		blobName = session.SelectedAzureBlobName
	}
	if blobName == "" {
		return nil, errors.New("select a blob before generating a signed URL")
	}

	actionCtx, cancel := s.WithActionTimeout(ctx)
	result, err := s.storage.PresignBlob(actionCtx, profile, accountName, containerName, blobName, request.DurationSeconds)
	cancel()
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"result": result,
	}, nil
}
