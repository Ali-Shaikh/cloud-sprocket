// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import type { AzureWafLogColumnMap, AzureWafLogSchemaProfile } from "@/types/backend";

export type WafLogFilters = {
  actions?: string[];
  ruleName?: string;
  clientIP?: string;
  host?: string;
  policy?: string;
  uriContains?: string;
  trackingReference?: string;
};

function escapeKql(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function wafCategoryList(schema: AzureWafLogSchemaProfile): string {
  const categories = schema.categories?.length
    ? schema.categories
    : ["FrontDoorWebApplicationFirewallLog", "FrontdoorWebApplicationFirewallLog"];
  return categories.map((category) => `"${category}"`).join(",");
}

/** Blocked-action values for the active WAF log schema. */
export function wafBlockedActions(schema: AzureWafLogSchemaProfile): string[] {
  if (schema.mode === "applicationGateway") {
    return ["Blocked", "Detected and Blocked"];
  }
  return ["Block", "block"];
}

function baseWafTable(schema: AzureWafLogSchemaProfile): string {
  if (schema.mode === "azureDiagnostics") {
    return `${schema.tableName} | where Category in (${wafCategoryList(schema)})`;
  }
  return schema.tableName;
}

/** Resolve a WAF column from detected schema, or fall back only when schema was not probed. */
export function wafResolvedColumn(
  schema: AzureWafLogSchemaProfile,
  field: keyof AzureWafLogColumnMap,
  undetectedFallback: string,
): string {
  const value = schema.columns[field]?.trim();
  if (value) {
    return value;
  }
  return schema.detected ? "" : undetectedFallback;
}

/** BlockingRule extend clause using only columns present in the workspace. */
export function buildBlockingRuleExtendClause(schema: AzureWafLogSchemaProfile): string {
  const ruleName = wafResolvedColumn(schema, "ruleName", "ruleName_s");
  const extras = [
    wafResolvedColumn(schema, "detailsMessage", ""),
    wafResolvedColumn(schema, "detailsMatches", "details_matches_s"),
  ].filter(Boolean);
  if (extras.length === 0) {
    return `| extend BlockingRule = ${ruleName}`;
  }
  return `| extend BlockingRule = coalesce(${ruleName}, ${extras.join(", ")})`;
}

/** Project list for blocked/anomaly detail queries. */
export function wafDetailProjectColumns(schema: AzureWafLogSchemaProfile): string[] {
  const leading: Array<[keyof AzureWafLogColumnMap, string]> = [
    ["timeGenerated", "TimeGenerated"],
    ["policyName", "policy_s"],
    ["host", "host_s"],
    ["clientIP", "clientIP_s"],
    ["requestUri", "requestUri_s"],
    ["action", "action_s"],
  ];
  const trailing: Array<[keyof AzureWafLogColumnMap, string]> = [
    ["ruleName", "ruleName_s"],
    ["detailsMessage", ""],
    ["detailsData", ""],
    ["detailsMatches", "details_matches_s"],
    ["trackingReference", "trackingReference_s"],
    ["policyMode", "policyMode_s"],
  ];
  return [
    ...leading.map(([field, fallback]) => wafResolvedColumn(schema, field, fallback)).filter(Boolean),
    "BlockingRule",
    ...trailing.map(([field, fallback]) => wafResolvedColumn(schema, field, fallback)).filter(Boolean),
  ];
}

function wafInvestigationProjectColumns(schema: AzureWafLogSchemaProfile): string[] {
  const fields: Array<[keyof AzureWafLogColumnMap, string]> = [
    ["timeGenerated", "TimeGenerated"],
    ["action", "action_s"],
    ["ruleName", "ruleName_s"],
    ["requestUri", "requestUri_s"],
    ["detailsMatches", "details_matches_s"],
    ["detailsMessage", ""],
    ["clientIP", "clientIP_s"],
    ["host", "host_s"],
    ["policyName", "policy_s"],
    ["policyMode", "policyMode_s"],
    ["trackingReference", "trackingReference_s"],
  ];
  return fields.map(([field, fallback]) => wafResolvedColumn(schema, field, fallback)).filter(Boolean);
}

function trackingReferenceProjectColumns(schema: AzureWafLogSchemaProfile, includeTrackingRef = false): string {
  const fields = wafInvestigationProjectColumns(schema);
  if (includeTrackingRef) {
    fields.push("trackingRef");
  }
  return fields.join(", ");
}

function appendEqualsFilter(query: string, column: string | undefined, value: string | undefined): string {
  const trimmed = value?.trim();
  if (!column || !trimmed) {
    return query;
  }
  return `${query}\n| where ${column} == "${escapeKql(trimmed)}"`;
}

function appendContainsFilter(query: string, column: string | undefined, value: string | undefined): string {
  const trimmed = value?.trim();
  if (!column || !trimmed) {
    return query;
  }
  return `${query}\n| where ${column} contains "${escapeKql(trimmed)}"`;
}

function appendActionsFilter(query: string, column: string | undefined, actions?: string[]): string {
  const selected = (actions ?? []).map((action) => action.trim()).filter(Boolean);
  if (!column || selected.length === 0) {
    return query;
  }
  const values = selected.map((action) => `"${escapeKql(action)}"`).join(", ");
  return `${query}\n| where ${column} in (${values})`;
}

export function buildWafFilteredQuery(
  schema: AzureWafLogSchemaProfile,
  filters: WafLogFilters,
): string {
  const columns = schema.columns;
  let query = baseWafTable(schema);
  query = appendActionsFilter(query, columns.action, filters.actions);
  query = appendEqualsFilter(query, columns.ruleName, filters.ruleName);
  query = appendEqualsFilter(query, columns.clientIP, filters.clientIP);
  query = appendEqualsFilter(query, columns.host, filters.host);
  query = appendEqualsFilter(query, columns.policyName, filters.policy);
  query = appendContainsFilter(query, columns.requestUri, filters.uriContains);
  query = appendEqualsFilter(query, columns.trackingReference, filters.trackingReference);
  return `${query}\n| order by ${columns.timeGenerated} desc`;
}

/** Direct column equality against trackingReference_s (resource-specific tables). */
export function buildTrackingReferenceColumnQuery(
  schema: AzureWafLogSchemaProfile,
  trackingReference: string,
): string {
  return buildWafFilteredQuery(schema, { trackingReference });
}

/**
 * Tracking-reference lookup. AzureDiagnostics uses the flattened trackingReference_s
 * column; resource-specific tables use AdditionalFields.trackingReference.
 */
export function buildTrackingReferenceExtendQuery(
  schema: AzureWafLogSchemaProfile,
  trackingReference: string,
): string {
  const trimmed = trackingReference.trim();
  if (!trimmed) {
    return baseWafTable(schema);
  }
  const columns = schema.columns;
  if (schema.mode === "azureDiagnostics") {
    let query = `${schema.tableName}
| where Category in (${wafCategoryList(schema)})
| where ${columns.trackingReference} == "${escapeKql(trimmed)}"`;
    return `${query}
| project ${trackingReferenceProjectColumns(schema)}
| order by ${columns.timeGenerated} desc`;
  }
  if (schema.mode === "resourceSpecific") {
    return `${schema.tableName}
| extend trackingRef = tostring(AdditionalFields.trackingReference)
| where trackingRef == "${escapeKql(trimmed)}"
| project ${trackingReferenceProjectColumns(schema, true)}
| order by ${columns.timeGenerated} desc`;
  }
  if (schema.mode === "applicationGateway" && columns.trackingReference) {
    let query = `${schema.tableName}
| where ${columns.trackingReference} == "${escapeKql(trimmed)}"`;
    return `${query}
| project ${trackingReferenceProjectColumns(schema)}
| order by ${columns.timeGenerated} desc`;
  }
  return buildTrackingReferenceColumnQuery(schema, trimmed);
}

/**
 * Broad AzureDiagnostics search when the tracking ref may appear in any column.
 */
export function buildTrackingReferenceSearchQuery(
  schema: AzureWafLogSchemaProfile,
  trackingReference: string,
): string {
  const trimmed = trackingReference.trim();
  if (!trimmed) {
    return baseWafTable(schema);
  }
  const columns = schema.columns;
  if (schema.mode === "azureDiagnostics") {
    return `search in (${schema.tableName}) "${escapeKql(trimmed)}"
| where Category in (${wafCategoryList(schema)})
| project ${trackingReferenceProjectColumns(schema)}
| order by ${columns.timeGenerated} desc`;
  }
  return `search in (${schema.tableName}) "${escapeKql(trimmed)}"
| project ${trackingReferenceProjectColumns(schema)}
| order by ${columns.timeGenerated} desc`;
}

/** Default tracking lookup: extend for AzureDiagnostics, column filter otherwise. */
export function buildTrackingReferenceQuery(schema: AzureWafLogSchemaProfile, trackingReference: string): string {
  return buildTrackingReferenceExtendQuery(schema, trackingReference);
}

export function buildBlockedRequestsQuery(schema: AzureWafLogSchemaProfile, filters: WafLogFilters = {}): string {
  return buildWafFilteredQuery(schema, { ...filters, actions: wafBlockedActions(schema) });
}

function stripTrailingOrderBy(query: string): string {
  return query.replace(/\n\| order by [^\n]+$/i, "");
}

export function buildActionBreakdownQuery(schema: AzureWafLogSchemaProfile, filters: WafLogFilters = {}): string {
  const columns = schema.columns;
  const { actions: _ignoredActions, ...scopedFilters } = filters;
  const query = stripTrailingOrderBy(buildWafFilteredQuery(schema, scopedFilters));
  return `${query}\n| summarize Count=count() by ${columns.action}\n| order by Count desc`;
}

export function buildTopRulesQuery(schema: AzureWafLogSchemaProfile, filters: WafLogFilters = {}): string {
  const columns = schema.columns;
  let query = buildWafFilteredQuery(schema, filters);
  return `${query}\n| summarize Count=count() by ${columns.ruleName}\n| top 50 by Count desc`;
}

export function buildTopClientIPsQuery(schema: AzureWafLogSchemaProfile, filters: WafLogFilters = {}): string {
  const columns = schema.columns;
  let query = buildWafFilteredQuery(schema, filters);
  return `${query}\n| summarize Count=count() by ${columns.clientIP}\n| top 50 by Count desc`;
}

export function buildTopHostsQuery(schema: AzureWafLogSchemaProfile, filters: WafLogFilters = {}): string {
  const columns = schema.columns;
  let query = buildWafFilteredQuery(schema, filters);
  return `${query}\n| summarize Count=count() by ${columns.host}\n| top 50 by Count desc`;
}

export function buildTopUrisQuery(schema: AzureWafLogSchemaProfile, filters: WafLogFilters = {}): string {
  const columns = schema.columns;
  let query = buildWafFilteredQuery(schema, filters);
  return `${query}\n| summarize Count=count() by ${columns.requestUri}\n| top 50 by Count desc`;
}

export function buildAnomalyScoringQuery(schema: AzureWafLogSchemaProfile, filters: WafLogFilters = {}): string {
  return buildWafFilteredQuery(schema, {
    ...filters,
    actions: ["AnomalyScoring", "logandscore", "Log", "log"],
  });
}

export function buildJsChallengeQuery(schema: AzureWafLogSchemaProfile, filters: WafLogFilters = {}): string {
  return buildWafFilteredQuery(schema, {
    ...filters,
    actions: [
      "JSChallengeIssued",
      "JSChallengePass",
      "JSChallengeValid",
      "JSChallengeBlock",
      "JS Challenge",
    ],
  });
}

export type WafSchemaDescription = {
  modeKey: "azureDiagnostics" | "resourceSpecific" | "applicationGateway" | "unknown";
  modeLabel: string;
  tableLabel: string;
  trackingLookup: string;
  detected: boolean;
  message?: string;
};

/** Human-readable summary of which WAF log schema/mode the workspace is using. */
export function describeWafLogSchema(schema: AzureWafLogSchemaProfile): WafSchemaDescription {
  const modeKey =
    schema.mode === "azureDiagnostics"
      ? "azureDiagnostics"
      : schema.mode === "resourceSpecific"
        ? "resourceSpecific"
        : schema.mode === "applicationGateway"
          ? "applicationGateway"
          : "unknown";
  const modeLabel =
    modeKey === "azureDiagnostics"
      ? "AzureDiagnostics (classic diagnostic logs)"
      : modeKey === "resourceSpecific"
        ? "Resource-specific WAF table"
        : modeKey === "applicationGateway"
          ? "Application Gateway (AGWFirewallLogs)"
          : "Unknown schema mode";
  const trackingLookup =
    modeKey === "azureDiagnostics"
      ? `${schema.columns.trackingReference || "trackingReference_s"} column`
      : modeKey === "applicationGateway"
        ? `${schema.columns.trackingReference || "TransactionId"} column (transaction ID)`
        : modeKey === "resourceSpecific"
          ? "AdditionalFields.trackingReference (use Look up ref)"
          : "Tracking column from detected schema";
  return {
    modeKey,
    modeLabel,
    tableLabel: schema.tableName,
    trackingLookup,
    detected: schema.detected,
    message: schema.message,
  };
}

export function normaliseWafSchema(schema?: AzureWafLogSchemaProfile | null): AzureWafLogSchemaProfile {
  if (schema?.columns?.trackingReference) {
    return schema;
  }
  const columns: AzureWafLogColumnMap = {
    timeGenerated: "TimeGenerated",
    category: "Category",
    action: "action_s",
    ruleName: "ruleName_s",
    requestUri: "requestUri_s",
    clientIP: "clientIP_s",
    host: "host_s",
    policyName: "policy_s",
    policyMode: "policyMode_s",
    trackingReference: "trackingReference_s",
    detailsMatches: "details_matches_s",
    additionalFields: "AdditionalFields",
  };
  return {
    mode: "azureDiagnostics",
    tableName: "AzureDiagnostics",
    categories: ["FrontDoorWebApplicationFirewallLog", "FrontdoorWebApplicationFirewallLog"],
    columns,
    detected: false,
    message: "Using default Front Door customer-log columns until the workspace is probed.",
  };
}