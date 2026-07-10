// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { describe, expect, it } from "vitest";

import {
  appendDeploymentLogLine,
  clearDeploymentLogs,
  DEPLOY_LOG_LINE_CAP,
  deploymentLogTruncated,
  type DeploymentLogMap,
} from "./deploy-log-state";

describe("deploy-log-state", () => {
  it("appends a line for the deployment id", () => {
    const next = appendDeploymentLogLine({}, "dep-1", "planning");
    expect(next["dep-1"]).toEqual(["planning"]);
  });

  it("caps retained lines at DEPLOY_LOG_LINE_CAP", () => {
    let logs: DeploymentLogMap = {};
    for (let index = 0; index < DEPLOY_LOG_LINE_CAP + 25; index += 1) {
      logs = appendDeploymentLogLine(logs, "dep-1", `line-${index}`);
    }
    expect(logs["dep-1"]).toHaveLength(DEPLOY_LOG_LINE_CAP);
    expect(logs["dep-1"]![0]).toBe("line-25");
    expect(logs["dep-1"]!.at(-1)).toBe(`line-${DEPLOY_LOG_LINE_CAP + 24}`);
  });

  it("clears logs for one deployment without touching others", () => {
    const cleared = clearDeploymentLogs({ "dep-1": ["a"], "dep-2": ["b"] }, "dep-1");
    expect(cleared["dep-1"]).toEqual([]);
    expect(cleared["dep-2"]).toEqual(["b"]);
  });

  it("reports truncation at the cap", () => {
    expect(deploymentLogTruncated(DEPLOY_LOG_LINE_CAP - 1)).toBe(false);
    expect(deploymentLogTruncated(DEPLOY_LOG_LINE_CAP)).toBe(true);
  });
});