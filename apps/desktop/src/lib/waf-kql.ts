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

/** AzureDiagnostics Front Door WAF logs use clientIp_s, not clientIP_s. */
export function wafClientIpColumn(schema: AzureWafLogSchemaProfile): string {
  if (schema.mode === "azureDiagnostics") {
    const mapped = schema.columns.clientIP?.trim();
    if (mapped && /clientip/i.test(mapped)) {
      return mapped;
    }
    return "clientIp_s";
  }
  return schema.columns.clientIP?.trim() || "ClientIP";
}

/** AzureDiagnostics Front Door WAF logs use hostName_s for the request host. */
export function wafHostColumn(schema: AzureWafLogSchemaProfile): string {
  if (schema.mode === "azureDiagnostics") {
    const mapped = schema.columns.host?.trim();
    if (mapped && /host/i.test(mapped)) {
      return mapped;
    }
    return "hostName_s";
  }
  return schema.columns.host?.trim() || "Host";
}

function wafCategoryList(schema: AzureWafLogSchemaProfile): string {
  const categories = schema.categories?.length
    ? schema.categories
    : ["FrontDoorWebApplicationFirewallLog", "FrontdoorWebApplicationFirewallLog"];
  return categories.map((category) => `"${category}"`).join(",");
}

function baseWafTable(schema: AzureWafLogSchemaProfile): string {
  if (schema.mode === "azureDiagnostics") {
    return `${schema.tableName} | where Category in (${wafCategoryList(schema)})`;
  }
  return schema.tableName;
}

function trackingReferenceProjectColumns(schema: AzureWafLogSchemaProfile, includeTrackingRef = false): string {
  const columns = schema.columns;
  const fields = [
    columns.timeGenerated,
    columns.action,
    columns.ruleName,
    columns.requestUri,
    columns.detailsMatches,
    columns.detailsMessage,
    columns.clientIP,
    columns.host,
  ].filter(Boolean);
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
  query = appendEqualsFilter(query, wafClientIpColumn(schema), filters.clientIP);
  query = appendEqualsFilter(query, wafHostColumn(schema), filters.host);
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
  return buildWafFilteredQuery(schema, { ...filters, actions: ["Block", "block"] });
}

export function buildActionBreakdownQuery(schema: AzureWafLogSchemaProfile, filters: WafLogFilters = {}): string {
  const columns = schema.columns;
  let query = baseWafTable(schema);
  query = appendActionsFilter(query, columns.action, filters.actions);
  return `${query}\n| summarize Count=count() by ${columns.action}\n| order by Count desc`;
}

export function buildTopRulesQuery(schema: AzureWafLogSchemaProfile, filters: WafLogFilters = {}): string {
  const columns = schema.columns;
  let query = buildWafFilteredQuery(schema, filters);
  return `${query}\n| summarize Count=count() by ${columns.ruleName}\n| top 50 by Count desc`;
}

export function buildTopClientIPsQuery(schema: AzureWafLogSchemaProfile, filters: WafLogFilters = {}): string {
  let query = buildWafFilteredQuery(schema, filters);
  return `${query}\n| summarize Count=count() by ${wafClientIpColumn(schema)}\n| top 50 by Count desc`;
}

export function buildTopHostsQuery(schema: AzureWafLogSchemaProfile, filters: WafLogFilters = {}): string {
  let query = buildWafFilteredQuery(schema, filters);
  return `${query}\n| summarize Count=count() by ${wafHostColumn(schema)}\n| top 50 by Count desc`;
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
  modeKey: "azureDiagnostics" | "resourceSpecific" | "unknown";
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
        : "unknown";
  const modeLabel =
    modeKey === "azureDiagnostics"
      ? "AzureDiagnostics (classic diagnostic logs)"
      : modeKey === "resourceSpecific"
        ? "Resource-specific WAF table"
        : "Unknown schema mode";
  const trackingLookup =
    modeKey === "azureDiagnostics"
      ? `${schema.columns.trackingReference || "trackingReference_s"} column`
      : "AdditionalFields.trackingReference (use Look up ref)";
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
    clientIP: "clientIp_s",
    host: "hostName_s",
    policyName: "policy_s",
    policyMode: "policyMode_s",
    trackingReference: "trackingReference_s",
    detailsMatches: "details_matches_s",
    detailsMessage: "details_msg_s",
    detailsData: "details_data_s",
    additionalFields: "AdditionalFields",
  };
  return {
    mode: "azureDiagnostics",
    tableName: "AzureDiagnostics",
    categories: ["FrontDoorWebApplicationFirewallLog", "FrontdoorWebApplicationFirewallLog"],
    columns,
    detected: false,
    message: "Using default AzureDiagnostics schema.",
  };
}