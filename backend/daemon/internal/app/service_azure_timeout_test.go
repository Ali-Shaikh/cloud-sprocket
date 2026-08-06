// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"cloudsprocket/backend/daemon/internal/models"
	"cloudsprocket/backend/daemon/internal/store"
)

// blockingAzure blocks until the call's context is cancelled, simulating a
// stalled floci-az ARM pager or `az` CLI invocation.
type blockingAzure struct{}

func (blockingAzure) ListResourceGroups(ctx context.Context, _ models.ProfileSummary) ([]models.AzureResourceGroup, error) {
	<-ctx.Done()
	return nil, ctx.Err()
}

func (blockingAzure) ListVirtualMachines(ctx context.Context, _ models.ProfileSummary, _ string) ([]models.AzureVirtualMachine, error) {
	<-ctx.Done()
	return nil, ctx.Err()
}

func (blockingAzure) CreateResourceGroup(ctx context.Context, _ models.ProfileSummary, _ string, _ string) (models.AzureResourceGroup, error) {
	<-ctx.Done()
	return models.AzureResourceGroup{}, ctx.Err()
}

func (blockingAzure) DeleteResourceGroup(ctx context.Context, _ models.ProfileSummary, _ string) error {
	<-ctx.Done()
	return ctx.Err()
}

func (blockingAzure) ListStorageAccounts(ctx context.Context, _ models.ProfileSummary) ([]models.AzureStorageAccount, error) {
	<-ctx.Done()
	return nil, ctx.Err()
}

func (blockingAzure) ListBlobContainers(ctx context.Context, _ models.ProfileSummary, _ string) ([]models.AzureBlobContainer, error) {
	<-ctx.Done()
	return nil, ctx.Err()
}

func (blockingAzure) ListBlobs(ctx context.Context, _ models.ProfileSummary, _ string, _ string, _ string) ([]models.AzureBlob, error) {
	<-ctx.Done()
	return nil, ctx.Err()
}

func (blockingAzure) CreateStorageAccount(ctx context.Context, _ models.ProfileSummary, _ string, _ string, _ string) (models.AzureStorageAccount, error) {
	<-ctx.Done()
	return models.AzureStorageAccount{}, ctx.Err()
}

func (blockingAzure) CreateBlobContainer(ctx context.Context, _ models.ProfileSummary, _ string, _ string) error {
	<-ctx.Done()
	return ctx.Err()
}

func (blockingAzure) UploadBlob(ctx context.Context, _ models.ProfileSummary, _ string, _ string, _ string, _ string) (models.AzureBlobUploadResult, error) {
	<-ctx.Done()
	return models.AzureBlobUploadResult{}, ctx.Err()
}

func (blockingAzure) DeleteBlob(ctx context.Context, _ models.ProfileSummary, _ string, _ string, _ string) error {
	<-ctx.Done()
	return ctx.Err()
}

func (blockingAzure) CopyBlob(ctx context.Context, _ models.ProfileSummary, accountName string, containerName string, sourceBlobName string, destinationBlobName string) (models.AzureBlobCopyResult, error) {
	<-ctx.Done()
	return models.AzureBlobCopyResult{}, ctx.Err()
}

func (blockingAzure) CreateFolderPrefix(ctx context.Context, _ models.ProfileSummary, accountName string, containerName string, folderPrefix string) (models.AzureBlobCreateFolderPrefixResult, error) {
	<-ctx.Done()
	return models.AzureBlobCreateFolderPrefixResult{}, ctx.Err()
}

func (blockingAzure) PresignBlob(ctx context.Context, _ models.ProfileSummary, _ string, _ string, _ string, _ int) (models.AzureBlobPresignResult, error) {
	<-ctx.Done()
	return models.AzureBlobPresignResult{}, ctx.Err()
}

func (blockingAzure) InvokeVirtualMachineAction(ctx context.Context, _ models.ProfileSummary, _ string, _ string, _ string) error {
	<-ctx.Done()
	return ctx.Err()
}

func (blockingAzure) GetVirtualMachine(ctx context.Context, _ models.ProfileSummary, _ string, _ string) (models.AzureVirtualMachine, error) {
	<-ctx.Done()
	return models.AzureVirtualMachine{}, ctx.Err()
}

func (blockingAzure) ListWebApps(ctx context.Context, _ models.ProfileSummary, _ string) ([]models.AzureWebApp, error) {
	<-ctx.Done()
	return nil, ctx.Err()
}

func (blockingAzure) CreateWebApp(ctx context.Context, _ models.ProfileSummary, _ string, _ string, _ string, _ string, _ string, _ string, _ string) (models.AzureWebApp, error) {
	<-ctx.Done()
	return models.AzureWebApp{}, ctx.Err()
}

func (blockingAzure) GetWebApp(ctx context.Context, _ models.ProfileSummary, _ string, _ string, _ string) (models.AzureWebApp, error) {
	<-ctx.Done()
	return models.AzureWebApp{}, ctx.Err()
}

func (blockingAzure) CreateWebAppDeploymentSlot(ctx context.Context, _ models.ProfileSummary, _ string, _ string, _ string) error {
	<-ctx.Done()
	return ctx.Err()
}

func (blockingAzure) SwapWebAppDeploymentSlots(ctx context.Context, _ models.ProfileSummary, _ string, _ string, _ string) error {
	<-ctx.Done()
	return ctx.Err()
}

func (blockingAzure) ListAppServicePlans(ctx context.Context, _ models.ProfileSummary, _ string) ([]models.AzureAppServicePlan, error) {
	<-ctx.Done()
	return nil, ctx.Err()
}

func (blockingAzure) GetAppServicePlan(ctx context.Context, _ models.ProfileSummary, _ string, _ string) (models.AzureAppServicePlan, error) {
	<-ctx.Done()
	return models.AzureAppServicePlan{}, ctx.Err()
}

func (blockingAzure) ListWebAppDeploymentSlots(ctx context.Context, _ models.ProfileSummary, _ string, _ string) ([]models.AzureWebAppDeploymentSlot, error) {
	<-ctx.Done()
	return nil, ctx.Err()
}

func (blockingAzure) ListWebAppSettings(ctx context.Context, _ models.ProfileSummary, _ string, _ string, _ string) ([]models.AzureWebAppSetting, error) {
	<-ctx.Done()
	return nil, ctx.Err()
}

func (blockingAzure) SetWebAppSetting(ctx context.Context, _ models.ProfileSummary, _ string, _ string, _ string, _ string, _ bool, _ string) error {
	<-ctx.Done()
	return ctx.Err()
}

func (blockingAzure) DeleteWebAppSetting(ctx context.Context, _ models.ProfileSummary, _ string, _ string, _ string, _ string) error {
	<-ctx.Done()
	return ctx.Err()
}

func (blockingAzure) InvokeWebAppAction(ctx context.Context, _ models.ProfileSummary, _ string, _ string, _ string, _ string) error {
	<-ctx.Done()
	return ctx.Err()
}

func (blockingAzure) ListLogAnalyticsWorkspaces(ctx context.Context, _ models.ProfileSummary) ([]models.AzureLogAnalyticsWorkspace, error) {
	<-ctx.Done()
	return nil, ctx.Err()
}

func (blockingAzure) RunLogAnalyticsQuery(ctx context.Context, _ models.ProfileSummary, _ string, _ string, _ string, _ int) (models.AzureLogQueryResult, error) {
	<-ctx.Done()
	return models.AzureLogQueryResult{}, ctx.Err()
}

func (blockingAzure) ListFunctionApps(ctx context.Context, _ models.ProfileSummary) ([]models.AzureFunctionApp, error) {
	<-ctx.Done()
	return nil, ctx.Err()
}

func (blockingAzure) ListFunctions(ctx context.Context, _ models.ProfileSummary, _ string, _ string) ([]models.AzureFunction, error) {
	<-ctx.Done()
	return nil, ctx.Err()
}

func (blockingAzure) InvokeFunction(ctx context.Context, _ models.ProfileSummary, _ string, _ string, _ string, _ string) (models.AzureFunctionInvokeResult, error) {
	<-ctx.Done()
	return models.AzureFunctionInvokeResult{}, ctx.Err()
}

func (blockingAzure) ListKeyVaults(ctx context.Context, _ models.ProfileSummary) ([]models.AzureKeyVault, error) {
	<-ctx.Done()
	return nil, ctx.Err()
}

func (blockingAzure) ListKeyVaultSecrets(ctx context.Context, _ models.ProfileSummary, _ string) ([]models.AzureKeyVaultSecret, error) {
	<-ctx.Done()
	return nil, ctx.Err()
}

func (blockingAzure) GetKeyVaultSecret(ctx context.Context, _ models.ProfileSummary, _ string, _ string) (string, error) {
	<-ctx.Done()
	return "", ctx.Err()
}

func (blockingAzure) SetKeyVaultSecret(ctx context.Context, _ models.ProfileSummary, _ string, _ string, _ string) (models.AzureKeyVaultSecret, error) {
	<-ctx.Done()
	return models.AzureKeyVaultSecret{}, ctx.Err()
}

func (blockingAzure) ListCosmosAccounts(ctx context.Context, _ models.ProfileSummary) ([]models.AzureCosmosAccount, error) {
	<-ctx.Done()
	return nil, ctx.Err()
}

func (blockingAzure) ListCosmosDatabases(ctx context.Context, _ models.ProfileSummary, _ string, _ string) ([]models.AzureCosmosDatabase, error) {
	<-ctx.Done()
	return nil, ctx.Err()
}

func (blockingAzure) ListCosmosContainers(ctx context.Context, _ models.ProfileSummary, _ string, _ string, _ string) ([]models.AzureCosmosContainer, error) {
	<-ctx.Done()
	return nil, ctx.Err()
}

func (blockingAzure) DeleteCosmosItem(ctx context.Context, _ models.ProfileSummary, _ string, _ string, _ string, _ string, _ string, _ string) (models.AzureCosmosDeleteItemResult, error) {
	<-ctx.Done()
	return models.AzureCosmosDeleteItemResult{}, ctx.Err()
}

func (blockingAzure) ListCosmosItems(ctx context.Context, _ models.ProfileSummary, _ string, _ string, _ string, _ string) ([]models.AzureCosmosItem, error) {
	<-ctx.Done()
	return nil, ctx.Err()
}

func (blockingAzure) ListPostgresServers(ctx context.Context, _ models.ProfileSummary) ([]models.AzurePostgresServer, error) {
	<-ctx.Done()
	return nil, ctx.Err()
}

func (blockingAzure) GetPostgresConnection(ctx context.Context, _ models.ProfileSummary, _ string, _ string) (models.AzurePostgresConnection, error) {
	<-ctx.Done()
	return models.AzurePostgresConnection{}, ctx.Err()
}

func (blockingAzure) StartPostgresServer(ctx context.Context, _ models.ProfileSummary, _ string, _ string) (models.AzurePostgresLifecycleResult, error) {
	<-ctx.Done()
	return models.AzurePostgresLifecycleResult{}, ctx.Err()
}

func (blockingAzure) StopPostgresServer(ctx context.Context, _ models.ProfileSummary, _ string, _ string) (models.AzurePostgresLifecycleResult, error) {
	<-ctx.Done()
	return models.AzurePostgresLifecycleResult{}, ctx.Err()
}

func (blockingAzure) ListStorageQueues(ctx context.Context, _ models.ProfileSummary, _ string) ([]models.AzureStorageQueue, error) {
	<-ctx.Done()
	return nil, ctx.Err()
}

func (blockingAzure) PeekQueueMessages(ctx context.Context, _ models.ProfileSummary, _ string, _ string) ([]models.AzureQueueMessage, error) {
	<-ctx.Done()
	return nil, ctx.Err()
}

func (blockingAzure) PurgeQueueMessages(ctx context.Context, _ models.ProfileSummary, _ string, _ string) (models.AzureQueuePurgeResult, error) {
	<-ctx.Done()
	return models.AzureQueuePurgeResult{}, ctx.Err()
}

func (blockingAzure) GetQueueApproximateMessageCount(ctx context.Context, _ models.ProfileSummary, _ string, _ string) (int64, error) {
	<-ctx.Done()
	return 0, ctx.Err()
}

func (blockingAzure) ListEntraUsers(ctx context.Context, _ models.ProfileSummary) ([]models.AzureEntraUser, error) {
	<-ctx.Done()
	return nil, ctx.Err()
}

func (blockingAzure) ListEntraGroups(ctx context.Context, _ models.ProfileSummary) ([]models.AzureEntraGroup, error) {
	<-ctx.Done()
	return nil, ctx.Err()
}

func (blockingAzure) ListEntraAppRegistrations(ctx context.Context, _ models.ProfileSummary) ([]models.AzureEntraApp, error) {
	<-ctx.Done()
	return nil, ctx.Err()
}

func (blockingAzure) GetLogAnalyticsTableSchema(ctx context.Context, _ models.ProfileSummary, _ string, _ string) ([]string, error) {
	<-ctx.Done()
	return nil, ctx.Err()
}

func (blockingAzure) ListLogAnalyticsTables(ctx context.Context, _ models.ProfileSummary, _ string, _ string, _ string, _ bool) ([]models.AzureLogAnalyticsTableInfo, error) {
	<-ctx.Done()
	return nil, ctx.Err()
}

func (blockingAzure) DetectWafLogSchema(ctx context.Context, _ models.ProfileSummary, _ string, _ string) (models.AzureWafLogSchemaProfile, error) {
	<-ctx.Done()
	return models.AzureWafLogSchemaProfile{}, ctx.Err()
}

func (blockingAzure) ListWafPolicies(ctx context.Context, _ models.ProfileSummary, _ bool) ([]models.AzureWafPolicySummary, error) {
	<-ctx.Done()
	return nil, ctx.Err()
}

func (blockingAzure) GetWafPolicy(ctx context.Context, _ models.ProfileSummary, _ string, _ string) (models.AzureWafPolicyDetail, error) {
	<-ctx.Done()
	return models.AzureWafPolicyDetail{}, ctx.Err()
}

func (blockingAzure) UpdateWafPolicyMode(ctx context.Context, _ models.ProfileSummary, _ string, _ string, _ string) error {
	<-ctx.Done()
	return ctx.Err()
}

func (blockingAzure) SetWafManagedRuleOverride(ctx context.Context, _ models.ProfileSummary, _ string, _ string, _ string, _ string, _ string, _ string, _ bool) error {
	<-ctx.Done()
	return ctx.Err()
}

func (blockingAzure) AddWafExclusion(ctx context.Context, _ models.ProfileSummary, _ string, _ string, _ models.AzureWafExclusion) error {
	<-ctx.Done()
	return ctx.Err()
}

func (blockingAzure) RemoveWafExclusion(ctx context.Context, _ models.ProfileSummary, _ string, _ string, _ models.AzureWafExclusion) error {
	<-ctx.Done()
	return ctx.Err()
}

func (blockingAzure) ListFrontDoorProfiles(ctx context.Context, _ models.ProfileSummary, _ bool) ([]models.AzureFrontDoorProfile, error) {
	<-ctx.Done()
	return nil, ctx.Err()
}

func (blockingAzure) ListFrontDoorEndpoints(ctx context.Context, _ models.ProfileSummary, _ string, _ string) ([]models.AzureFrontDoorEndpoint, error) {
	<-ctx.Done()
	return nil, ctx.Err()
}

func (blockingAzure) ListFrontDoorOriginGroups(ctx context.Context, _ models.ProfileSummary, _ string, _ string) ([]models.AzureFrontDoorOriginGroup, error) {
	<-ctx.Done()
	return nil, ctx.Err()
}

func (blockingAzure) ListFrontDoorOrigins(ctx context.Context, _ models.ProfileSummary, _ string, _ string, _ string) ([]models.AzureFrontDoorOrigin, error) {
	<-ctx.Done()
	return nil, ctx.Err()
}

func (blockingAzure) PurgeFrontDoorEndpointCache(ctx context.Context, _ models.ProfileSummary, _ string, _ string, _ string, _ []string, _ []string) error {
	<-ctx.Done()
	return ctx.Err()
}

func (blockingAzure) ListBastionHosts(ctx context.Context, _ models.ProfileSummary) ([]models.AzureBastionHost, error) {
	<-ctx.Done()
	return nil, ctx.Err()
}

func (blockingAzure) CheckCLIExtensions(context.Context) []models.AzureCLIExtensionStatus {
	return nil
}

// TestAzureInventoryBoundedByTimeout proves a stalled Azure inventory call is
// cut off by the configured timeout (and falls back to empty) instead of
// hanging the workspace snapshot.
func TestAzureInventoryBoundedByTimeout(t *testing.T) {
	dataStore, err := store.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	t.Cleanup(func() { _ = dataStore.Close() })

	s := &Service{
		store:                 dataStore,
		azure:                 blockingAzure{},
		azureInventoryTimeout: 50 * time.Millisecond,
		now:                   func() time.Time { return time.Now().UTC() },
	}

	profile := models.ProfileSummary{ProviderID: "azure", ProfileID: "sub-1"}

	start := time.Now()
	groups, _ := s.azureResourceGroups(context.Background(), profile)
	if elapsed := time.Since(start); elapsed > 2*time.Second {
		t.Fatalf("azureResourceGroups did not honour the timeout, took %v", elapsed)
	}
	if len(groups) != 0 {
		t.Fatalf("expected empty resource groups on timeout, got %d", len(groups))
	}

	start = time.Now()
	vms := s.azureVirtualMachines(context.Background(), profile, "rg-1")
	if elapsed := time.Since(start); elapsed > 2*time.Second {
		t.Fatalf("azureVirtualMachines did not honour the timeout, took %v", elapsed)
	}
	if len(vms) != 0 {
		t.Fatalf("expected empty VMs on timeout, got %d", len(vms))
	}
}
