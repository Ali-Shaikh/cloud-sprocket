// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import type { AzureLogAnalyticsWorkspace, AzureWafPolicySummary } from "@/types/backend";

/** Sentinel value for log queries that span every policy in the workspace. */
export const WAF_ALL_POLICIES_VALUE = "__all__";

export type ResolvedWafWorkspace = {
  workspace: string;
  /** True when the UI should persist a corrected workspace to the session. */
  needsSync: boolean;
};

export type ResolvedWafPolicy = {
  /** Dropdown value: a policy name or WAF_ALL_POLICIES_VALUE. */
  policyValue: string;
  /** Policy name passed into KQL filters; undefined means no policy filter. */
  queryPolicy?: string;
  /** Policy name used for config/tuning actions. */
  configPolicy: string;
  needsSync: boolean;
};

function workspaceMatches(
  workspaces: AzureLogAnalyticsWorkspace[],
  candidate: string,
): AzureLogAnalyticsWorkspace | undefined {
  const trimmed = candidate.trim();
  if (!trimmed) {
    return undefined;
  }
  return workspaces.find(
    (entry) => entry.name === trimmed || entry.customerId === trimmed,
  );
}

export function resolveWafWorkspaceSelection(
  workspaces: AzureLogAnalyticsWorkspace[],
  selected?: string,
): ResolvedWafWorkspace {
  if (workspaces.length === 0) {
    return { workspace: "", needsSync: false };
  }
  const match = workspaceMatches(workspaces, selected ?? "");
  if (match) {
    return { workspace: match.name, needsSync: match.name !== selected?.trim() };
  }
  return { workspace: workspaces[0]!.name, needsSync: true };
}

export function resolveWafPolicySelection(
  policies: AzureWafPolicySummary[],
  selected?: string,
  preferAllPolicies = true,
): ResolvedWafPolicy {
  if (policies.length === 0) {
    return {
      policyValue: WAF_ALL_POLICIES_VALUE,
      queryPolicy: undefined,
      configPolicy: "",
      needsSync: false,
    };
  }

  const trimmed = selected?.trim() ?? "";
  if (trimmed && trimmed !== WAF_ALL_POLICIES_VALUE) {
    const known = policies.some((policy) => policy.name === trimmed);
    if (known) {
      return {
        policyValue: trimmed,
        queryPolicy: trimmed,
        configPolicy: trimmed,
        needsSync: false,
      };
    }
  }

  if (preferAllPolicies && policies.length > 1) {
    return {
      policyValue: WAF_ALL_POLICIES_VALUE,
      queryPolicy: undefined,
      configPolicy: policies[0]!.name,
      needsSync: trimmed !== "" && trimmed !== WAF_ALL_POLICIES_VALUE,
    };
  }

  const first = policies[0]!.name;
  return {
    policyValue: first,
    queryPolicy: first,
    configPolicy: first,
    needsSync: trimmed !== first,
  };
}

export function wafPolicyQueryFilter(policyValue: string): string | undefined {
  if (!policyValue.trim() || policyValue === WAF_ALL_POLICIES_VALUE) {
    return undefined;
  }
  return policyValue.trim();
}