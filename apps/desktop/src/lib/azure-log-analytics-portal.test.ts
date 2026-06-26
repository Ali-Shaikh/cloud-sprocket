// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { describe, expect, it } from "vitest";

import { buildAzureLogAnalyticsPortalUrl } from "./azure-log-analytics-portal";

describe("azure-log-analytics-portal", () => {
  it("builds a portal deep link when workspace metadata is available", () => {
    const url = buildAzureLogAnalyticsPortalUrl(
      "sub-1",
      { name: "law-platform", resourceGroup: "rg-ops" },
      "dependencies | take 10",
      "P1D",
    );
    expect(url).toContain("portal.azure.com");
    expect(url).toContain(encodeURIComponent("dependencies | take 10"));
    expect(url).toContain(encodeURIComponent("/subscriptions/sub-1/resourceGroups/rg-ops"));
  });

  it("returns null when workspace metadata is incomplete", () => {
    expect(buildAzureLogAnalyticsPortalUrl("sub-1", { name: "law" }, "Heartbeat", "P1D")).toBeNull();
  });
});