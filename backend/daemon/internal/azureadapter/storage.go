// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package azureadapter

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"strings"
	"time"

	"github.com/Azure/azure-sdk-for-go/sdk/storage/azblob"
	"github.com/Azure/azure-sdk-for-go/sdk/storage/azblob/blob"
	"github.com/Azure/azure-sdk-for-go/sdk/storage/azblob/blockblob"
	"github.com/Azure/azure-sdk-for-go/sdk/storage/azblob/sas"
	"github.com/dustin/go-humanize"

	"cloudsprocket/backend/daemon/internal/models"
)

const (
	flociDevAccountName = "devstoreaccount1"
	flociDevAccountKey  = "Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMh0=="
)

func (i *Inventory) ListStorageAccounts(
	ctx context.Context,
	profile models.ProfileSummary,
) ([]models.AzureStorageAccount, error) {
	if isLocalFlociProfile(profile) {
		return i.listLocalStorageAccounts(ctx)
	}
	args := []string{
		"storage", "account", "list",
		"--subscription", profile.ProfileID,
		"--output", "json",
		"--only-show-errors",
	}
	payload, err := i.run(ctx, args...)
	if err != nil {
		return nil, err
	}
	var decoded []struct {
		Name     string `json:"name"`
		Kind     string `json:"kind"`
		Location string `json:"location"`
		PrimaryEndpoints struct {
			Blob string `json:"blob"`
		} `json:"primaryEndpoints"`
	}
	if err := json.Unmarshal(payload, &decoded); err != nil {
		return nil, fmt.Errorf("decode azure storage accounts: %w", err)
	}
	accounts := make([]models.AzureStorageAccount, 0, len(decoded))
	for _, item := range decoded {
		accounts = append(accounts, models.AzureStorageAccount{
			Name:         item.Name,
			Kind:         item.Kind,
			Location:     item.Location,
			BlobEndpoint: item.PrimaryEndpoints.Blob,
		})
	}
	sort.Slice(accounts, func(left int, right int) bool {
		return strings.ToLower(accounts[left].Name) < strings.ToLower(accounts[right].Name)
	})
	return accounts, nil
}

func (i *Inventory) ListBlobContainers(
	ctx context.Context,
	profile models.ProfileSummary,
	accountName string,
) ([]models.AzureBlobContainer, error) {
	accountName = strings.TrimSpace(accountName)
	if accountName == "" {
		return nil, fmt.Errorf("storage account name is required")
	}
	client, err := i.blobServiceClient(ctx, profile, accountName)
	if err != nil {
		return nil, err
	}
	pager := client.NewListContainersPager(nil)
	containers := make([]models.AzureBlobContainer, 0)
	for pager.More() {
		page, err := pager.NextPage(ctx)
		if err != nil {
			return nil, fmt.Errorf("list blob containers: %w", err)
		}
		for _, item := range page.ContainerItems {
			if item == nil {
				continue
			}
			entry := models.AzureBlobContainer{Name: derefString(item.Name)}
			if item.Properties != nil && item.Properties.LastModified != nil {
				entry.LastModified = item.Properties.LastModified.UTC().Format(time.RFC3339)
			}
			containers = append(containers, entry)
		}
	}
	sort.Slice(containers, func(left int, right int) bool {
		return strings.ToLower(containers[left].Name) < strings.ToLower(containers[right].Name)
	})
	return containers, nil
}

func (i *Inventory) ListBlobs(
	ctx context.Context,
	profile models.ProfileSummary,
	accountName string,
	containerName string,
	prefix string,
) ([]models.AzureBlob, error) {
	accountName = strings.TrimSpace(accountName)
	containerName = strings.TrimSpace(containerName)
	if accountName == "" || containerName == "" {
		return nil, fmt.Errorf("storage account and container names are required")
	}
	client, err := i.blobServiceClient(ctx, profile, accountName)
	if err != nil {
		return nil, err
	}
	containerClient := client.ServiceClient().NewContainerClient(containerName)
	pager := containerClient.NewListBlobsFlatPager(&azblob.ListBlobsFlatOptions{
		Prefix: optionalString(prefix),
	})
	blobs := make([]models.AzureBlob, 0)
	for pagesRead := 0; pager.More() && pagesRead < 5; pagesRead++ {
		page, err := pager.NextPage(ctx)
		if err != nil {
			return nil, fmt.Errorf("list blobs: %w", err)
		}
		for _, item := range page.Segment.BlobItems {
			if item == nil {
				continue
			}
			entry := models.AzureBlob{Name: derefString(item.Name)}
			if item.Properties != nil {
				if item.Properties.ContentLength != nil {
					entry.Size = humanize.Bytes(uint64(*item.Properties.ContentLength))
				}
				if item.Properties.LastModified != nil {
					entry.ModifiedAt = item.Properties.LastModified.UTC().Format(time.RFC3339)
				}
				entry.ContentType = derefString(item.Properties.ContentType)
			}
			blobs = append(blobs, entry)
		}
	}
	sort.Slice(blobs, func(left int, right int) bool {
		return strings.ToLower(blobs[left].Name) < strings.ToLower(blobs[right].Name)
	})
	return blobs, nil
}

func (i *Inventory) CreateBlobContainer(
	ctx context.Context,
	profile models.ProfileSummary,
	accountName string,
	containerName string,
) error {
	accountName = strings.TrimSpace(accountName)
	containerName = strings.TrimSpace(containerName)
	if accountName == "" || containerName == "" {
		return fmt.Errorf("storage account and container names are required")
	}
	client, err := i.blobServiceClient(ctx, profile, accountName)
	if err != nil {
		return err
	}
	_, err = client.CreateContainer(ctx, containerName, nil)
	if err != nil {
		return fmt.Errorf("create blob container: %w", err)
	}
	return nil
}

func (i *Inventory) UploadBlob(
	ctx context.Context,
	profile models.ProfileSummary,
	accountName string,
	containerName string,
	blobName string,
	sourcePath string,
) (models.AzureBlobUploadResult, error) {
	accountName = strings.TrimSpace(accountName)
	containerName = strings.TrimSpace(containerName)
	blobName = strings.TrimSpace(blobName)
	sourcePath = strings.TrimSpace(sourcePath)
	if accountName == "" || containerName == "" || blobName == "" || sourcePath == "" {
		return models.AzureBlobUploadResult{}, fmt.Errorf("account, container, blob name, and source path are required")
	}
	client, err := i.blobServiceClient(ctx, profile, accountName)
	if err != nil {
		return models.AzureBlobUploadResult{}, err
	}
	file, err := os.Open(sourcePath)
	if err != nil {
		return models.AzureBlobUploadResult{}, fmt.Errorf("open source file: %w", err)
	}
	defer file.Close()
	blobClient := client.ServiceClient().NewContainerClient(containerName).NewBlockBlobClient(blobName)
	_, err = blobClient.UploadFile(ctx, file, nil)
	if err != nil {
		return models.AzureBlobUploadResult{}, fmt.Errorf("upload blob: %w", err)
	}
	blobURL := client.URL() + "/" + containerName + "/" + blobName
	return models.AzureBlobUploadResult{
		AccountName:   accountName,
		ContainerName: containerName,
		BlobName:      blobName,
		BlobURL:       blobURL,
	}, nil
}

func (i *Inventory) CopyBlob(
	ctx context.Context,
	profile models.ProfileSummary,
	accountName string,
	containerName string,
	sourceBlobName string,
	destinationBlobName string,
) (models.AzureBlobCopyResult, error) {
	accountName = strings.TrimSpace(accountName)
	containerName = strings.TrimSpace(containerName)
	sourceBlobName = strings.TrimSpace(sourceBlobName)
	destinationBlobName = strings.TrimSpace(destinationBlobName)
	if accountName == "" || containerName == "" || sourceBlobName == "" || destinationBlobName == "" {
		return models.AzureBlobCopyResult{}, fmt.Errorf("account, container, source blob, and destination blob are required")
	}
	client, err := i.blobServiceClient(ctx, profile, accountName)
	if err != nil {
		return models.AzureBlobCopyResult{}, err
	}
	containerClient := client.ServiceClient().NewContainerClient(containerName)
	sourceClient := containerClient.NewBlobClient(sourceBlobName)
	sourceURL, err := sourceClient.GetSASURL(
		sas.BlobPermissions{Read: true},
		time.Now().UTC().Add(15*time.Minute),
		nil,
	)
	if err != nil {
		return models.AzureBlobCopyResult{}, fmt.Errorf("authorise source blob for copy: %w", err)
	}
	destinationClient := containerClient.NewBlockBlobClient(destinationBlobName)
	copyResponse, err := destinationClient.StartCopyFromURL(ctx, sourceURL, nil)
	if err != nil {
		return models.AzureBlobCopyResult{}, fmt.Errorf("copy blob: %w", err)
	}
	if err := waitForBlobCopyCompletion(ctx, destinationClient, copyResponse.CopyStatus); err != nil {
		return models.AzureBlobCopyResult{}, err
	}
	blobURL := client.URL() + "/" + containerName + "/" + destinationBlobName
	return models.AzureBlobCopyResult{
		AccountName:         accountName,
		ContainerName:       containerName,
		SourceBlobName:      sourceBlobName,
		DestinationBlobName: destinationBlobName,
		BlobURL:             blobURL,
	}, nil
}

func (i *Inventory) CreateFolderPrefix(
	ctx context.Context,
	profile models.ProfileSummary,
	accountName string,
	containerName string,
	folderPrefix string,
) (models.AzureBlobCreateFolderPrefixResult, error) {
	accountName = strings.TrimSpace(accountName)
	containerName = strings.TrimSpace(containerName)
	folderPrefix = strings.TrimSpace(folderPrefix)
	if accountName == "" || containerName == "" || folderPrefix == "" {
		return models.AzureBlobCreateFolderPrefixResult{}, fmt.Errorf("account, container, and folder prefix are required")
	}
	if !strings.HasSuffix(folderPrefix, "/") {
		folderPrefix += "/"
	}
	client, err := i.blobServiceClient(ctx, profile, accountName)
	if err != nil {
		return models.AzureBlobCreateFolderPrefixResult{}, err
	}
	blobClient := client.ServiceClient().NewContainerClient(containerName).NewBlockBlobClient(folderPrefix)
	_, err = blobClient.UploadBuffer(ctx, []byte{}, nil)
	if err != nil {
		return models.AzureBlobCreateFolderPrefixResult{}, fmt.Errorf("create folder prefix: %w", err)
	}
	return models.AzureBlobCreateFolderPrefixResult{
		AccountName:   accountName,
		ContainerName: containerName,
		FolderPrefix:  folderPrefix,
	}, nil
}

func (i *Inventory) DeleteBlob(
	ctx context.Context,
	profile models.ProfileSummary,
	accountName string,
	containerName string,
	blobName string,
) error {
	accountName = strings.TrimSpace(accountName)
	containerName = strings.TrimSpace(containerName)
	blobName = strings.TrimSpace(blobName)
	if accountName == "" || containerName == "" || blobName == "" {
		return fmt.Errorf("account, container, and blob name are required")
	}
	client, err := i.blobServiceClient(ctx, profile, accountName)
	if err != nil {
		return err
	}
	blobClient := client.ServiceClient().NewContainerClient(containerName).NewBlobClient(blobName)
	_, err = blobClient.Delete(ctx, nil)
	if err != nil {
		return fmt.Errorf("delete blob: %w", err)
	}
	return nil
}

func (i *Inventory) blobServiceClient(
	ctx context.Context,
	profile models.ProfileSummary,
	accountName string,
) (*azblob.Client, error) {
	accountKey, err := i.storageAccountKey(ctx, profile, accountName)
	if err != nil {
		return nil, err
	}
	if isLocalFlociProfile(profile) {
		endpoint := i.flociEndpoint() + "/" + accountName
		credential, err := azblob.NewSharedKeyCredential(accountName, accountKey)
		if err != nil {
			return nil, fmt.Errorf("floci-az storage credential: %w", err)
		}
		return azblob.NewClientWithSharedKeyCredential(endpoint, credential, nil)
	}
	endpoint := fmt.Sprintf("https://%s.blob.core.windows.net", accountName)
	credential, err := azblob.NewSharedKeyCredential(accountName, accountKey)
	if err != nil {
		return nil, fmt.Errorf("azure storage credential: %w", err)
	}
	return azblob.NewClientWithSharedKeyCredential(endpoint, credential, nil)
}

func waitForBlobCopyCompletion(
	ctx context.Context,
	destinationClient *blockblob.Client,
	initialStatus *blob.CopyStatusType,
) error {
	status := blob.CopyStatusTypePending
	if initialStatus != nil {
		status = *initialStatus
	}
	if status == blob.CopyStatusTypeSuccess {
		return nil
	}
	deadline := time.Now().Add(2 * time.Minute)
	for status == blob.CopyStatusTypePending {
		if time.Now().After(deadline) {
			return fmt.Errorf("blob copy timed out")
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(500 * time.Millisecond):
		}
		properties, err := destinationClient.GetProperties(ctx, nil)
		if err != nil {
			return fmt.Errorf("copy status: %w", err)
		}
		if properties.CopyStatus == nil {
			return fmt.Errorf("copy status missing from blob properties")
		}
		status = *properties.CopyStatus
	}
	switch status {
	case blob.CopyStatusTypeSuccess:
		return nil
	case blob.CopyStatusTypeFailed, blob.CopyStatusTypeAborted:
		return fmt.Errorf("blob copy %s", status)
	default:
		return fmt.Errorf("blob copy ended in unexpected state: %s", status)
	}
}

func optionalString(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}