// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import type { WorkspaceSnapshot } from "@/types/backend";

export function awsWriteTargetSummary(workspace: WorkspaceSnapshot): string {
  if (workspace.awsWriteTargetIsLocal === true) {
    return workspace.awsEndpointUrl || "local endpoint";
  }
  return workspace.awsEndpointUrl || "live AWS account";
}

export function awsWriteEnableDialogIntent(
  workspace: WorkspaceSnapshot,
): "enable-local" | "enable-cloud" {
  return workspace.awsWriteTargetIsLocal === true ? "enable-local" : "enable-cloud";
}

/** True when the locked Azure workspace targets floci-az / a local emulator endpoint. */
export function azureWriteTargetIsLocal(workspace: WorkspaceSnapshot): boolean {
  const endpoint = (workspace.azureEndpointUrl ?? "").trim().toLowerCase();
  if (
    endpoint.includes("localhost") ||
    endpoint.includes("127.0.0.1") ||
    endpoint.includes("[::1]")
  ) {
    return true;
  }
  const profile = workspace.profile;
  if (!profile || profile.providerId !== "azure") {
    return false;
  }
  return profile.attributes.some(
    (field) => field.label === "Tenant ID" && field.value === "cloudsprocket-local",
  );
}

export function azureWriteEnableDialogIntent(
  workspace: WorkspaceSnapshot,
): "enable-local" | "enable-cloud" {
  return azureWriteTargetIsLocal(workspace) ? "enable-local" : "enable-cloud";
}

export function azureWriteTargetSummary(workspace: WorkspaceSnapshot): string {
  if (azureWriteTargetIsLocal(workspace)) {
    return workspace.azureEndpointUrl || "local Azure emulator";
  }
  return workspace.azureEndpointUrl || "live Azure subscription (Azure CLI)";
}