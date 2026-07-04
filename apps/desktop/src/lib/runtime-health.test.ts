// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { describe, expect, it } from "vitest";

import { buildRuntimeHealthTargets } from "./runtime-health";
import type { WorkspaceSnapshot } from "@/types/backend";

function baseWorkspace(): WorkspaceSnapshot {
  return {
    dockerRuntime: {
      reachable: true,
      summary: "Docker is reachable.",
      resourceOwnership: "app-managed",
      details: [],
    },
    dockerDiagnostics: {
      engineState: "available",
      summary: "Docker engine available.",
      details: [],
    },
    emulatorSummaries: [
      {
        emulatorId: "localstack",
        providerId: "aws",
        label: "LocalStack",
        kind: "docker",
        status: "stopped",
        summary: "LocalStack is stopped.",
        details: [],
      },
      {
        emulatorId: "floci-az",
        providerId: "azure",
        label: "floci-az",
        kind: "docker",
        status: "running",
        summary: "floci-az is running.",
        details: [],
      },
    ],
  } as WorkspaceSnapshot;
}

describe("buildRuntimeHealthTargets", () => {
  it("includes Docker, LocalStack, and floci-az targets", () => {
    const targets = buildRuntimeHealthTargets(baseWorkspace());
    expect(targets.map((target) => target.id)).toEqual(["docker", "localstack", "floci-az"]);
  });

  it("offers start quick action only for stopped emulators", () => {
    const targets = buildRuntimeHealthTargets(baseWorkspace());
    expect(targets.find((target) => target.id === "localstack")?.quickAction).toBe("start");
    expect(targets.find((target) => target.id === "floci-az")?.quickAction).toBeUndefined();
  });

  it("marks Docker unreachable when the engine is down", () => {
    const workspace = baseWorkspace();
    workspace.dockerRuntime.reachable = false;
    workspace.dockerRuntime.summary = "Docker is not reachable.";
    const docker = buildRuntimeHealthTargets(workspace).find((target) => target.id === "docker");
    expect(docker?.status).toBe("off");
    expect(docker?.statusLabel).toBe("Unreachable");
  });
});