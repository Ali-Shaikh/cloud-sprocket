// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import type { NavigateToResourceParams } from "@/lib/navigate-to-resource";

/**
 * A one-click jump from a resource inspector to a related inventory surface.
 * Built purely from snapshot fields so views stay thin.
 */
export type ResourceCrossLink = {
  /** Stable key for list rendering (e.g. "logs"). */
  id: string;
  /** Button label shown in the inspector (British English). */
  label: string;
  /** Deep-link params for navigateToResource / planNavigateToResource. */
  params: NavigateToResourceParams;
};

export type LambdaCrossLinkSource = {
  functionName: string;
  logGroup?: string;
};

/**
 * Conventional CloudWatch log group for a Lambda function when the backend
 * did not return an explicit logGroup.
 */
export function conventionalLambdaLogGroup(functionName: string): string {
  return `/aws/lambda/${functionName.trim()}`;
}

/**
 * Prefer the backend log group when present; otherwise the AWS convention.
 */
export function resolveLambdaLogGroupName(fn: LambdaCrossLinkSource): string | undefined {
  const explicit = fn.logGroup?.trim();
  if (explicit) {
    return explicit;
  }
  const name = fn.functionName?.trim();
  if (!name) {
    return undefined;
  }
  return conventionalLambdaLogGroup(name);
}

/**
 * Cross-links for a Lambda function inspector (Logs inventory selection).
 * Easy to extend when more related fields land on the frontend type.
 */
export function lambdaCrossLinks(fn: LambdaCrossLinkSource): ResourceCrossLink[] {
  const logGroupName = resolveLambdaLogGroupName(fn);
  if (!logGroupName) {
    return [];
  }

  return [
    {
      id: "logs",
      label: "Open in Logs",
      params: {
        provider: "aws",
        tab: "logs",
        resourceKey: logGroupName,
      },
    },
  ];
}
