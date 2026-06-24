// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import type { AzureWafLogSchemaProfile } from "@/types/backend";

import {
  buildActionBreakdownQuery,
  buildBlockedRequestsQuery,
  buildBlockingRuleExtendClause,
  buildJsChallengeQuery,
  buildTopClientIPsQuery,
  buildTopHostsQuery,
  buildTopRulesQuery,
  buildTopUrisQuery,
  buildTrackingReferenceExtendQuery,
  wafDetailProjectColumns,
  wafResolvedColumn,
  type WafLogFilters,
} from "./waf-kql";

export type WafCuratedQueryCategory = "investigation" | "aggregates" | "scoring";

export type WafCuratedQuery = {
  id: string;
  label: string;
  description: string;
  category: WafCuratedQueryCategory;
  build: (schema: AzureWafLogSchemaProfile, filters?: WafLogFilters) => string;
};

function escapeKql(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function primaryWafCategory(schema: AzureWafLogSchemaProfile): string {
  return schema.categories?.[0] ?? "FrontDoorWebApplicationFirewallLog";
}

function diagnosticsTable(schema: AzureWafLogSchemaProfile): string {
  return schema.mode === "azureDiagnostics" ? schema.tableName : schema.tableName;
}

function appendPolicyFilter(
  query: string,
  schema: AzureWafLogSchemaProfile,
  filters?: WafLogFilters,
): string {
  const policy = filters?.policy?.trim();
  const column = schema.columns.policyName;
  if (!policy || !column) {
    return query;
  }
  return `${query}\n| where ${column} == "${escapeKql(policy)}"`;
}

function buildWafDetailQuery(
  schema: AzureWafLogSchemaProfile,
  filters: WafLogFilters,
  actionFilter: string,
): string {
  const action = wafResolvedColumn(schema, "action", "action_s");
  const timeGenerated = wafResolvedColumn(schema, "timeGenerated", "TimeGenerated");
  const projectColumns = wafDetailProjectColumns(schema).join(",\n    ");

  let query: string;
  if (schema.mode === "azureDiagnostics") {
    const category = primaryWafCategory(schema);
    query = `${schema.tableName}
| where Category =~ "${escapeKql(category)}"
| where ${action} =~ "${escapeKql(actionFilter)}"`;
  } else {
    query = `${schema.tableName}
| where ${action} =~ "${escapeKql(actionFilter)}"`;
  }

  query = appendPolicyFilter(query, schema, filters);
  query = `${query}
${buildBlockingRuleExtendClause(schema)}
| project
    ${projectColumns}
| order by ${timeGenerated} desc`;
  return query;
}

/**
 * Detailed anomaly-scoring investigation query with BlockingRule coalesce and a
 * rich project list. Matches the operational pattern used in production WAF triage.
 */
export function buildAnomalyScoringDetailQuery(
  schema: AzureWafLogSchemaProfile,
  filters: WafLogFilters = {},
): string {
  return buildWafDetailQuery(schema, filters, "AnomalyScoring");
}

/** Blocked requests with BlockingRule for triage (same shape as anomaly detail). */
export function buildBlockedRequestsDetailQuery(
  schema: AzureWafLogSchemaProfile,
  filters: WafLogFilters = {},
): string {
  return buildWafDetailQuery(schema, filters, "Block");
}

export const WAF_CURATED_QUERY_CATEGORIES: Record<WafCuratedQueryCategory, string> = {
  investigation: "Investigation",
  aggregates: "Aggregates",
  scoring: "Scoring and challenges",
};

/** Built-in WAF queries. Add new entries here to ship more curated KQL. */
export const WAF_CURATED_QUERIES: WafCuratedQuery[] = [
  {
    id: "anomaly-detail",
    label: "Anomaly scoring (detail)",
    description: "AnomalyScoring rows with BlockingRule, host, client IP, and tracking ref.",
    category: "scoring",
    build: buildAnomalyScoringDetailQuery,
  },
  {
    id: "blocked-detail",
    label: "Blocked requests (detail)",
    description: "Blocked actions with BlockingRule coalesce and full request context.",
    category: "investigation",
    build: buildBlockedRequestsDetailQuery,
  },
  {
    id: "blocked",
    label: "Blocked requests",
    description: "All blocked WAF actions for the selected policy.",
    category: "investigation",
    build: buildBlockedRequestsQuery,
  },
  {
    id: "tracking-extend",
    label: "Tracking ref lookup",
    description: "Look up a tracking reference using the schema-appropriate column path.",
    category: "investigation",
    build: (schema, filters) =>
      buildTrackingReferenceExtendQuery(schema, filters?.trackingReference ?? ""),
  },
  {
    id: "actions",
    label: "Action breakdown",
    description: "Count of WAF actions (Block, Log, AnomalyScoring, etc.).",
    category: "aggregates",
    build: buildActionBreakdownQuery,
  },
  {
    id: "rules",
    label: "Top rules",
    description: "Most frequent rule names in the time range.",
    category: "aggregates",
    build: buildTopRulesQuery,
  },
  {
    id: "ips",
    label: "Top client IPs",
    description: "Client IPs with the highest WAF event volume.",
    category: "aggregates",
    build: buildTopClientIPsQuery,
  },
  {
    id: "hosts",
    label: "Top hosts",
    description: "Hostnames with the highest WAF event volume.",
    category: "aggregates",
    build: buildTopHostsQuery,
  },
  {
    id: "uris",
    label: "Top URIs",
    description: "Request URIs with the highest WAF event volume.",
    category: "aggregates",
    build: buildTopUrisQuery,
  },
  {
    id: "js",
    label: "JS challenge",
    description: "JavaScript challenge issued, pass, and block events.",
    category: "scoring",
    build: buildJsChallengeQuery,
  },
];

export function curatedQueriesByCategory(): Record<WafCuratedQueryCategory, WafCuratedQuery[]> {
  const grouped: Record<WafCuratedQueryCategory, WafCuratedQuery[]> = {
    investigation: [],
    aggregates: [],
    scoring: [],
  };
  for (const item of WAF_CURATED_QUERIES) {
    grouped[item.category].push(item);
  }
  return grouped;
}