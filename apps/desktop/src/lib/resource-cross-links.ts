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

export type LambdaCrossLinkOptions = {
  /** Lambda region so Logs inventory can switch region before selecting the group. */
  region?: string;
  /**
   * Log group names already present in the current workspace inventory.
   * Conventional `/aws/lambda/<name>` is only used when it appears here
   * (or when the backend already set logGroup on the function).
   */
  knownLogGroupNames?: readonly string[];
};

/**
 * Conventional CloudWatch log group for a Lambda function when the backend
 * did not return an explicit logGroup.
 */
export function conventionalLambdaLogGroup(functionName: string): string {
  return `/aws/lambda/${functionName.trim()}`;
}

/**
 * Prefer the backend log group when present. Fall back to the AWS convention
 * only when that group is known to exist in inventory (avoids dead links).
 */
export function resolveLambdaLogGroupName(
  fn: LambdaCrossLinkSource,
  options: Pick<LambdaCrossLinkOptions, "knownLogGroupNames"> = {},
): string | undefined {
  const explicit = fn.logGroup?.trim();
  if (explicit) {
    return explicit;
  }
  const name = fn.functionName?.trim();
  if (!name) {
    return undefined;
  }
  const conventional = conventionalLambdaLogGroup(name);
  const known = options.knownLogGroupNames;
  if (known && known.some((g) => g.trim() === conventional)) {
    return conventional;
  }
  return undefined;
}

/**
 * Cross-links for a Lambda function inspector (Logs inventory selection).
 * Easy to extend when more related fields land on the frontend type.
 */
export function lambdaCrossLinks(
  fn: LambdaCrossLinkSource,
  options: LambdaCrossLinkOptions = {},
): ResourceCrossLink[] {
  const logGroupName = resolveLambdaLogGroupName(fn, options);
  if (!logGroupName) {
    return [];
  }

  const region = options.region?.trim();
  const context: Record<string, string> = {};
  if (region) {
    context.logsRegion = region;
  }

  return [
    {
      id: "logs",
      label: "Open in Logs",
      params: {
        provider: "aws",
        tab: "logs",
        resourceKey: logGroupName,
        context: Object.keys(context).length > 0 ? context : undefined,
      },
    },
  ];
}
