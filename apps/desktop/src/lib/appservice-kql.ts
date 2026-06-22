// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

export type AppServiceLogTable =
  | "AppServiceHTTPLogs"
  | "AppServiceConsoleLogs"
  | "AppServiceAppLogs";

function escapeKql(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function appendAppNameFilter(query: string, appName?: string): string {
  const trimmed = appName?.trim();
  if (!trimmed) {
    return query;
  }
  return `${query}\n| where _ResourceId contains "${escapeKql(trimmed)}"`;
}

export function buildAppServiceHttpStatusQuery(
  table: AppServiceLogTable = "AppServiceHTTPLogs",
  appName?: string,
): string {
  return appendAppNameFilter(
    `${table}
| where TimeGenerated > ago(1d)
| summarize count() by HttpStatus, CsHost
| order by count_ desc`,
    appName,
  );
}

export function buildAppServiceRecentHttpQuery(appName?: string): string {
  return appendAppNameFilter(
    `AppServiceHTTPLogs
| where TimeGenerated > ago(1d)
| project TimeGenerated, CsHost, HttpStatus, TimeTaken, CsUriStem, CsMethod, CIp
| order by TimeGenerated desc
| take 100`,
    appName,
  );
}

export function buildAppServiceConsoleErrorsQuery(appName?: string): string {
  return appendAppNameFilter(
    `AppServiceConsoleLogs
| where TimeGenerated > ago(1d)
| where Level in ("Error", "Critical")
| project TimeGenerated, Level, ResultDescription
| order by TimeGenerated desc
| take 100`,
    appName,
  );
}

export function buildAppServiceAppLogsQuery(appName?: string): string {
  return appendAppNameFilter(
    `AppServiceAppLogs
| where TimeGenerated > ago(1d)
| project TimeGenerated, Level, Message, Properties
| order by TimeGenerated desc
| take 100`,
    appName,
  );
}