// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { describe, expect, it } from "vitest";

import { navItemForTab, viewLabelFor } from "./workspace-shell";
import type { WorkspaceSnapshot, WorkspaceTab } from "@/types/backend";

const emptyWorkspace = {
  gcpStorageBuckets: [{ name: "alpha" }],
  gcpComputeInstances: [{ name: "web-1" }],
  gcpFunctions: [{ name: "hello" }],
  gcpGkeClusters: [{ name: "prod" }],
} as unknown as WorkspaceSnapshot;

describe("workspace-shell GCP navigation", () => {
  it("labels live GCP services and does not mark them Soon", () => {
    const tabs: WorkspaceTab[] = [
      {
        tabId: "gcp-storage",
        label: "Cloud Storage",
        summary: "GCS",
        detail: "detail",
        category: "service",
        domain: "storage",
      },
      {
        tabId: "gcp-compute",
        label: "Compute Engine",
        summary: "GCE",
        detail: "detail",
        category: "service",
        domain: "compute",
      },
      {
        tabId: "gcp-functions",
        label: "Cloud Functions",
        summary: "GCF",
        detail: "detail",
        category: "service",
        domain: "compute",
      },
      {
        tabId: "gcp-gke",
        label: "GKE",
        summary: "GKE",
        detail: "detail",
        category: "service",
        domain: "compute",
      },
    ];

    for (const tab of tabs) {
      const item = navItemForTab(tab, emptyWorkspace);
      expect(item.comingSoon).toBe(false);
      expect(item.count).toBe(1);
      expect(viewLabelFor(tab.tabId, tabs)).toBe(tab.label);
    }
  });

  it("marks coming_soon catalogue entries with Soon", () => {
    const tab: WorkspaceTab = {
      tabId: "gcp-future",
      label: "Future service",
      summary: "Not ready",
      detail: "detail",
      category: "coming_soon",
    };
    const item = navItemForTab(tab, emptyWorkspace);
    expect(item.comingSoon).toBe(true);
    expect(item.count).toBeUndefined();
  });
});
