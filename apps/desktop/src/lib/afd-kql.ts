// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

export type AfdAccessLogMode = "azureDiagnostics" | "resourceSpecific";

export type AfdAccessLogFilters = {
  host?: string;
  clientIP?: string;
  httpStatus?: string;
  endpoint?: string;
  trackingReference?: string;
};

function escapeKql(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function baseAfdAccessTable(mode: AfdAccessLogMode, tableName: string): string {
  if (mode === "azureDiagnostics") {
    return `${tableName} | where Category == "FrontDoorAccessLog"`;
  }
  return tableName;
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

export function hostColumn(mode: AfdAccessLogMode): string {
  return mode === "azureDiagnostics" ? "hostName_s" : "HttpHost";
}

export function clientIpColumn(mode: AfdAccessLogMode): string {
  return mode === "azureDiagnostics" ? "clientIp_s" : "ClientIP";
}

export function statusColumn(mode: AfdAccessLogMode): string {
  return mode === "azureDiagnostics" ? "httpStatusCode_d" : "HttpStatusCode";
}

export function trackingRefColumn(mode: AfdAccessLogMode): string {
  return mode === "azureDiagnostics" ? "trackingReference_s" : "TrackingReference";
}

export function endpointColumn(mode: AfdAccessLogMode): string {
  return mode === "azureDiagnostics" ? "endpoint_s" : "Endpoint";
}

export function buildAfdAccessFilteredQuery(
  mode: AfdAccessLogMode,
  tableName: string,
  filters: AfdAccessLogFilters = {},
): string {
  let query = baseAfdAccessTable(mode, tableName);
  query = appendContainsFilter(query, hostColumn(mode), filters.host);
  query = appendEqualsFilter(query, clientIpColumn(mode), filters.clientIP);
  query = appendEqualsFilter(query, statusColumn(mode), filters.httpStatus);
  query = appendContainsFilter(query, endpointColumn(mode), filters.endpoint);
  query = appendEqualsFilter(query, trackingRefColumn(mode), filters.trackingReference);
  return query;
}

export function buildAfdStatusCodeBreakdownQuery(mode: AfdAccessLogMode, tableName: string): string {
  const status = statusColumn(mode);
  return `${baseAfdAccessTable(mode, tableName)}
| summarize count() by ${status}
| order by count_ desc`;
}

export function buildAfdTopHostsQuery(mode: AfdAccessLogMode, tableName: string): string {
  const host = hostColumn(mode);
  return `${baseAfdAccessTable(mode, tableName)}
| summarize count() by ${host}
| top 20 by count_ desc`;
}

export function buildAfdTopClientIPsQuery(mode: AfdAccessLogMode, tableName: string): string {
  const clientIP = clientIpColumn(mode);
  return `${baseAfdAccessTable(mode, tableName)}
| summarize count() by ${clientIP}
| top 20 by count_ desc`;
}

export function buildAfdTrackingReferenceSearchQuery(
  mode: AfdAccessLogMode,
  tableName: string,
  trackingReference: string,
): string {
  const trackingRef = trackingRefColumn(mode);
  const host = hostColumn(mode);
  const status = statusColumn(mode);
  const clientIP = clientIpColumn(mode);
  const requestUri = mode === "azureDiagnostics" ? "requestUri_s" : "RequestUri";
  return `${baseAfdAccessTable(mode, tableName)}
| where ${trackingRef} == "${escapeKql(trackingReference.trim())}"
| project TimeGenerated, ${trackingRef}, ${host}, ${status}, ${clientIP}, ${requestUri}
| order by TimeGenerated desc`;
}