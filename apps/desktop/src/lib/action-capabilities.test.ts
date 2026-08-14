// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { describe, expect, it } from "vitest";

import {
  actionCapabilityState,
  CAPABILITY_REASON_PROFILE_WRITES_UNSUPPORTED,
  CAPABILITY_REASON_WRITE_MODE_REQUIRED,
  isWriteModeCapability,
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

  it("falls back to gcpWritesEnabled for GCP actions", () => {
    const workspace = {
      gcpWritesEnabled: false,
    } as unknown as WorkspaceSnapshot;

    expect(actionCapabilityState(workspace, "functions", "invoke", "gcp")).toEqual({
      enabled: false,
      reason: "Mutating actions require write mode to be enabled for this GCP workspace.",
    });
  });

  it("enables GCP write-mode capabilities when gcpWritesEnabled is true", () => {
    const workspace = {
      actionCapabilities: {
        storage: [
          {
            actionId: "uploadObject",
            label: "Upload object",
            enabled: false,
            reason: WRITE_MODE_REQUIRED_REASON,
          },
        ],
      },
      gcpWritesEnabled: true,
    } as unknown as WorkspaceSnapshot;

    expect(actionCapabilityState(workspace, "storage", "uploadObject", "gcp")).toEqual({
      enabled: true,
      reason: undefined,
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
          reasonCode: undefined,
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
          reasonCode: CAPABILITY_REASON_WRITE_MODE_REQUIRED,
        },
      ],
    });
  });

  it("re-enables GCP capabilities gated only by write mode", () => {
    const capabilities = {
      compute: [
        {
          actionId: "startInstance",
          label: "Start instance",
          enabled: false,
          reason: WRITE_MODE_REQUIRED_REASON,
        },
      ],
    };

    expect(syncActionCapabilitiesForWriteMode(capabilities, "gcp", true)).toEqual({
      compute: [
        {
          actionId: "startInstance",
          label: "Start instance",
          enabled: true,
          reason: undefined,
          reasonCode: undefined,
        },
      ],
    });
  });

  it("leaves profile-unsupported Azure capabilities disabled when write mode turns on", () => {
    const capabilities = {
      compute: [
        {
          actionId: "startVm",
          label: "Start VM",
          enabled: false,
          reason: "This profile does not support write mode.",
          reasonCode: CAPABILITY_REASON_PROFILE_WRITES_UNSUPPORTED,
        },
      ],
    };

    expect(syncActionCapabilitiesForWriteMode(capabilities, "azure", true)).toEqual(capabilities);
  });
});

describe("isWriteModeCapability", () => {
  it("matches reasonCode even when the prose changes", () => {
    expect(
      isWriteModeCapability({
        reason: "Enable writes first",
        reasonCode: CAPABILITY_REASON_WRITE_MODE_REQUIRED,
      }),
    ).toBe(true);
  });

  it("does not treat a different reasonCode as write mode", () => {
    expect(
      isWriteModeCapability({
        reason: "Turn on write mode from the top bar to run mutating actions.",
        reasonCode: CAPABILITY_REASON_PROFILE_WRITES_UNSUPPORTED,
      }),
    ).toBe(false);
  });

  it("falls back to historical English reasons when reasonCode is absent", () => {
    expect(isWriteModeCapability({ reason: WRITE_MODE_REQUIRED_REASON })).toBe(true);
    expect(
      isWriteModeCapability({
        reason: "Mutating actions require write mode to be enabled.",
      }),
    ).toBe(true);
    expect(isWriteModeCapability({ reason: "Select a profile first." })).toBe(false);
  });
});