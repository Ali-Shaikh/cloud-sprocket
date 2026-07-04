// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { beforeEach, describe, expect, it, vi } from "vitest";

import { backendRequest } from "@/lib/backend";
import { fetchVirtualisationSnapshot } from "@/lib/workspace-runtime";

vi.mock("@/lib/backend", () => ({
  backendRequest: vi.fn(),
}));

describe("fetchVirtualisationSnapshot", () => {
  beforeEach(() => {
    vi.mocked(backendRequest).mockReset();
  });

  it("merges runtime.get with emulator log snapshots", async () => {
    vi.mocked(backendRequest).mockImplementation(async (method: string, params?: { emulatorId?: string }) => {
      if (method === "runtime.get") {
        return {
          dockerRuntime: { reachable: true },
          dockerResources: [],
          emulatorSummaries: [{ emulatorId: "localstack", status: "running", summary: "ok" }],
          dockerDiagnostics: [],
        };
      }
      if (method === "emulators.logs" && params?.emulatorId === "localstack") {
        return { emulatorId: "localstack", lines: ["line"], summary: "loaded" };
      }
      if (method === "emulators.logs" && params?.emulatorId === "floci-az") {
        throw new Error("floci logs unavailable");
      }
      throw new Error(`unexpected method ${method}`);
    });

    const result = await fetchVirtualisationSnapshot();

    expect(result.dockerRuntime).toEqual({ reachable: true });
    expect(result.localStackLogs.lines).toEqual(["line"]);
    expect(result.flociAzLogs.summary).toContain("floci logs unavailable");
    expect(vi.mocked(backendRequest)).toHaveBeenCalledWith("runtime.get");
  });
});