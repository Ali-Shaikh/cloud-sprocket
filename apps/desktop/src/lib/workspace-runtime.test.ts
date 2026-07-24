// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { beforeEach, describe, expect, it, vi } from "vitest";

import { backendRequest } from "@/lib/backend";
import { fetchEmulatorLogs, fetchVirtualisationStatus } from "@/lib/workspace-runtime";

vi.mock("@/lib/backend", () => ({
  backendRequest: vi.fn(),
}));

describe("fetchVirtualisationStatus", () => {
  beforeEach(() => {
    vi.mocked(backendRequest).mockReset();
  });

  it("loads runtime.get only without emulator log tails", async () => {
    vi.mocked(backendRequest).mockImplementation(async (method: string) => {
      if (method === "runtime.get") {
        return {
          dockerRuntime: { reachable: true },
          dockerResources: [],
          emulatorSummaries: [{ emulatorId: "localstack", status: "running", summary: "ok" }],
          dockerDiagnostics: [],
        };
      }
      throw new Error(`unexpected method ${method}`);
    });

    const result = await fetchVirtualisationStatus();

    expect(result.dockerRuntime).toEqual({ reachable: true });
    expect(result.emulatorSummaries).toHaveLength(1);
    expect(vi.mocked(backendRequest)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(backendRequest)).toHaveBeenCalledWith("runtime.get");
  });
});

describe("fetchEmulatorLogs", () => {
  beforeEach(() => {
    vi.mocked(backendRequest).mockReset();
  });

  it("returns log lines for a successful tail request", async () => {
    vi.mocked(backendRequest).mockResolvedValue({
      emulatorId: "localstack",
      lines: ["line"],
      summary: "loaded",
    });

    const result = await fetchEmulatorLogs("localstack");

    expect(result.lines).toEqual(["line"]);
    expect(vi.mocked(backendRequest)).toHaveBeenCalledWith("emulators.logs", {
      emulatorId: "localstack",
      tail: 200,
    });
  });

  it("propagates failures so callers can keep previously loaded lines", async () => {
    vi.mocked(backendRequest).mockRejectedValue(new Error("floci logs unavailable"));

    await expect(fetchEmulatorLogs("floci-az")).rejects.toThrow("floci logs unavailable");
  });
});
