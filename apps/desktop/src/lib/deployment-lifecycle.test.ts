// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { describe, expect, it } from "vitest";

import { deploymentHasLiveResources } from "./deployment-lifecycle";
import type { DeploymentOutput, DeploymentStatus } from "@/types/backend";

describe("deploymentHasLiveResources", () => {
  it.each([
    {
      name: "applied with no outputs",
      status: "applied" as DeploymentStatus,
      outputs: undefined,
      expected: true,
    },
    {
      name: "applied with outputs",
      status: "applied" as DeploymentStatus,
      outputs: [{ name: "bucket", value: "demo" }] satisfies DeploymentOutput[],
      expected: true,
    },
    {
      name: "cancelled with outputs",
      status: "cancelled" as DeploymentStatus,
      outputs: [{ name: "bucket", value: "demo" }] satisfies DeploymentOutput[],
      expected: true,
    },
    {
      name: "cancelled with empty outputs",
      status: "cancelled" as DeploymentStatus,
      outputs: [] satisfies DeploymentOutput[],
      expected: false,
    },
    {
      name: "cancelled with missing outputs",
      status: "cancelled" as DeploymentStatus,
      outputs: undefined,
      expected: false,
    },
    {
      name: "failed",
      status: "failed" as DeploymentStatus,
      outputs: [{ name: "bucket", value: "demo" }] satisfies DeploymentOutput[],
      expected: false,
    },
    {
      name: "planned",
      status: "planned" as DeploymentStatus,
      outputs: undefined,
      expected: false,
    },
  ])("$name", ({ status, outputs, expected }) => {
    expect(deploymentHasLiveResources({ status, outputs })).toBe(expected);
  });
});
