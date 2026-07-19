// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { describe, expect, it } from "vitest";

import {
  countInFlightDeployments,
  deployRailBadge,
  isInFlightDeploymentStatus,
} from "./deploy-activity";
import type { Deployment } from "@/types/backend";

function deployment(status: Deployment["status"], id = "d1"): Deployment {
  return {
    id,
    recipeId: "static-site-aws",
    name: id,
    providerId: "aws",
    status,
    createdAt: "",
    updatedAt: "",
    variables: {},
    local: true,
  } as Deployment;
}

describe("deploy activity", () => {
  it("detects in-flight statuses", () => {
    expect(isInFlightDeploymentStatus("applying")).toBe(true);
    expect(isInFlightDeploymentStatus("applied")).toBe(false);
    expect(countInFlightDeployments([deployment("planning"), deployment("failed", "d2")])).toBe(1);
  });

  it("prefers progress badge over failure", () => {
    const badge = deployRailBadge([deployment("applying"), deployment("failed", "d2")]);
    expect(badge?.status).toBe("warning");
    expect(badge?.text).toBe("1");
  });

  it("shows failure badge when nothing is running", () => {
    const badge = deployRailBadge([deployment("failed"), deployment("applied", "d2")]);
    expect(badge?.status).toBe("error");
    expect(badge?.text).toBe("1");
  });

  it("returns null when quiet", () => {
    expect(deployRailBadge([deployment("applied")])).toBeNull();
    expect(deployRailBadge([])).toBeNull();
  });
});
