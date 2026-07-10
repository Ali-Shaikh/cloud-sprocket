// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import type { Deployment } from "@/types/backend";

import { runtimeDisplayName } from "@/lib/deploy-runtime-labels";

export const CONNECT_LOCAL_RUNTIME_SUBTITLE = "AWS and Azure local runtimes";

const RUNTIME_PROVIDER: Record<string, "aws" | "azure" | "neutral"> = {
  localstack: "aws",
  "floci-az": "azure",
  "docker-compose": "neutral",
  "magento-compose": "neutral",
};

export function localRuntimeProvider(runtimeId?: string): "aws" | "azure" | "neutral" {
  const id = (runtimeId ?? "localstack").trim() || "localstack";
  return RUNTIME_PROVIDER[id] ?? "neutral";
}

export function formatLocalTargetLabel(runtimeId?: string, requiresPro?: boolean): string {
  const engine = runtimeDisplayName(runtimeId);
  const provider = localRuntimeProvider(runtimeId);
  const cloud =
    provider === "aws" ? "AWS" : provider === "azure" ? "Azure" : "Local";
  const proSuffix = requiresPro ? " · licensed runtime" : "";
  return `Local runtime (${cloud} · ${engine})${proSuffix}`;
}

export function formatDeploymentTargetLabel(
  deployment: Pick<Deployment, "local" | "runtimeId" | "providerId" | "profileId">,
): string {
  if (deployment.local) {
    return formatLocalTargetLabel(deployment.runtimeId);
  }
  return `${deployment.providerId} · ${deployment.profileId}`;
}

export function proCapabilityHint(runtimeIds: string[]): string {
  const engines = [...new Set(runtimeIds.map((id) => runtimeDisplayName(id)))];
  if (engines.length === 1) {
    return `Some services need a licensed ${engines[0]} tier for full local emulation, or deploy to a cloud profile instead.`;
  }
  return "Some services need a licensed local runtime tier for full emulation, or deploy to a cloud profile instead.";
}