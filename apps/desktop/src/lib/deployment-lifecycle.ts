// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import type { Deployment } from "@/types/backend";

/**
 * True when the record still owns (or likely owns) live infrastructure.
 * Applied runs always do. Cancelled or failed runs only when outputs were recorded.
 */
export function deploymentHasLiveResources(
  deployment: Pick<Deployment, "status" | "outputs">,
): boolean {
  if (deployment.status === "applied") {
    return true;
  }
  if (
    (deployment.status === "cancelled" || deployment.status === "failed") &&
    (deployment.outputs?.length ?? 0) > 0
  ) {
    return true;
  }
  return false;
}
