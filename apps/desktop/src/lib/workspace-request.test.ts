// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  requestAwsInventorySlice,
  requestWorkspaceSnapshot,
} from "./workspace-request";

vi.mock("./backend", () => ({
  backendRequest: vi.fn(),
}));

import { backendRequest } from "./backend";

describe("requestWorkspaceSnapshot", () => {
  beforeEach(() => {
    vi.mocked(backendRequest).mockReset();
  });

  it("normalises workspace RPC responses at the IPC boundary", async () => {
    vi.mocked(backendRequest).mockResolvedValue({
      s3Buckets: [{ name: "demo-bucket" }],
    });

    const workspace = await requestWorkspaceSnapshot("workspace.get");

    expect(backendRequest).toHaveBeenCalledWith("workspace.get", {});
    expect(workspace.s3Buckets).toEqual([{ name: "demo-bucket" }]);
    expect(workspace.ec2Instances).toEqual([]);
    expect(workspace.actionCapabilities).toEqual({});
  });

  it("requests an AWS-only inventory slice without widening it to a workspace", async () => {
    vi.mocked(backendRequest).mockResolvedValue({
      providerId: "aws",
      scope: "lambda",
      payload: {
        selectedLambdaRegion: "us-east-1",
        lambdaStatusMessage: "Loaded 1 Lambda function.",
        lambdaRegions: ["us-east-1"],
        lambdaFunctions: [{ functionName: "process-order" }],
      },
    });

    const slice = await requestAwsInventorySlice("lambda");

    expect(backendRequest).toHaveBeenCalledWith("aws.inventory.get", {
      scope: "lambda",
    });
    expect(slice).toEqual({
      providerId: "aws",
      scope: "lambda",
      payload: {
        selectedLambdaRegion: "us-east-1",
        lambdaStatusMessage: "Loaded 1 Lambda function.",
        lambdaRegions: ["us-east-1"],
        lambdaFunctions: [{ functionName: "process-order" }],
      },
    });
    expect(slice.payload).not.toHaveProperty("runtimeSettings");
    expect(slice.payload).not.toHaveProperty("azureResourceGroups");
  });

  it("rejects an AWS inventory response for a different scope", async () => {
    vi.mocked(backendRequest).mockResolvedValue({
      providerId: "aws",
      scope: "ec2",
      payload: {
        ec2Regions: [],
        ec2Instances: [],
      },
    });

    await expect(requestAwsInventorySlice("lambda")).rejects.toThrow(
      "Unexpected AWS inventory response for scope lambda.",
    );
  });

  it("rejects a matching AWS scope when a required collection is missing", async () => {
    vi.mocked(backendRequest).mockResolvedValue({
      providerId: "aws",
      scope: "lambda",
      payload: {
        lambdaRegions: ["us-east-1"],
      },
    });

    await expect(requestAwsInventorySlice("lambda")).rejects.toThrow(
      "Unexpected AWS inventory response for scope lambda.",
    );
  });
});
