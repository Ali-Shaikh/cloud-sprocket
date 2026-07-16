// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import type { Status } from "@/components/status-dot";
import type { EmulatorSummary, ProfileSummary, WorkspaceSnapshot } from "@/types/backend";

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

function emulatorStartQuickAction(status?: string): "start" | undefined {
  return emulatorStatus(status) === "off" ? "start" : undefined;
}

function profileIsFlociAzure(profile?: ProfileSummary): boolean {
  if (!profile || profile.providerId !== "azure") {
    return false;
  }
  return profile.attributes.some(
    (field) => field.label === "Tenant ID" && field.value === "cloudsprocket-local",
  );
}

function azureEndpointLooksLocal(endpoint?: string): boolean {
  const value = (endpoint ?? "").trim().toLowerCase();
  if (!value) {
    return false;
  }
  return (
    value.includes("localhost") ||
    value.includes("127.0.0.1") ||
    value.includes("[::1]")
  );
}

/**
 * True when the locked workspace is aimed at a local emulator, not a real
 * cloud account. Real cloud overviews should not surface Docker/emulator noise.
 */
export function workspaceUsesLocalEmulator(workspace: WorkspaceSnapshot): boolean {
  const providerId = workspace.provider?.providerId;
  if (providerId === "aws") {
    return workspace.awsWriteTargetIsLocal === true;
  }
  if (providerId === "azure") {
    return profileIsFlociAzure(workspace.profile) || azureEndpointLooksLocal(workspace.azureEndpointUrl);
  }
  return false;
}

/** Local-runtime strip only on local-emulator workspaces (never real cloud). */
export function shouldShowRuntimeHealthStrip(workspace: WorkspaceSnapshot): boolean {
  return workspaceUsesLocalEmulator(workspace);
}

/**
 * Health targets for the locked local workspace only: Docker + the emulator
 * that matches the provider (LocalStack for AWS, floci-az for Azure).
 */
export function buildRuntimeHealthTargets(
  workspace: WorkspaceSnapshot,
): RuntimeHealthTarget[] {
  if (!shouldShowRuntimeHealthStrip(workspace)) {
    return [];
  }

  const targets: RuntimeHealthTarget[] = [
    {
      id: "docker",
      label: "Docker",
      status: workspace.dockerRuntime.reachable ? "on" : "off",
      statusLabel: workspace.dockerRuntime.reachable ? "Reachable" : "Unreachable",
      summary: workspace.dockerRuntime.summary || workspace.dockerDiagnostics.summary,
    },
  ];

  const providerId = workspace.provider?.providerId;
  if (providerId === "aws") {
    const localStack = emulatorById(workspace.emulatorSummaries, "localstack");
    if (localStack) {
      targets.push({
        id: "localstack",
        label: "LocalStack",
        providerId: "aws",
        status: emulatorStatus(localStack.status),
        statusLabel: localStack.status,
        summary: localStack.summary,
        quickAction: emulatorStartQuickAction(localStack.status),
      });
    }
  } else if (providerId === "azure") {
    const flociAz = emulatorById(workspace.emulatorSummaries, "floci-az");
    if (flociAz) {
      targets.push({
        id: "floci-az",
        label: "floci-az",
        providerId: "azure",
        status: emulatorStatus(flociAz.status),
        statusLabel: flociAz.status,
        summary: flociAz.summary,
        quickAction: emulatorStartQuickAction(flociAz.status),
      });
    }
  }

  return targets;
}
