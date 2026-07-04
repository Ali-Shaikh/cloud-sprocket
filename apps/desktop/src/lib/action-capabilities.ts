// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import type { ActionCapability, WorkspaceSnapshot } from "@/types/backend";

export type ActionCapabilityMap = Record<string, ActionCapability[]>;
export type WriteProvider = "aws" | "azure";

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
  const capability = findActionCapability(workspace.actionCapabilities, service, actionId);
  if (capability) {
    return {
      enabled: capability.enabled,
      reason: capability.enabled ? undefined : capability.reason,
    };
  }
  const fallback =
    provider === "azure" ? workspace.azureWritesEnabled : workspace.awsWritesEnabled;
  const defaultReason =
    provider === "azure"
      ? "Mutating actions require write mode on a profile that supports Azure writes."
      : "Mutating actions require write mode on a local endpoint profile.";
  return {
    enabled: Boolean(fallback),
    reason: fallback ? undefined : defaultReason,
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