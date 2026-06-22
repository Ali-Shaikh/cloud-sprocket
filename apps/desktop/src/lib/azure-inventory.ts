// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import type { WorkspaceSnapshot } from "@/types/backend";

export type AzureInventoryScope =
  | "storage"
  | "functions"
  | "keyvault"
  | "cosmos"
  | "waf"
  | "queues"
  | "webapps"
  | "frontdoor"
  | "loganalytics"
  | "entra";

const TAB_SCOPE_MAP: Record<string, AzureInventoryScope | undefined> = {
  "azure-storage": "storage",
  "azure-app-service": "webapps",
  "azure-log-analytics": "loganalytics",
  "azure-waf": "waf",
  "azure-front-door": "frontdoor",
  "azure-functions": "functions",
  "azure-key-vault": "keyvault",
  "azure-cosmos": "cosmos",
  "azure-queues": "queues",
  "azure-entra": "entra",
};

export function azureInventoryScopeForTab(tabId: string): AzureInventoryScope | undefined {
  return TAB_SCOPE_MAP[tabId];
}

export function azureInventoryLoaded(
  workspace: WorkspaceSnapshot,
  scope: AzureInventoryScope,
): boolean {
  switch (scope) {
    case "storage":
      return (workspace.azureStorageAccounts?.length ?? 0) > 0 ||
        (workspace.azureStorageStatusMessage ?? "").length > 0;
    case "webapps":
      return (workspace.azureWebApps?.length ?? 0) > 0 ||
        (workspace.azureAppServiceStatusMessage ?? "").includes("No App Service");
    case "loganalytics":
      return (workspace.azureLogAnalyticsWorkspaces?.length ?? 0) > 0 ||
        (workspace.azureLogAnalyticsStatusMessage ?? "").length > 0;
    case "waf":
      return (workspace.azureWafPolicies?.length ?? 0) > 0 ||
        (workspace.azureWafStatusMessage ?? "").length > 0;
    case "frontdoor":
      return (workspace.azureFrontDoorProfiles?.length ?? 0) > 0 ||
        (workspace.azureFrontDoorStatusMessage ?? "").includes("No Azure Front Door");
    case "functions":
      return (workspace.azureFunctionApps?.length ?? 0) > 0 ||
        (workspace.azureFunctionsStatusMessage ?? "").includes("No Function Apps");
    case "keyvault":
      return (workspace.azureKeyVaults?.length ?? 0) > 0 ||
        (workspace.azureKeyVaultStatusMessage ?? "").includes("No Key Vaults");
    case "cosmos":
      return (workspace.azureCosmosAccounts?.length ?? 0) > 0 ||
        (workspace.azureCosmosStatusMessage ?? "").includes("No Cosmos");
    case "queues":
      return (workspace.azureQueuesStatusMessage ?? "").length > 0;
    case "entra":
      return (workspace.azureEntraStatusMessage ?? "").length > 0;
    default:
      return false;
  }
}