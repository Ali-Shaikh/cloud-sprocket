// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { describe, expect, it } from "vitest";

import { azureInventoryLoaded } from "./azure-inventory";
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

  it("falls back to any status when the flag is absent", () => {
    const workspace = {
      azureFunctionsStatusMessage: "No Function Apps found.",
    } as unknown as WorkspaceSnapshot;

    expect(azureInventoryLoaded(workspace, "functions")).toBe(true);
    expect(azureInventoryLoaded(workspace, "webapps")).toBe(false);
  });

  it("falls back to rows when the flag and status are both absent", () => {
    const workspace = {
      azureKeyVaults: [{ name: "kv-demo" }],
    } as unknown as WorkspaceSnapshot;

    expect(azureInventoryLoaded(workspace, "keyvault")).toBe(true);
  });
});
