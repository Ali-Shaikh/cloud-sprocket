// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

export type AppInsightsCuratedCategory = "dependencies" | "requests" | "exceptions" | "general";

export type AppInsightsCuratedQuery = {
  id: string;
  label: string;
  description: string;
  category: AppInsightsCuratedCategory;
  query: string;
  timespan: string;
};

export const APPINSIGHTS_CURATED_CATEGORIES: Record<AppInsightsCuratedCategory, string> = {
  dependencies: "Dependencies",
  requests: "Requests",
  exceptions: "Exceptions",
  general: "General",
};

export const APPINSIGHTS_CURATED_QUERIES: AppInsightsCuratedQuery[] = [
  {
    id: "dependency-failures",
    label: "Dependency failures by target",
    description: "Outbound call volume, failures, and latency grouped by target.",
    category: "dependencies",
    timespan: "P1D",
    query: `dependencies
| where TimeGenerated > ago(24h)
| summarize calls=count(), failures=countif(Success == false), avgMs=avg(DurationMs)
  by Target, Name, ResultCode
| order by calls desc`,
  },
  {
    id: "dependency-recent",
    label: "Recent dependency calls",
    description: "Latest outbound dependency telemetry rows.",
    category: "dependencies",
    timespan: "PT1H",
    query: `dependencies
| project TimeGenerated, cloud_RoleName, Name, Target, Success, ResultCode, DurationMs, Data
| order by TimeGenerated desc
| take 100`,
  },
  {
    id: "request-failures",
    label: "Failed requests (5xx)",
    description: "Inbound HTTP requests that returned server errors.",
    category: "requests",
    timespan: "P1D",
    query: `requests
| where TimeGenerated > ago(24h)
| where Success == false or toint(ResultCode) >= 500
| summarize failures=count(), avgMs=avg(DurationMs) by Name, Url, ResultCode
| order by failures desc`,
  },
  {
    id: "request-recent",
    label: "Recent requests",
    description: "Latest inbound request telemetry rows.",
    category: "requests",
    timespan: "PT1H",
    query: `requests
| project TimeGenerated, cloud_RoleName, Name, Url, Success, ResultCode, DurationMs
| order by TimeGenerated desc
| take 100`,
  },
  {
    id: "exceptions-recent",
    label: "Recent exceptions",
    description: "Unhandled or logged exceptions in the last day.",
    category: "exceptions",
    timespan: "P1D",
    query: `exceptions
| where TimeGenerated > ago(24h)
| project TimeGenerated, cloud_RoleName, type, outerMessage, problemId, operation_Name
| order by TimeGenerated desc
| take 100`,
  },
  {
    id: "heartbeat",
    label: "Heartbeat agents",
    description: "VM/agent heartbeat summary for connected machines.",
    category: "general",
    timespan: "P1D",
    query: `Heartbeat
| summarize LastSeen=max(TimeGenerated) by Computer, Category
| order by LastSeen desc`,
  },
];