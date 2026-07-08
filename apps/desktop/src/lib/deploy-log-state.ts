// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

/** Maximum log lines retained per deployment in UI state. */
export const DEPLOY_LOG_LINE_CAP = 5_000;

export type DeploymentLogMap = Record<string, string[]>;

export function appendDeploymentLogLine(
  current: DeploymentLogMap,
  deploymentId: string,
  line: string,
): DeploymentLogMap {
  const previous = current[deploymentId] ?? [];
  const next = [...previous, line];
  const trimmed =
    next.length > DEPLOY_LOG_LINE_CAP ? next.slice(next.length - DEPLOY_LOG_LINE_CAP) : next;
  return { ...current, [deploymentId]: trimmed };
}

export function clearDeploymentLogs(current: DeploymentLogMap, deploymentId: string): DeploymentLogMap {
  return { ...current, [deploymentId]: [] };
}

export function deploymentLogTruncated(lineCount: number): boolean {
  return lineCount >= DEPLOY_LOG_LINE_CAP;
}