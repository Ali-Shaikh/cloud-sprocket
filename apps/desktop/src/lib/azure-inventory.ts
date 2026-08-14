// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import type { WorkspaceSnapshot } from "@/types/backend";

export type AzureInventoryScope =
  | "storage"
  | "functions"
  | "keyvault"
  | "cosmos"
  | "postgres"
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
  "azure-postgres": "postgres",
  "azure-queues": "queues",
  "azure-entra": "entra",
};

export function azureInventoryScopeForTab(tabId: string): AzureInventoryScope | undefined {
  return TAB_SCOPE_MAP[tabId];
}

export function azureInventoryStatusMessage(
  workspace: WorkspaceSnapshot,
  scope: AzureInventoryScope,
): string | undefined {
  switch (scope) {
    case "storage":
      return workspace.azureStorageStatusMessage;
    case "webapps":
      return workspace.azureAppServiceStatusMessage;
    case "loganalytics":
      return workspace.azureLogAnalyticsStatusMessage;
    case "waf":
      return workspace.azureWafStatusMessage;
    case "frontdoor":
      return workspace.azureFrontDoorStatusMessage;
    case "functions":
      return workspace.azureFunctionsStatusMessage;
    case "keyvault":
      return workspace.azureKeyVaultStatusMessage;
    case "cosmos":
      return workspace.azureCosmosStatusMessage;
    case "postgres":
      return workspace.azurePostgresStatusMessage;
    case "queues":
      return workspace.azureQueuesStatusMessage;
    case "entra":
      return workspace.azureEntraStatusMessage;
    default:
      return undefined;
  }
}

const DEFAULT_INVENTORY_LOADING_LABELS: Record<AzureInventoryScope, string> = {
  storage: "Loading storage accounts...",
  webapps: "Loading App Service web apps...",
  loganalytics: "Loading Log Analytics workspaces...",
  waf: "Loading WAF policies and Log Analytics workspaces...",
  frontdoor: "Loading Azure Front Door profiles...",
  functions: "Loading Function Apps...",
  keyvault: "Loading Key Vaults...",
  cosmos: "Loading Cosmos DB accounts...",
  postgres: "Loading PostgreSQL flexible servers...",
  queues: "Loading storage queues...",
  entra: "Loading Entra ID directory data...",
};

export function azureInventoryLoadingLabel(
  workspace: WorkspaceSnapshot,
  scope: AzureInventoryScope,
): string {
  const status = azureInventoryStatusMessage(workspace, scope)?.trim();
  if (status) {
    return status;
  }
  return DEFAULT_INVENTORY_LOADING_LABELS[scope];
}

export function azureInventoryLoaded(
  workspace: WorkspaceSnapshot,
  scope: AzureInventoryScope,
): boolean {
  const state = workspace.azureInventory?.[scope];
  if (state) {
    return state.loaded;
  }
  return azureInventoryLoadedFallback(workspace, scope);
}

/** Historical snapshots without azureInventory: any rows or any status means fetched. */
function azureInventoryLoadedFallback(
  workspace: WorkspaceSnapshot,
  scope: AzureInventoryScope,
): boolean {
  switch (scope) {
    case "storage":
      return (workspace.azureStorageAccounts?.length ?? 0) > 0 ||
        Boolean(workspace.azureStorageStatusMessage);
    case "webapps":
      return (workspace.azureWebApps?.length ?? 0) > 0 ||
        Boolean(workspace.azureAppServiceStatusMessage);
    case "loganalytics":
      return (workspace.azureLogAnalyticsWorkspaces?.length ?? 0) > 0 ||
        Boolean(workspace.azureLogAnalyticsStatusMessage);
    case "waf":
      return (workspace.azureWafPolicies?.length ?? 0) > 0 ||
        Boolean(workspace.azureWafStatusMessage);
    case "frontdoor":
      return (workspace.azureFrontDoorProfiles?.length ?? 0) > 0 ||
        Boolean(workspace.azureFrontDoorStatusMessage);
    case "functions":
      return (workspace.azureFunctionApps?.length ?? 0) > 0 ||
        Boolean(workspace.azureFunctionsStatusMessage);
    case "keyvault":
      return (workspace.azureKeyVaults?.length ?? 0) > 0 ||
        Boolean(workspace.azureKeyVaultStatusMessage);
    case "cosmos":
      return (workspace.azureCosmosAccounts?.length ?? 0) > 0 ||
        Boolean(workspace.azureCosmosStatusMessage);
    case "postgres":
      return (workspace.azurePostgresServers?.length ?? 0) > 0 ||
        Boolean(workspace.azurePostgresStatusMessage);
    case "queues":
      return Boolean(workspace.azureQueuesStatusMessage);
    case "entra":
      return Boolean(workspace.azureEntraStatusMessage);
    default:
      return false;
  }
}