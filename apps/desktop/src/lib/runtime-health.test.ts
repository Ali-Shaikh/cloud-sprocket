// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { describe, expect, it } from "vitest";

import {
  buildRuntimeHealthTargets,
  shouldShowRuntimeHealthStrip,
  workspaceUsesLocalEmulator,
} from "./runtime-health";
import type { WorkspaceSnapshot } from "@/types/backend";

function baseWorkspace(): WorkspaceSnapshot {
  return {
    provider: { providerId: "aws", label: "AWS", state: "configured", summary: "", profileCount: 1, locations: [] },
    profile: {
      providerId: "aws",
      profileId: "localstack",
      displayName: "LocalStack",
      summary: "local",
      sourcePaths: [],
      attributes: [],
      authMethods: [],
    },
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
    awsWriteCapable: true,
    awsWriteTargetIsLocal: true,
    azureWriteCapable: false,
  } as unknown as WorkspaceSnapshot;
}

describe("buildRuntimeHealthTargets", () => {
  it("shows Docker + LocalStack only for a local AWS workspace", () => {
    const targets = buildRuntimeHealthTargets(baseWorkspace());
    expect(targets.map((target) => target.id)).toEqual(["docker", "localstack"]);
  });

  it("shows Docker + floci-az only for a local Azure workspace", () => {
    const workspace = baseWorkspace();
    workspace.provider = {
      providerId: "azure",
      label: "Azure",
      state: "configured",
      summary: "",
      profileCount: 1,
      locations: [],
    };
    workspace.profile = {
      providerId: "azure",
      profileId: "floci",
      displayName: "floci-az",
      summary: "local",
      sourcePaths: [],
      attributes: [{ label: "Tenant ID", value: "cloudsprocket-local" }],
      authMethods: [],
    };
    workspace.awsWriteTargetIsLocal = false;
    workspace.azureWriteCapable = true;
    const targets = buildRuntimeHealthTargets(workspace);
    expect(targets.map((target) => target.id)).toEqual(["docker", "floci-az"]);
  });

  it("offers start quick action only for stopped emulators", () => {
    const targets = buildRuntimeHealthTargets(baseWorkspace());
    expect(targets.find((target) => target.id === "localstack")?.quickAction).toBe("start");
  });

  it("marks Docker unreachable when the engine is down", () => {
    const workspace = baseWorkspace();
    workspace.dockerRuntime.reachable = false;
    workspace.dockerRuntime.summary = "Docker is not reachable.";
    const docker = buildRuntimeHealthTargets(workspace).find((target) => target.id === "docker");
    expect(docker?.status).toBe("off");
    expect(docker?.statusLabel).toBe("Unreachable");
  });

  it("offers start only for stopped emulators, not unhealthy or not-configured", () => {
    const workspace = baseWorkspace();
    workspace.emulatorSummaries = [
      {
        emulatorId: "localstack",
        providerId: "aws",
        label: "LocalStack",
        kind: "docker",
        status: "unhealthy",
        summary: "Container running but failing health checks.",
        details: [],
      },
    ];
    const targets = buildRuntimeHealthTargets(workspace);
    expect(targets.find((target) => target.id === "localstack")?.quickAction).toBeUndefined();
  });

  it("hides the strip for real cloud AWS profiles", () => {
    const workspace = baseWorkspace();
    workspace.awsWriteTargetIsLocal = false;
    workspace.awsWriteCapable = true;
    expect(workspaceUsesLocalEmulator(workspace)).toBe(false);
    expect(shouldShowRuntimeHealthStrip(workspace)).toBe(false);
    expect(buildRuntimeHealthTargets(workspace)).toEqual([]);
  });

  it("hides the strip for real cloud Azure profiles", () => {
    const workspace = baseWorkspace();
    workspace.provider = {
      providerId: "azure",
      label: "Azure",
      state: "configured",
      summary: "",
      profileCount: 1,
      locations: [],
    };
    workspace.profile = {
      providerId: "azure",
      profileId: "prod",
      displayName: "Production",
      summary: "cloud",
      sourcePaths: [],
      attributes: [{ label: "Tenant ID", value: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" }],
      authMethods: [],
    };
    workspace.awsWriteTargetIsLocal = false;
    workspace.azureWriteCapable = true;
    workspace.azureEndpointUrl = undefined;
    expect(shouldShowRuntimeHealthStrip(workspace)).toBe(false);
    expect(buildRuntimeHealthTargets(workspace)).toEqual([]);
  });
});
