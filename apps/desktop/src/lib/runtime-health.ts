// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import type { Status } from "@/components/status-dot";
import type { EmulatorSummary, WorkspaceSnapshot } from "@/types/backend";

export type RuntimeHealthTargetId = "docker" | "localstack" | "floci-az";

export type RuntimeHealthTarget = {
  id: RuntimeHealthTargetId;
  label: string;
  providerId?: string;
  status: Status;
  statusLabel: string;
  summary: string;
  /** When set, a Start quick action is offered for stopped emulators. */
  quickAction?: "start";
};

function emulatorStatus(value?: string): Status {
  if (value === "running") {
    return "on";
  }
  if (value === "unhealthy") {
    return "error";
  }
  if (value === "not-configured") {
    return "warning";
  }
  return "off";
}

function emulatorById(
  emulators: EmulatorSummary[],
  emulatorId: string,
): EmulatorSummary | undefined {
  return emulators.find((emulator) => emulator.emulatorId === emulatorId);
}

export function buildRuntimeHealthTargets(
  workspace: WorkspaceSnapshot,
): RuntimeHealthTarget[] {
  const targets: RuntimeHealthTarget[] = [
    {
      id: "docker",
      label: "Docker",
      status: workspace.dockerRuntime.reachable ? "on" : "off",
      statusLabel: workspace.dockerRuntime.reachable ? "Reachable" : "Unreachable",
      summary: workspace.dockerRuntime.summary || workspace.dockerDiagnostics.summary,
    },
  ];

  const localStack = emulatorById(workspace.emulatorSummaries, "localstack");
  if (localStack) {
    const running = localStack.status === "running";
    targets.push({
      id: "localstack",
      label: "LocalStack",
      providerId: "aws",
      status: emulatorStatus(localStack.status),
      statusLabel: localStack.status,
      summary: localStack.summary,
      quickAction: running ? undefined : "start",
    });
  }

  const flociAz = emulatorById(workspace.emulatorSummaries, "floci-az");
  if (flociAz) {
    const running = flociAz.status === "running";
    targets.push({
      id: "floci-az",
      label: "floci-az",
      providerId: "azure",
      status: emulatorStatus(flociAz.status),
      statusLabel: flociAz.status,
      summary: flociAz.summary,
      quickAction: running ? undefined : "start",
    });
  }

  return targets;
}