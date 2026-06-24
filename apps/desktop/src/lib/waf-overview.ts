// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import type { AzureLogQueryResult, AzureWafLogSchemaProfile } from "@/types/backend";

import {
  buildActionBreakdownQuery,
  buildBlockedRequestsQuery,
  buildTopClientIPsQuery,
  buildTopRulesQuery,
  wafBlockedActions,
  type WafLogFilters,
} from "./waf-kql";

export type WafOverviewSlice = {
  label: string;
  count: number;
};

export type WafOverviewData = {
  actions: WafOverviewSlice[];
  topRules: WafOverviewSlice[];
  topBlockedIPs: WafOverviewSlice[];
  blockedTotal: number;
  durationMs: number;
};

function columnIndex(columns: string[], ...candidates: string[]): number {
  const lookup = new Map(columns.map((column, index) => [column.toLowerCase(), index]));
  for (const candidate of candidates) {
    const index = lookup.get(candidate.toLowerCase());
    if (index != null) {
      return index;
    }
  }
  return -1;
}

function parseCount(value: string | undefined): number {
  if (!value) {
    return 0;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** Parse a two-column aggregate table (dimension + Count). */
export function parseLabeledCounts(
  result: AzureLogQueryResult,
  labelColumns: string[],
  countColumn = "Count",
): WafOverviewSlice[] {
  const labelIndex =
    labelColumns
      .map((column) => columnIndex(result.columns, column))
      .find((index) => index >= 0) ?? 0;
  const countIndex = columnIndex(result.columns, countColumn, "count_");
  return result.rows
    .map((row) => ({
      label: row[labelIndex] ?? "",
      count: parseCount(countIndex >= 0 ? row[countIndex] : row[row.length - 1]),
    }))
    .filter((entry) => entry.label.trim() !== "")
    .sort((left, right) => right.count - left.count);
}

export type WafOverviewQueries = {
  actions: string;
  topRules: string;
  topBlockedIPs: string;
  blockedTotal: string;
};

export function buildWafOverviewQueries(
  schema: AzureWafLogSchemaProfile,
  filters: WafLogFilters,
): WafOverviewQueries {
  const actionColumn = schema.columns.action || "action_s";
  const clientColumn = schema.columns.clientIP || "clientIP_s";
  const ruleColumn = schema.columns.ruleName || "ruleName_s";

  return {
    actions: buildActionBreakdownQuery(schema, filters),
    topRules: `${buildTopRulesQuery(schema, filters)}\n| take 8`,
    topBlockedIPs: `${buildTopClientIPsQuery(schema, {
      ...filters,
      actions: wafBlockedActions(schema),
    })}\n| take 8`,
    blockedTotal: `${buildBlockedRequestsQuery(schema, filters)}\n| summarize Blocked=count()`,
  };
}

export function mergeWafOverviewResults(
  actions: AzureLogQueryResult,
  topRules: AzureLogQueryResult,
  topBlockedIPs: AzureLogQueryResult,
  blockedTotal: AzureLogQueryResult,
  schema: AzureWafLogSchemaProfile,
): WafOverviewData {
  const actionColumn = schema.columns.action || "action_s";
  const ruleColumn = schema.columns.ruleName || "ruleName_s";
  const clientColumn = schema.columns.clientIP || "clientIP_s";
  const blockedIndex = columnIndex(blockedTotal.columns, "Blocked", "Count", "count_");
  const blockedRow = blockedTotal.rows[0];
  const blockedTotalCount =
    blockedIndex >= 0 && blockedRow ? parseCount(blockedRow[blockedIndex]) : 0;

  return {
    actions: parseLabeledCounts(actions, [actionColumn, "Action", "action_s"]),
    topRules: parseLabeledCounts(topRules, [ruleColumn, "RuleName", "ruleName_s"]),
    topBlockedIPs: parseLabeledCounts(topBlockedIPs, [clientColumn, "ClientIP", "clientIP_s"]),
    blockedTotal: blockedTotalCount,
    durationMs:
      (actions.durationMs ?? 0) +
      (topRules.durationMs ?? 0) +
      (topBlockedIPs.durationMs ?? 0) +
      (blockedTotal.durationMs ?? 0),
  };
}