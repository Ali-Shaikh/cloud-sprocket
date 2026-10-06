// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import type { WorkspaceSnapshot } from "@/types/backend";

export type GcpInventoryScope = "gcs" | "gce" | "gcf" | "gke";

const TAB_SCOPE_MAP: Record<string, GcpInventoryScope | undefined> = {
  "gcp-storage": "gcs",
  "gcp-compute": "gce",
  "gcp-functions": "gcf",
  "gcp-gke": "gke",
};

const LOADING_LABELS: Record<GcpInventoryScope, string> = {
  gcs: "Loading Cloud Storage buckets...",
  gce: "Loading Compute Engine instances...",
  gcf: "Loading Cloud Functions...",
  gke: "Loading GKE clusters...",
};

export function gcpInventoryScopeForTab(tabId: string): GcpInventoryScope | undefined {
  return TAB_SCOPE_MAP[tabId];
}

export function gcpInventoryLoadingLabel(scope: GcpInventoryScope): string {
  return LOADING_LABELS[scope];
}

export function gcpInventoryLoaded(
  workspace: WorkspaceSnapshot,
  scope: GcpInventoryScope,
): boolean {
  const state = workspace.gcpInventory?.[scope];
  if (state) {
    return state.loaded;
  }
  return gcpInventoryLoadedFallback(workspace, scope);
}

/**
 * Historical snapshots without gcpInventory: rows mean the scope was fetched.
 * Status copy alone is not a loaded signal (deferred workspace.get must still
 * call gcp.inventory.get).
 */
function gcpInventoryLoadedFallback(
  workspace: WorkspaceSnapshot,
  scope: GcpInventoryScope,
): boolean {
  switch (scope) {
    case "gcs":
      return (workspace.gcpStorageBuckets?.length ?? 0) > 0;
    case "gce":
      return (workspace.gcpComputeInstances?.length ?? 0) > 0;
    case "gcf":
      return (workspace.gcpFunctions?.length ?? 0) > 0;
    case "gke":
      return (workspace.gcpGkeClusters?.length ?? 0) > 0;
    default:
      return false;
  }
}

/** Sorted loaded-scope key so a deferred snapshot wipe retriggers tab fetches. */
export function gcpInventoryLoadedScopesKey(workspace: WorkspaceSnapshot): string {
  const inventory = workspace.gcpInventory;
  if (!inventory) {
    return "";
  }
  return Object.keys(inventory)
    .filter((scope) => inventory[scope]?.loaded)
    .sort()
    .join(",");
}

export function shouldFetchGcpInventory(
  workspace: WorkspaceSnapshot,
  scope: GcpInventoryScope,
  inFlight: boolean,
  tabBecameActive = false,
): boolean {
  if (inFlight) {
    return false;
  }
  if (workspace.gcpInventory?.[scope]?.emptyReason === "error") {
    return tabBecameActive;
  }
  return !gcpInventoryLoaded(workspace, scope);
}

/** True while the tab should show a loading state instead of an empty list. */
export function gcpInventoryViewLoading(
  workspace: WorkspaceSnapshot,
  scope: GcpInventoryScope,
  fetchInFlight: boolean,
): boolean {
  return fetchInFlight || !gcpInventoryLoaded(workspace, scope);
}

/** Record a failed gcp.inventory.get so the tab stops spinning. */
export function markGcpInventoryFetchError(
  workspace: WorkspaceSnapshot,
  scope: GcpInventoryScope,
  message: string,
): WorkspaceSnapshot {
  const status = message.trim() || "Could not load GCP service inventory.";
  const next: WorkspaceSnapshot = {
    ...workspace,
    gcpInventory: {
      ...workspace.gcpInventory,
      [scope]: { loaded: true, emptyReason: "error" },
    },
  };
  switch (scope) {
    case "gcs":
      next.gcpStorageStatusMessage = status;
      break;
    case "gce":
      next.gcpComputeStatusMessage = status;
      break;
    case "gcf":
      next.gcpFunctionsStatusMessage = status;
      break;
    case "gke":
      next.gcpGkeStatusMessage = status;
      break;
    default:
      break;
  }
  return next;
}
