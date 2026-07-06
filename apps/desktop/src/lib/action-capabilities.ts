// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import type { ActionCapability, WorkspaceSnapshot } from "@/types/backend";

export type ActionCapabilityMap = Record<string, ActionCapability[]>;
export type WriteProvider = "aws" | "azure";

export const WRITE_MODE_REQUIRED_REASON =
  "Turn on write mode from the top bar to run mutating actions.";

const AWS_WRITE_MODE_FALLBACK_REASON = "Mutating actions require write mode to be enabled.";
const AZURE_WRITE_MODE_FALLBACK_REASON =
  "Mutating actions require write mode on a profile that supports Azure writes.";

export function isWriteModeCapabilityReason(reason: string | undefined): boolean {
  if (!reason) {
    return false;
  }
  const normalised = reason.toLowerCase();
  return (
    reason === WRITE_MODE_REQUIRED_REASON ||
    normalised.includes("turn on write mode") ||
    normalised.includes("write mode must be enabled") ||
    normalised.includes("require write mode")
  );
}

export function syncActionCapabilitiesForWriteMode(
  capabilities: ActionCapabilityMap | undefined,
  provider: WriteProvider,
  writesEnabled: boolean,
): ActionCapabilityMap {
  const source = capabilities ?? {};
  const synced: ActionCapabilityMap = {};

  for (const [service, caps] of Object.entries(source)) {
    synced[service] = caps.map((capability) => {
      if (writesEnabled) {
        if (!capability.enabled && isWriteModeCapabilityReason(capability.reason)) {
          return { ...capability, enabled: true, reason: undefined };
        }
        return capability;
      }

      if (provider === "aws") {
        return {
          ...capability,
          enabled: false,
          reason: capability.reason || WRITE_MODE_REQUIRED_REASON,
        };
      }

      if (capability.enabled || isWriteModeCapabilityReason(capability.reason)) {
        return {
          ...capability,
          enabled: false,
          reason: WRITE_MODE_REQUIRED_REASON,
        };
      }
      return capability;
    });
  }

  return synced;
}

export function findActionCapability(
  capabilities: ActionCapabilityMap | undefined,
  service: string,
  actionId: string,
): ActionCapability | undefined {
  return capabilities?.[service]?.find((capability) => capability.actionId === actionId);
}

export function actionCapabilityState(
  workspace: WorkspaceSnapshot,
  service: string,
  actionId: string,
  provider: WriteProvider = "aws",
): { enabled: boolean; reason?: string } {
  const writesEnabled =
    provider === "azure" ? workspace.azureWritesEnabled : workspace.awsWritesEnabled;
  const capability = findActionCapability(workspace.actionCapabilities, service, actionId);
  if (capability) {
    if (writesEnabled && !capability.enabled && isWriteModeCapabilityReason(capability.reason)) {
      return { enabled: true, reason: undefined };
    }
    if (!writesEnabled && capability.enabled && provider === "aws") {
      return {
        enabled: false,
        reason: capability.reason || WRITE_MODE_REQUIRED_REASON,
      };
    }
    return {
      enabled: capability.enabled,
      reason: capability.enabled ? undefined : capability.reason,
    };
  }
  const defaultReason =
    provider === "azure" ? AZURE_WRITE_MODE_FALLBACK_REASON : AWS_WRITE_MODE_FALLBACK_REASON;
  return {
    enabled: Boolean(writesEnabled),
    reason: writesEnabled ? undefined : defaultReason,
  };
}

export function actionDisabledReason(
  workspace: WorkspaceSnapshot,
  service: string,
  actionId: string,
  extraRequirement?: string,
  provider: WriteProvider = "aws",
): string | undefined {
  const state = actionCapabilityState(workspace, service, actionId, provider);
  if (!state.enabled) {
    return state.reason;
  }
  if (extraRequirement) {
    return extraRequirement;
  }
  return undefined;
}