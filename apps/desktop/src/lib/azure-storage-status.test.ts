// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { describe, expect, it } from "vitest";

import { presentAzureStorageStatus } from "./azure-storage-status";

describe("presentAzureStorageStatus", () => {
  it("returns null for empty messages", () => {
    expect(presentAzureStorageStatus("")).toBeNull();
    expect(presentAzureStorageStatus("   ")).toBeNull();
    expect(presentAzureStorageStatus(null)).toBeNull();
  });

  it("treats multi-line list failures as error banners", () => {
    const presented = presentAzureStorageStatus(
      [
        "Could not list containers in erw00dev00fs",
        "This storage account blocks public network access.",
        "blocked by network rules of storage account",
      ].join("\n"),
    );
    expect(presented).toEqual({
      tone: "destructive",
      isError: true,
      title: "Could not list containers in erw00dev00fs",
      description: "This storage account blocks public network access.",
      detail: "blocked by network rules of storage account",
    });
  });

  it("keeps successful inventory messages informational", () => {
    const presented = presentAzureStorageStatus("Loaded 3 blobs from acct/container.");
    expect(presented).toEqual({
      tone: "info",
      isError: false,
      title: "Loaded 3 blobs from acct/container.",
      description: undefined,
    });
  });
});
