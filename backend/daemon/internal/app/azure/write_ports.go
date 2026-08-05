// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package azure

import (
	"context"

	"cloudsprocket/backend/daemon/internal/models"
)

// StorageWriter is the Azure Storage mutation and presign surface.
type StorageWriter interface {
	ListStorageAccounts(ctx context.Context, profile models.ProfileSummary) ([]models.AzureStorageAccount, error)
	ListBlobContainers(ctx context.Context, profile models.ProfileSummary, accountName string) ([]models.AzureBlobContainer, error)
	CreateStorageAccount(ctx context.Context, profile models.ProfileSummary, resourceGroup string, accountName string, location string) (models.AzureStorageAccount, error)
	CreateBlobContainer(ctx context.Context, profile models.ProfileSummary, accountName string, containerName string) error
	UploadBlob(ctx context.Context, profile models.ProfileSummary, accountName string, containerName string, blobName string, sourcePath string) (models.AzureBlobUploadResult, error)
	DeleteBlob(ctx context.Context, profile models.ProfileSummary, accountName string, containerName string, blobName string) error
	CopyBlob(ctx context.Context, profile models.ProfileSummary, accountName string, containerName string, sourceBlobName string, destinationBlobName string) (models.AzureBlobCopyResult, error)
	CreateFolderPrefix(ctx context.Context, profile models.ProfileSummary, accountName string, containerName string, folderPrefix string) (models.AzureBlobCreateFolderPrefixResult, error)
	PresignBlob(ctx context.Context, profile models.ProfileSummary, accountName string, containerName string, blobName string, durationSeconds int) (models.AzureBlobPresignResult, error)
}

// KeyVaultWriter is the Key Vault set/reveal surface.
type KeyVaultWriter interface {
	GetKeyVaultSecret(ctx context.Context, profile models.ProfileSummary, vaultName string, secretName string) (string, error)
	SetKeyVaultSecret(ctx context.Context, profile models.ProfileSummary, vaultName string, secretName string, value string) (models.AzureKeyVaultSecret, error)
}

// PostgresWriter is the PostgreSQL Flexible Server lifecycle surface.
type PostgresWriter interface {
	ListPostgresServers(ctx context.Context, profile models.ProfileSummary) ([]models.AzurePostgresServer, error)
	StartPostgresServer(ctx context.Context, profile models.ProfileSummary, resourceGroup string, serverName string) (models.AzurePostgresLifecycleResult, error)
	StopPostgresServer(ctx context.Context, profile models.ProfileSummary, resourceGroup string, serverName string) (models.AzurePostgresLifecycleResult, error)
}

// FunctionsWriter is the Functions invoke surface.
type FunctionsWriter interface {
	ListFunctionApps(ctx context.Context, profile models.ProfileSummary) ([]models.AzureFunctionApp, error)
	InvokeFunction(ctx context.Context, profile models.ProfileSummary, resourceGroup string, appName string, functionName string, payload string) (models.AzureFunctionInvokeResult, error)
}

// WebAppsWriter is the App Service mutation surface.
type WebAppsWriter interface {
	ListWebApps(ctx context.Context, profile models.ProfileSummary, resourceGroup string) ([]models.AzureWebApp, error)
	ListResourceGroups(ctx context.Context, profile models.ProfileSummary) ([]models.AzureResourceGroup, error)
	SetWebAppSetting(ctx context.Context, profile models.ProfileSummary, resourceGroup string, appName string, name string, value string, slotSetting bool, slotName string) error
	DeleteWebAppSetting(ctx context.Context, profile models.ProfileSummary, resourceGroup string, appName string, name string, slotName string) error
	InvokeWebAppAction(ctx context.Context, profile models.ProfileSummary, resourceGroup string, appName string, action string, slotName string) error
	CreateWebAppDeploymentSlot(ctx context.Context, profile models.ProfileSummary, resourceGroup string, appName string, slotName string) error
	SwapWebAppDeploymentSlots(ctx context.Context, profile models.ProfileSummary, resourceGroup string, appName string, slotName string) error
	CreateWebApp(ctx context.Context, profile models.ProfileSummary, resourceGroup string, appName string, location string, runtime string, existingPlanName string, newPlanName string, planSKU string) (models.AzureWebApp, error)
}

// WafWriter is the Front Door WAF policy mutation surface.
type WafWriter interface {
	UpdateWafPolicyMode(ctx context.Context, profile models.ProfileSummary, resourceGroup string, policyName string, mode string) error
	SetWafManagedRuleOverride(ctx context.Context, profile models.ProfileSummary, resourceGroup string, policyName string, ruleSetType string, ruleSetVersion string, ruleGroupName string, ruleID string, enabled bool) error
	AddWafExclusion(ctx context.Context, profile models.ProfileSummary, resourceGroup string, policyName string, exclusion models.AzureWafExclusion) error
	RemoveWafExclusion(ctx context.Context, profile models.ProfileSummary, resourceGroup string, policyName string, exclusion models.AzureWafExclusion) error
}
