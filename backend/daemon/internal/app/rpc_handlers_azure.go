// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"encoding/json"
)

// registerAzureHandlers registers all azure.* JSON-RPC methods.
func (s *Service) registerAzureHandlers(m *handlerRegistry) {
	m.register("azure.inventory.get", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAzureInventoryGet(ctx, params, notifier)
	})
	m.register("azure.selectResourceGroup", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAzureSelectResourceGroup(ctx, params, notifier)
	})
	m.register("azure.selectVirtualMachine", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAzureSelectVirtualMachine(ctx, params, notifier)
	})
	m.register("azure.resourceGroups.create", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAzureResourceGroupsCreate(ctx, params, notifier)
	})
	m.register("azure.resourceGroups.delete", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAzureResourceGroupsDelete(ctx, params, notifier)
	})
	m.register("azure.virtualMachines.invokeAction", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAzureVirtualMachinesInvokeAction(ctx, params, notifier)
	})
	m.register("azure.webApps.select", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAzureSelectWebApp(ctx, params, notifier)
	})
	m.register("azure.webApps.selectSlot", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAzureWebAppsSelectSlot(ctx, params, notifier)
	})
	m.register("azure.webApps.createSlot", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAzureWebAppsCreateSlot(ctx, params, notifier)
	})
	m.register("azure.webApps.swapSlots", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAzureWebAppsSwapSlots(ctx, params, notifier)
	})
	m.register("azure.webApps.create", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAzureWebAppsCreate(ctx, params, notifier)
	})
	m.register("azure.webApps.invokeAction", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAzureWebAppsInvokeAction(ctx, params, notifier)
	})
	m.register("azure.webApps.setSetting", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAzureWebAppsSetSetting(ctx, params, notifier)
	})
	m.register("azure.webApps.deleteSetting", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAzureWebAppsDeleteSetting(ctx, params, notifier)
	})
	m.register("azure.storage.selectAccount", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAzureStorageSelectAccount(ctx, params, notifier)
	})
	m.register("azure.storage.selectContainer", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAzureStorageSelectContainer(ctx, params, notifier)
	})
	m.register("azure.storage.selectBlob", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAzureStorageSelectBlob(ctx, params, notifier)
	})
	m.register("azure.storage.setPrefixFilter", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAzureStorageSetPrefixFilter(ctx, params, notifier)
	})
	m.register("azure.storage.createAccount", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAzureStorageCreateAccount(ctx, params, notifier)
	})
	m.register("azure.storage.createContainer", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAzureStorageCreateContainer(ctx, params, notifier)
	})
	m.register("azure.storage.uploadBlob", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAzureStorageUploadBlob(ctx, params, notifier)
	})
	m.register("azure.storage.deleteBlob", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAzureStorageDeleteBlob(ctx, params, notifier)
	})
	m.register("azure.storage.copyBlob", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAzureStorageCopyBlob(ctx, params, notifier)
	})
	m.register("azure.storage.createFolderPrefix", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAzureStorageCreateFolderPrefix(ctx, params, notifier)
	})
	m.register("azure.logAnalytics.selectWorkspace", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAzureLogAnalyticsSelectWorkspace(ctx, params, notifier)
	})
	m.register("azure.logAnalytics.query", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAzureLogAnalyticsQuery(ctx, params, notifier)
	})
	m.register("azure.logAnalytics.history.list", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAzureLogAnalyticsHistoryList(ctx, params, notifier)
	})
	m.register("azure.logAnalytics.saved.list", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAzureLogAnalyticsSavedList(ctx, params, notifier)
	})
	m.register("azure.logAnalytics.saved.save", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAzureLogAnalyticsSavedSave(ctx, params, notifier)
	})
	m.register("azure.logAnalytics.saved.delete", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAzureLogAnalyticsSavedDelete(ctx, params, notifier)
	})
	m.register("azure.logAnalytics.tables.list", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAzureLogAnalyticsTablesList(ctx, params, notifier)
	})
	m.register("azure.logAnalytics.table.schema", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAzureLogAnalyticsTableSchema(ctx, params, notifier)
	})
	m.register("azure.waf.logs.schema", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAzureWafLogsSchema(ctx, params, notifier)
	})
	m.register("azure.waf.refresh", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAzureWafRefresh(ctx, params, notifier)
	})
	m.register("azure.waf.selectPolicy", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAzureWafSelectPolicy(ctx, params, notifier)
	})
	m.register("azure.waf.config.setMode", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAzureWafConfigSetMode(ctx, params, notifier)
	})
	m.register("azure.waf.config.setManagedRule", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAzureWafConfigSetManagedRule(ctx, params, notifier)
	})
	m.register("azure.waf.config.addExclusion", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAzureWafConfigAddExclusion(ctx, params, notifier)
	})
	m.register("azure.waf.config.removeExclusion", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAzureWafConfigRemoveExclusion(ctx, params, notifier)
	})
	m.register("azure.frontDoor.selectProfile", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAzureFrontDoorSelectProfile(ctx, params, notifier)
	})
	m.register("azure.frontDoor.selectEndpoint", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAzureFrontDoorSelectEndpoint(ctx, params, notifier)
	})
	m.register("azure.frontDoor.selectOriginGroup", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAzureFrontDoorSelectOriginGroup(ctx, params, notifier)
	})
	m.register("azure.frontDoor.refresh", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAzureFrontDoorRefresh(ctx, params, notifier)
	})
	m.register("azure.frontDoor.purgeCache", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAzureFrontDoorPurgeCache(ctx, params, notifier)
	})
	m.register("azure.functions.selectApp", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAzureFunctionsSelectApp(ctx, params, notifier)
	})
	m.register("azure.functions.selectFunction", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAzureFunctionsSelectFunction(ctx, params, notifier)
	})
	m.register("azure.functions.invoke", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAzureFunctionsInvoke(ctx, params, notifier)
	})
	m.register("azure.keyVault.selectVault", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAzureKeyVaultSelectVault(ctx, params, notifier)
	})
	m.register("azure.keyVault.selectSecret", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAzureKeyVaultSelectSecret(ctx, params, notifier)
	})
	m.register("azure.keyVault.revealSecret", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAzureKeyVaultRevealSecret(ctx, params, notifier)
	})
	m.register("azure.keyVault.setSecret", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAzureKeyVaultSetSecret(ctx, params, notifier)
	})
	m.register("azure.cosmos.selectAccount", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAzureCosmosSelectAccount(ctx, params, notifier)
	})
	m.register("azure.cosmos.selectDatabase", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAzureCosmosSelectDatabase(ctx, params, notifier)
	})
	m.register("azure.cosmos.selectContainer", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAzureCosmosSelectContainer(ctx, params, notifier)
	})
	m.register("azure.postgres.selectServer", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAzurePostgresSelectServer(ctx, params, notifier)
	})
	m.register("azure.postgres.startServer", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAzurePostgresStartServer(ctx, params, notifier)
	})
	m.register("azure.postgres.stopServer", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAzurePostgresStopServer(ctx, params, notifier)
	})
	m.register("azure.queues.selectQueue", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAzureQueuesSelectQueue(ctx, params, notifier)
	})
	m.register("azure.bastion.list", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAzureBastionList(ctx, params, notifier)
	})
	m.register("azure.bastion.connect", func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
		return s.handleAzureBastionConnect(ctx, params, notifier)
	})
}
