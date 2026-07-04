// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { describe, expect, it } from "vitest";

import { actionCapabilityState } from "./action-capabilities";
import type { WorkspaceSnapshot } from "@/types/backend";

describe("actionCapabilityState", () => {
  it("returns capability metadata when present", () => {
    const workspace = {
      actionCapabilities: {
        lambda: [
          {
            actionId: "invoke",
            label: "Invoke function",
            enabled: false,
            reason: "Turn on write mode from the top bar to run mutating actions.",
          },
        ],
      },
      awsWritesEnabled: false,
    } as unknown as WorkspaceSnapshot;

    expect(actionCapabilityState(workspace, "lambda", "invoke")).toEqual({
      enabled: false,
      reason: "Turn on write mode from the top bar to run mutating actions.",
    });
  });

  it("falls back to awsWritesEnabled when capabilities are missing", () => {
    const workspace = {
      awsWritesEnabled: true,
    } as unknown as WorkspaceSnapshot;

    expect(actionCapabilityState(workspace, "lambda", "invoke")).toEqual({
      enabled: true,
      reason: undefined,
    });
  });

  it("falls back to azureWritesEnabled for Azure actions", () => {
    const workspace = {
      azureWritesEnabled: false,
    } as unknown as WorkspaceSnapshot;

    expect(actionCapabilityState(workspace, "functions", "invoke", "azure")).toEqual({
      enabled: false,
      reason: "Mutating actions require write mode on a profile that supports Azure writes.",
    });
  });
});