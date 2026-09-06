// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { describe, expect, it } from "vitest";

import {
  azureInventoryLoaded,
  azureInventoryLoadedScopesKey,
  azureInventoryViewLoading,
  markAzureInventoryFetchError,
  shouldFetchAzureInventory,
} from "./azure-inventory";
import type { WorkspaceSnapshot } from "@/types/backend";

describe("azureInventoryLoaded", () => {
  it("matches the snapshot flag even when the status copy changes", () => {
    const workspace = {
      azureAppServiceStatusMessage: "No web apps in this subscription.",
      azureInventory: { webapps: { loaded: true, emptyReason: "none_found" } },
    } as unknown as WorkspaceSnapshot;

    expect(azureInventoryLoaded(workspace, "webapps")).toBe(true);
  });

  it("does not treat a missing fetch as loaded when the flag is false", () => {
    const workspace = {
      azureAppServiceStatusMessage: "No App Service web apps were returned for rg.",
      azureInventory: { webapps: { loaded: false } },
    } as unknown as WorkspaceSnapshot;

    expect(azureInventoryLoaded(workspace, "webapps")).toBe(false);
  });

  it("does not treat status copy as loaded when the flag is absent", () => {
    const workspace = {
      azureFunctionsStatusMessage: "No Function Apps found.",
      azureStorageStatusMessage: "Loading storage accounts...",
    } as unknown as WorkspaceSnapshot;

    expect(azureInventoryLoaded(workspace, "functions")).toBe(false);
    expect(azureInventoryLoaded(workspace, "storage")).toBe(false);
    expect(azureInventoryLoaded(workspace, "webapps")).toBe(false);
  });

  it("falls back to rows when the flag is absent", () => {
    const workspace = {
      azureKeyVaults: [{ name: "kv-demo" }],
    } as unknown as WorkspaceSnapshot;

    expect(azureInventoryLoaded(workspace, "keyvault")).toBe(true);
  });
});

describe("azure inventory fetch gating", () => {
  it("fetches a deferred empty scope even when status copy is present", () => {
    const workspace = {
      azureStorageAccounts: [],
      azureStorageStatusMessage: "Loading storage accounts...",
    } as unknown as WorkspaceSnapshot;

    expect(shouldFetchAzureInventory(workspace, "storage", false)).toBe(true);
    expect(azureInventoryViewLoading(workspace, "storage", false)).toBe(true);
  });

  it("does not refetch a loaded empty scope", () => {
    const workspace = {
      azureStorageAccounts: [],
      azureInventory: { storage: { loaded: true, emptyReason: "none_found" } },
    } as unknown as WorkspaceSnapshot;

    expect(shouldFetchAzureInventory(workspace, "storage", false)).toBe(false);
    expect(azureInventoryViewLoading(workspace, "storage", false)).toBe(false);
  });

  it("skips while a fetch is already in flight", () => {
    const workspace = {} as unknown as WorkspaceSnapshot;
    expect(shouldFetchAzureInventory(workspace, "functions", true)).toBe(false);
  });

  it("retries a failed scope when the tab becomes active again", () => {
    const workspace = markAzureInventoryFetchError(
      { azureStorageAccounts: [] } as unknown as WorkspaceSnapshot,
      "storage",
      "timed out",
    );

    expect(shouldFetchAzureInventory(workspace, "storage", false)).toBe(false);
    expect(shouldFetchAzureInventory(workspace, "storage", false, true)).toBe(true);
  });

  it("rebuilds the loaded-scopes key after a deferred snapshot wipe", () => {
    const loaded = {
      azureInventory: { storage: { loaded: true }, waf: { loaded: true } },
    } as unknown as WorkspaceSnapshot;
    expect(azureInventoryLoadedScopesKey(loaded)).toBe("storage,waf");
    expect(azureInventoryLoadedScopesKey({} as WorkspaceSnapshot)).toBe("");
  });

  it("records a fetch error so the tab can stop spinning", () => {
    const workspace = markAzureInventoryFetchError(
      { azureStorageAccounts: [] } as unknown as WorkspaceSnapshot,
      "storage",
      "open an Azure workspace before loading service inventory",
    );

    expect(workspace.azureInventory?.storage).toEqual({ loaded: true, emptyReason: "error" });
    expect(workspace.azureStorageStatusMessage).toBe(
      "open an Azure workspace before loading service inventory",
    );
    expect(azureInventoryLoaded(workspace, "storage")).toBe(true);
    expect(azureInventoryViewLoading(workspace, "storage", false)).toBe(false);
  });
});
