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