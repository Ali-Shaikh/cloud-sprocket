// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { describe, expect, it } from "vitest";

import {
  actionCapabilityState,
  syncActionCapabilitiesForWriteMode,
  WRITE_MODE_REQUIRED_REASON,
} from "./action-capabilities";
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

  it("enables stale write-mode capabilities when awsWritesEnabled is true", () => {
    const workspace = {
      actionCapabilities: {
        s3: [
          {
            actionId: "deleteObject",
            label: "Delete object",
            enabled: false,
            reason: WRITE_MODE_REQUIRED_REASON,
          },
        ],
      },
      awsWritesEnabled: true,
    } as unknown as WorkspaceSnapshot;

    expect(actionCapabilityState(workspace, "s3", "deleteObject")).toEqual({
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

describe("syncActionCapabilitiesForWriteMode", () => {
  it("re-enables AWS capabilities gated only by write mode", () => {
    const capabilities = {
      s3: [
        {
          actionId: "deleteObject",
          label: "Delete object",
          enabled: false,
          reason: WRITE_MODE_REQUIRED_REASON,
        },
      ],
    };

    expect(syncActionCapabilitiesForWriteMode(capabilities, "aws", true)).toEqual({
      s3: [
        {
          actionId: "deleteObject",
          label: "Delete object",
          enabled: true,
          reason: undefined,
        },
      ],
    });
  });

  it("disables AWS capabilities when write mode is turned off", () => {
    const capabilities = {
      s3: [
        {
          actionId: "deleteObject",
          label: "Delete object",
          enabled: true,
        },
      ],
    };

    expect(syncActionCapabilitiesForWriteMode(capabilities, "aws", false)).toEqual({
      s3: [
        {
          actionId: "deleteObject",
          label: "Delete object",
          enabled: false,
          reason: WRITE_MODE_REQUIRED_REASON,
        },
      ],
    });
  });
});