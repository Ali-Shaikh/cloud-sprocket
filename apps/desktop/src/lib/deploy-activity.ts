// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import type { Deployment, DeploymentStatus } from "@/types/backend";
import type { Status } from "@/components/status-dot";

export const IN_FLIGHT_DEPLOY_STATUSES: readonly DeploymentStatus[] = [
  "pending",
  "planning",
  "applying",
  "destroying",
] as const;

export function isInFlightDeploymentStatus(status: DeploymentStatus): boolean {
  return (IN_FLIGHT_DEPLOY_STATUSES as readonly string[]).includes(status);
}

export function countInFlightDeployments(deployments: readonly Deployment[]): number {
  return deployments.filter((deployment) => isInFlightDeploymentStatus(deployment.status)).length;
}

export function hasFailedDeployments(deployments: readonly Deployment[]): boolean {
  return deployments.some((deployment) => deployment.status === "failed");
}

export type DeployRailBadge = {
  /** Short label for the corner badge (count or "!"). */
  text: string;
  status: Status;
  tooltip: string;
};

/**
 * Derive the Deploy rail corner badge from the current deployment list.
 * Progress takes priority over failure so an active job is always visible.
 */
export function deployRailBadge(
  deployments: readonly Deployment[],
): DeployRailBadge | null {
  const inFlight = countInFlightDeployments(deployments);
  if (inFlight > 0) {
    return {
      text: inFlight > 9 ? "9+" : String(inFlight),
      status: "warning",
      tooltip:
        inFlight === 1
          ? "Deploy · 1 job in progress"
          : `Deploy · ${inFlight} jobs in progress`,
    };
  }
  if (hasFailedDeployments(deployments)) {
    const failed = deployments.filter((deployment) => deployment.status === "failed").length;
    return {
      text: failed > 9 ? "9+" : String(failed),
      status: "error",
      tooltip:
        failed === 1
          ? "Deploy · 1 failed job"
          : `Deploy · ${failed} failed jobs`,
    };
  }
  return null;
}
