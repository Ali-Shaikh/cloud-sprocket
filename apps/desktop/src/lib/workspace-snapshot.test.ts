// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { describe, expect, it } from "vitest";

import type { AwsInventorySlice } from "@/types/backend";

import {
  emptyWorkspace,
  formatBackendError,
  mergeAwsDynamoDBLoadMore,
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
  it("merges only the requested S3 payload and preserves unrelated workspace state", () => {
    const current = normaliseWorkspaceSnapshot({
      awsWritesEnabled: true,
      selectedAzureStorageAccount: "keep-store",
      azureStorageAccounts: [
        {
          name: "keep-store",
          kind: "StorageV2",
          location: "uaenorth",
          blobEndpoint: "https://keep-store.blob.core.windows.net/",
        },
      ],
      selectedEc2Region: "us-east-1",
      ec2Instances: [{ instanceId: "i-keep", state: "running" }],
      s3Buckets: [{ name: "old-bucket" }],
    });
    const incoming: AwsInventorySlice<"s3"> = {
      providerId: "aws",
      scope: "s3",
      payload: {
        selectedS3BucketName: "new-bucket",
        s3Buckets: [{ name: "new-bucket" }],
        s3Objects: [],
        s3ObjectMetadata: [],
        s3ExportSnippets: [],
      },
    };

    const merged = mergeAwsInventoryScope(current, incoming);

    expect(merged.s3Buckets).toEqual([{ name: "new-bucket" }]);
    expect(merged.selectedS3BucketName).toBe("new-bucket");
    expect(merged.ec2Instances[0]?.instanceId).toBe("i-keep");
    expect(merged.ec2Instances[0]?.state).toBe("running");
    expect(merged.selectedEc2Region).toBe("us-east-1");
    expect(merged.azureStorageAccounts[0]?.name).toBe("keep-store");
    expect(merged.selectedAzureStorageAccount).toBe("keep-store");
    expect(merged.awsWritesEnabled).toBe(true);
  });

  it("treats empty requested-scope lists as authoritative without clearing other scopes", () => {
    const current = normaliseWorkspaceSnapshot({
      selectedLambdaRegion: "us-east-1",
      selectedLambdaFunctionName: "stale-function",
      lambdaRegions: ["us-east-1"],
      lambdaFunctions: [{ functionName: "stale-function" }],
      lambdaStatusMessage: "Loaded stale inventory.",
      ec2Regions: ["eu-west-2"],
      ec2Instances: [{ instanceId: "i-keep", state: "running" }],
    });

    const merged = mergeAwsInventoryScope(current, {
      providerId: "aws",
      scope: "lambda",
      payload: {
        lambdaRegions: [],
        lambdaFunctions: [],
        lambdaStatusMessage: "No Lambda functions found.",
      },
    });

    expect(merged.selectedLambdaRegion).toBeUndefined();
    expect(merged.selectedLambdaFunctionName).toBeUndefined();
    expect(merged.lambdaRegions).toEqual([]);
    expect(merged.lambdaFunctions).toEqual([]);
    expect(merged.lambdaStatusMessage).toBe("No Lambda functions found.");
    expect(merged.ec2Regions).toEqual(["eu-west-2"]);
    expect(merged.ec2Instances[0]?.instanceId).toBe("i-keep");
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

describe("mergeAwsDynamoDBLoadMore", () => {
  it("appends sample items for the selected table and keeps pagination tokens", () => {
    const current = normaliseWorkspaceSnapshot({
      selectedDynamodbTableName: "orders",
      dynamodbTables: [
        {
          tableName: "orders",
          sampleItems: ['{"id":"1"}'],
          sampleItemsNextToken: "token-1",
          sampleItemsHasMore: true,
        },
        {
          tableName: "sessions",
          sampleItems: ['{"sid":"a"}'],
        },
      ],
    });
    const incoming = normaliseWorkspaceSnapshot({
      selectedDynamodbTableName: "orders",
      dynamodbTables: [
        {
          tableName: "orders",
          sampleItems: ['{"id":"2"}'],
          sampleItemsNextToken: "token-2",
          sampleItemsHasMore: true,
        },
      ],
      dynamodbStatusMessage: "Loaded 1 more sample item(s) from orders. More items available.",
    });

    const merged = mergeAwsDynamoDBLoadMore(current, incoming);

    expect(merged.dynamodbTables.find((table) => table.tableName === "orders")?.sampleItems).toEqual([
      '{"id":"1"}',
      '{"id":"2"}',
    ]);
    expect(merged.dynamodbTables.find((table) => table.tableName === "orders")?.sampleItemsNextToken).toBe(
      "token-2",
    );
    expect(merged.dynamodbTables.find((table) => table.tableName === "sessions")?.sampleItems).toEqual([
      '{"sid":"a"}',
    ]);
    expect(merged.dynamodbStatusMessage).toContain("Loaded 1 more");
  });
});

describe("formatBackendError", () => {
  it("reads typed backend error payloads", () => {
    expect(
      formatBackendError({ code: "provider_timeout", message: "The provider timed out." }),
    ).toBe("The provider timed out.");
  });

  it("unwraps JSON RPC error payloads", () => {
    const message = formatBackendError(
      new Error('Backend RPC error: {"message":"Write mode is off"}'),
    );

    expect(message).toBe("Write mode is off");
  });
});
