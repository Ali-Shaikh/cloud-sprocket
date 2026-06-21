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

function baseWafTable(schema: AzureWafLogSchemaProfile): string {
  if (schema.mode === "azureDiagnostics") {
    const categories = schema.categories?.length
      ? schema.categories.map((category) => `"${category}"`).join(",")
      : `"FrontDoorWebApplicationFirewallLog","FrontdoorWebApplicationFirewallLog"`;
    return `${schema.tableName} | where Category in (${categories})`;
  }
  return schema.tableName;
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

export function buildTrackingReferenceQuery(schema: AzureWafLogSchemaProfile, trackingReference: string): string {
  return buildWafFilteredQuery(schema, { trackingReference });
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