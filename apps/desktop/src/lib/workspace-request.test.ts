// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { beforeEach, describe, expect, it, vi } from "vitest";

import { requestWorkspaceSnapshot } from "./workspace-request";

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
});