// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"encoding/json"
)

// registerAzureHandlers registers all azure.* JSON-RPC methods.
func (s *Service) registerAzureHandlers(m map[string]RPCHandler) {
	m["azure.inventory.get"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureInventoryGet(ctx, params, notifier) }
	m["azure.selectResourceGroup"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureSelectResourceGroup(ctx, params, notifier) }
	m["azure.selectVirtualMachine"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureSelectVirtualMachine(ctx, params, notifier) }
	m["azure.resourceGroups.create"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureResourceGroupsCreate(ctx, params, notifier) }
	m["azure.resourceGroups.delete"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureResourceGroupsDelete(ctx, params, notifier) }
	m["azure.virtualMachines.invokeAction"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureVirtualMachinesInvokeAction(ctx, params, notifier) }
	m["azure.webApps.select"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureSelectWebApp(ctx, params, notifier) }
	m["azure.webApps.selectSlot"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureWebAppsSelectSlot(ctx, params, notifier) }
	m["azure.webApps.createSlot"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureWebAppsCreateSlot(ctx, params, notifier) }
	m["azure.webApps.swapSlots"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureWebAppsSwapSlots(ctx, params, notifier) }
	m["azure.webApps.create"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureWebAppsCreate(ctx, params, notifier) }
	m["azure.webApps.invokeAction"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureWebAppsInvokeAction(ctx, params, notifier) }
	m["azure.webApps.setSetting"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureWebAppsSetSetting(ctx, params, notifier) }
	m["azure.webApps.deleteSetting"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureWebAppsDeleteSetting(ctx, params, notifier) }
	m["azure.storage.selectAccount"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureStorageSelectAccount(ctx, params, notifier) }
	m["azure.storage.selectContainer"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureStorageSelectContainer(ctx, params, notifier) }
	m["azure.storage.selectBlob"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureStorageSelectBlob(ctx, params, notifier) }
	m["azure.storage.setPrefixFilter"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureStorageSetPrefixFilter(ctx, params, notifier) }
	m["azure.storage.createAccount"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureStorageCreateAccount(ctx, params, notifier) }
	m["azure.storage.createContainer"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureStorageCreateContainer(ctx, params, notifier) }
	m["azure.storage.uploadBlob"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureStorageUploadBlob(ctx, params, notifier) }
	m["azure.storage.deleteBlob"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureStorageDeleteBlob(ctx, params, notifier) }
	m["azure.storage.copyBlob"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureStorageCopyBlob(ctx, params, notifier) }
	m["azure.storage.createFolderPrefix"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureStorageCreateFolderPrefix(ctx, params, notifier) }
	m["azure.logAnalytics.selectWorkspace"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureLogAnalyticsSelectWorkspace(ctx, params, notifier) }
	m["azure.logAnalytics.query"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureLogAnalyticsQuery(ctx, params, notifier) }
	m["azure.logAnalytics.history.list"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureLogAnalyticsHistoryList(ctx, params, notifier) }
	m["azure.logAnalytics.saved.list"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureLogAnalyticsSavedList(ctx, params, notifier) }
	m["azure.logAnalytics.saved.save"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureLogAnalyticsSavedSave(ctx, params, notifier) }
	m["azure.logAnalytics.saved.delete"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureLogAnalyticsSavedDelete(ctx, params, notifier) }
	m["azure.logAnalytics.tables.list"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureLogAnalyticsTablesList(ctx, params, notifier) }
	m["azure.logAnalytics.table.schema"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureLogAnalyticsTableSchema(ctx, params, notifier) }
	m["azure.waf.logs.schema"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureWafLogsSchema(ctx, params, notifier) }
	m["azure.waf.refresh"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureWafRefresh(ctx, params, notifier) }
	m["azure.waf.selectPolicy"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureWafSelectPolicy(ctx, params, notifier) }
	m["azure.waf.config.setMode"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureWafConfigSetMode(ctx, params, notifier) }
	m["azure.waf.config.setManagedRule"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureWafConfigSetManagedRule(ctx, params, notifier) }
	m["azure.waf.config.addExclusion"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureWafConfigAddExclusion(ctx, params, notifier) }
	m["azure.waf.config.removeExclusion"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureWafConfigRemoveExclusion(ctx, params, notifier) }
	m["azure.frontDoor.selectProfile"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureFrontDoorSelectProfile(ctx, params, notifier) }
	m["azure.frontDoor.selectEndpoint"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureFrontDoorSelectEndpoint(ctx, params, notifier) }
	m["azure.frontDoor.selectOriginGroup"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureFrontDoorSelectOriginGroup(ctx, params, notifier) }
	m["azure.frontDoor.refresh"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureFrontDoorRefresh(ctx, params, notifier) }
	m["azure.frontDoor.purgeCache"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureFrontDoorPurgeCache(ctx, params, notifier) }
	m["azure.functions.selectApp"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureFunctionsSelectApp(ctx, params, notifier) }
	m["azure.functions.selectFunction"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureFunctionsSelectFunction(ctx, params, notifier) }
	m["azure.functions.invoke"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureFunctionsInvoke(ctx, params, notifier) }
	m["azure.keyVault.selectVault"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureKeyVaultSelectVault(ctx, params, notifier) }
	m["azure.keyVault.selectSecret"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureKeyVaultSelectSecret(ctx, params, notifier) }
	m["azure.keyVault.revealSecret"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureKeyVaultRevealSecret(ctx, params, notifier) }
	m["azure.keyVault.setSecret"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureKeyVaultSetSecret(ctx, params, notifier) }
	m["azure.cosmos.selectAccount"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureCosmosSelectAccount(ctx, params, notifier) }
	m["azure.cosmos.selectDatabase"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureCosmosSelectDatabase(ctx, params, notifier) }
	m["azure.cosmos.selectContainer"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureCosmosSelectContainer(ctx, params, notifier) }
	m["azure.postgres.selectServer"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzurePostgresSelectServer(ctx, params, notifier) }
	m["azure.queues.selectQueue"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureQueuesSelectQueue(ctx, params, notifier) }
	m["azure.bastion.list"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureBastionList(ctx, params, notifier) }
	m["azure.bastion.connect"] = func(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) { return s.handleAzureBastionConnect(ctx, params, notifier) }
}
