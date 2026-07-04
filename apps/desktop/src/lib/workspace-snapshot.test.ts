// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { describe, expect, it } from "vitest";

import {
  emptyWorkspace,
  formatBackendError,
  mergeAwsInventoryScope,
  normaliseWorkspaceSnapshot,
} from "./workspace-snapshot";

describe("normaliseWorkspaceSnapshot", () => {
  it("fills missing inventory arrays with empty lists", () => {
    const workspace = normaliseWorkspaceSnapshot({});

    expect(workspace.s3Buckets).toEqual([]);
    expect(workspace.ec2Instances).toEqual([]);
    expect(workspace.actionCapabilities).toEqual({});
    expect(workspace.runtimeSettings).toEqual(emptyWorkspace.runtimeSettings);
  });
});

describe("mergeAwsInventoryScope", () => {
  it("merges only the requested S3 scope fields", () => {
    const current = normaliseWorkspaceSnapshot({
      ec2Instances: [{ instanceId: "i-keep", state: "running" }],
      s3Buckets: [{ name: "old-bucket" }],
    });
    const incoming = normaliseWorkspaceSnapshot({
      s3Buckets: [{ name: "new-bucket" }],
      selectedS3BucketName: "new-bucket",
      ec2Instances: [{ instanceId: "i-drop", state: "stopped" }],
    });

    const merged = mergeAwsInventoryScope(current, incoming, "s3");

    expect(merged.s3Buckets).toEqual([{ name: "new-bucket" }]);
    expect(merged.selectedS3BucketName).toBe("new-bucket");
    expect(merged.ec2Instances[0]?.instanceId).toBe("i-keep");
    expect(merged.ec2Instances[0]?.state).toBe("running");
  });
});

describe("formatBackendError", () => {
  it("unwraps JSON RPC error payloads", () => {
    const message = formatBackendError(
      new Error('Backend RPC error: {"message":"Write mode is off"}'),
    );

    expect(message).toBe("Write mode is off");
  });
});