// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { describe, expect, it } from "vitest";

import {
  gcpInventoryLoaded,
  gcpInventoryLoadedScopesKey,
  gcpInventoryResultStillCurrent,
  gcpInventoryViewLoading,
  markGcpInventoryFetchError,
  shouldFetchGcpInventory,
} from "./gcp-inventory";
import type { WorkspaceSnapshot } from "@/types/backend";

describe("gcpInventoryLoaded", () => {
  it("matches the snapshot flag even when the status copy changes", () => {
    const workspace = {
      gcpStorageStatusMessage: "No Cloud Storage buckets are currently available for this GCP project.",
      gcpInventory: { gcs: { loaded: true, emptyReason: "none_found" } },
    } as unknown as WorkspaceSnapshot;

    expect(gcpInventoryLoaded(workspace, "gcs")).toBe(true);
  });

  it("does not treat status copy as loaded when the flag is absent", () => {
    const workspace = {
      gcpStorageStatusMessage: "No Cloud Storage buckets are currently available for this GCP project.",
      gcpComputeStatusMessage: "No Compute Engine instances are currently available for this GCP project.",
      gcpFunctionsStatusMessage: "No Cloud Functions are currently available for this GCP project.",
      gcpGkeStatusMessage: "No GKE clusters are currently available for this GCP project.",
    } as unknown as WorkspaceSnapshot;

    expect(gcpInventoryLoaded(workspace, "gcs")).toBe(false);
    expect(gcpInventoryLoaded(workspace, "gce")).toBe(false);
    expect(gcpInventoryLoaded(workspace, "gcf")).toBe(false);
    expect(gcpInventoryLoaded(workspace, "gke")).toBe(false);
  });

  it("falls back to rows when the flag is absent", () => {
    const workspace = {
      gcpComputeInstances: [{ name: "web-1" }],
    } as unknown as WorkspaceSnapshot;

    expect(gcpInventoryLoaded(workspace, "gce")).toBe(true);
    expect(gcpInventoryLoaded(workspace, "gcs")).toBe(false);
  });
});

describe("gcp inventory fetch gating", () => {
  it("fetches a deferred empty scope even when status copy is present", () => {
    const workspace = {
      gcpStorageBuckets: [],
      gcpStorageStatusMessage: "No Cloud Storage buckets are currently available for this GCP project.",
    } as unknown as WorkspaceSnapshot;

    expect(shouldFetchGcpInventory(workspace, "gcs", false)).toBe(true);
    expect(gcpInventoryViewLoading(workspace, "gcs", false)).toBe(true);
  });

  it("does not refetch a loaded empty scope", () => {
    const workspace = {
      gcpStorageBuckets: [],
      gcpInventory: { gcs: { loaded: true, emptyReason: "none_found" } },
    } as unknown as WorkspaceSnapshot;

    expect(shouldFetchGcpInventory(workspace, "gcs", false)).toBe(false);
    expect(gcpInventoryViewLoading(workspace, "gcs", false)).toBe(false);
  });

  it("skips while a fetch is already in flight", () => {
    const workspace = {} as unknown as WorkspaceSnapshot;
    expect(shouldFetchGcpInventory(workspace, "gcf", true)).toBe(false);
  });

  it("retries a failed scope when the tab becomes active again", () => {
    const workspace = markGcpInventoryFetchError(
      { gcpStorageBuckets: [] } as unknown as WorkspaceSnapshot,
      "gcs",
      "timed out",
    );

    expect(shouldFetchGcpInventory(workspace, "gcs", false)).toBe(false);
    expect(shouldFetchGcpInventory(workspace, "gcs", false, true)).toBe(true);
  });

  it("rebuilds the loaded-scopes key after a deferred snapshot wipe", () => {
    const loaded = {
      gcpInventory: { gcs: { loaded: true }, gke: { loaded: true } },
    } as unknown as WorkspaceSnapshot;
    expect(gcpInventoryLoadedScopesKey(loaded)).toBe("gcs,gke");
    expect(gcpInventoryLoadedScopesKey({} as WorkspaceSnapshot)).toBe("");
  });

  it("records a fetch error so the tab can stop spinning", () => {
    const workspace = markGcpInventoryFetchError(
      { gcpComputeInstances: [] } as unknown as WorkspaceSnapshot,
      "gce",
      "open a GCP workspace before loading service inventory",
    );

    expect(workspace.gcpInventory?.gce).toEqual({ loaded: true, emptyReason: "error" });
    expect(workspace.gcpComputeStatusMessage).toBe(
      "open a GCP workspace before loading service inventory",
    );
    expect(gcpInventoryLoaded(workspace, "gce")).toBe(true);
    expect(gcpInventoryViewLoading(workspace, "gce", false)).toBe(false);
  });

  it("keeps a loaded tab idle while another scope is the one in flight", () => {
    const workspace = {
      gcpInventory: { gcs: { loaded: true, emptyReason: "none_found" } },
    } as unknown as WorkspaceSnapshot;

    expect(gcpInventoryViewLoading(workspace, "gcs", false)).toBe(false);
    expect(gcpInventoryViewLoading(workspace, "gce", true)).toBe(true);
  });
});

describe("gcpInventoryResultStillCurrent", () => {
  const started = { profileId: "proj-a", lockedProfileId: "proj-a", refreshToken: 1 };

  it("accepts a result from the same project and refresh", () => {
    expect(gcpInventoryResultStillCurrent(started, { ...started })).toBe(true);
  });

  it("rejects a result after the project or a discovery refresh changes", () => {
    expect(
      gcpInventoryResultStillCurrent(started, { ...started, profileId: "proj-b" }),
    ).toBe(false);
    expect(
      gcpInventoryResultStillCurrent(started, { ...started, refreshToken: 2 }),
    ).toBe(false);
  });
});
