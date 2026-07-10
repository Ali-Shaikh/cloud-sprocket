// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { describe, expect, it } from "vitest";

import {
  emptyWorkspace,
  formatBackendError,
  mergeAwsInventoryScope,
  mergeAwsS3ObjectSelection,
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

describe("mergeAwsS3ObjectSelection", () => {
  it("keeps Load more pages when selecting an object", () => {
    const current = normaliseWorkspaceSnapshot({
      selectedS3BucketName: "artifacts",
      s3PrefixFilter: "reports/",
      s3Objects: [
        { key: "reports/a.json" },
        { key: "reports/b.json" },
        { key: "reports/page2.json" },
      ],
      s3ObjectsNextToken: "token-2",
      s3ObjectsHasMore: true,
      s3StatusMessage: "Loaded more items.",
    });
    const incoming = normaliseWorkspaceSnapshot({
      selectedS3BucketName: "artifacts",
      selectedS3ObjectKey: "reports/page2.json",
      s3PrefixFilter: "reports/",
      s3Objects: [{ key: "reports/a.json" }],
      s3ObjectsNextToken: undefined,
      s3ObjectsHasMore: false,
      s3ObjectMetadata: [{ label: "Size", value: "12 B" }],
      s3ExportSnippets: [{ label: "S3 URI", value: "s3://artifacts/reports/page2.json" }],
      s3StatusMessage: "Selected object.",
    });

    const merged = mergeAwsS3ObjectSelection(current, incoming);

    expect(merged.selectedS3ObjectKey).toBe("reports/page2.json");
    expect(merged.s3Objects).toHaveLength(3);
    expect(merged.s3ObjectsNextToken).toBe("token-2");
    expect(merged.s3ObjectsHasMore).toBe(true);
    expect(merged.s3ObjectMetadata).toEqual([{ label: "Size", value: "12 B" }]);
    expect(merged.s3StatusMessage).toBe("Selected object.");
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