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

/**
 * Historical snapshots without azureInventory: rows mean the scope was fetched.
 * Status copy alone is not a loaded signal (deferred workspace.get must still
 * call azure.inventory.get).
 */
function azureInventoryLoadedFallback(
  workspace: WorkspaceSnapshot,
  scope: AzureInventoryScope,
): boolean {
  switch (scope) {
    case "storage":
      return (workspace.azureStorageAccounts?.length ?? 0) > 0;
    case "webapps":
      return (workspace.azureWebApps?.length ?? 0) > 0;
    case "loganalytics":
      return (workspace.azureLogAnalyticsWorkspaces?.length ?? 0) > 0;
    case "waf":
      return (workspace.azureWafPolicies?.length ?? 0) > 0;
    case "frontdoor":
      return (workspace.azureFrontDoorProfiles?.length ?? 0) > 0;
    case "functions":
      return (workspace.azureFunctionApps?.length ?? 0) > 0;
    case "keyvault":
      return (workspace.azureKeyVaults?.length ?? 0) > 0;
    case "cosmos":
      return (workspace.azureCosmosAccounts?.length ?? 0) > 0;
    case "postgres":
      return (workspace.azurePostgresServers?.length ?? 0) > 0;
    case "queues":
      return (workspace.azureStorageQueues?.length ?? 0) > 0;
    case "entra":
      return (workspace.azureEntraUsers?.length ?? 0) > 0 ||
        (workspace.azureEntraGroups?.length ?? 0) > 0 ||
        (workspace.azureEntraApps?.length ?? 0) > 0;
    default:
      return false;
  }
}

/** Sorted loaded-scope key so a deferred snapshot wipe retriggers tab fetches. */
export function azureInventoryLoadedScopesKey(workspace: WorkspaceSnapshot): string {
  const inventory = workspace.azureInventory;
  if (!inventory) {
    return "";
  }
  return Object.keys(inventory)
    .filter((scope) => inventory[scope]?.loaded)
    .sort()
    .join(",");
}

export function shouldFetchAzureInventory(
  workspace: WorkspaceSnapshot,
  scope: AzureInventoryScope,
  inFlight: boolean,
): boolean {
  if (inFlight) {
    return false;
  }
  return !azureInventoryLoaded(workspace, scope);
}

/** True while the tab should show a loading state instead of an empty list. */
export function azureInventoryViewLoading(
  workspace: WorkspaceSnapshot,
  scope: AzureInventoryScope,
  fetchInFlight: boolean,
): boolean {
  return fetchInFlight || !azureInventoryLoaded(workspace, scope);
}

/** Record a failed azure.inventory.get so the tab stops spinning. */
export function markAzureInventoryFetchError(
  workspace: WorkspaceSnapshot,
  scope: AzureInventoryScope,
  message: string,
): WorkspaceSnapshot {
  const status = message.trim() || "Could not load Azure service inventory.";
  const next: WorkspaceSnapshot = {
    ...workspace,
    azureInventory: {
      ...workspace.azureInventory,
      [scope]: { loaded: true, emptyReason: "error" },
    },
  };
  switch (scope) {
    case "storage":
      next.azureStorageStatusMessage = status;
      break;
    case "webapps":
      next.azureAppServiceStatusMessage = status;
      break;
    case "loganalytics":
      next.azureLogAnalyticsStatusMessage = status;
      break;
    case "waf":
      next.azureWafStatusMessage = status;
      break;
    case "frontdoor":
      next.azureFrontDoorStatusMessage = status;
      break;
    case "functions":
      next.azureFunctionsStatusMessage = status;
      break;
    case "keyvault":
      next.azureKeyVaultStatusMessage = status;
      break;
    case "cosmos":
      next.azureCosmosStatusMessage = status;
      break;
    case "postgres":
      next.azurePostgresStatusMessage = status;
      break;
    case "queues":
      next.azureQueuesStatusMessage = status;
      break;
    case "entra":
      next.azureEntraStatusMessage = status;
      break;
    default:
      break;
  }
  return next;
}