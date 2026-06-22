// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import {
  buildAfdAccessFilteredQuery,
  buildAfdStatusCodeBreakdownQuery,
  buildAfdTopClientIPsQuery,
  buildAfdTopHostsQuery,
  buildAfdTrackingReferenceSearchQuery,
  type AfdAccessLogFilters,
  type AfdAccessLogMode,
} from "./afd-kql";

export type AfdCuratedQuery = {
  id: string;
  label: string;
  description: string;
  build: (mode: AfdAccessLogMode, tableName: string, filters?: AfdAccessLogFilters) => string;
};

export const AFD_CURATED_QUERIES: AfdCuratedQuery[] = [
  {
    id: "recent-access",
    label: "Recent access rows",
    description: "Sample the latest Front Door access log rows.",
    build: (mode, tableName, filters = {}) =>
      `${buildAfdAccessFilteredQuery(mode, tableName, filters)}
| project TimeGenerated, ${mode === "azureDiagnostics" ? "hostName_s, httpStatusCode_d, clientIp_s, trackingReference_s" : "HttpHost, HttpStatusCode, ClientIP, TrackingReference"}
| order by TimeGenerated desc
| take 100`,
  },
  {
    id: "status-breakdown",
    label: "Status code breakdown",
    description: "Count requests by HTTP status code.",
    build: (mode, tableName) => buildAfdStatusCodeBreakdownQuery(mode, tableName),
  },
  {
    id: "top-hosts",
    label: "Top hosts",
    description: "Hosts with the highest request volume.",
    build: (mode, tableName) => buildAfdTopHostsQuery(mode, tableName),
  },
  {
    id: "top-client-ips",
    label: "Top client IPs",
    description: "Client IPs with the highest request volume.",
    build: (mode, tableName) => buildAfdTopClientIPsQuery(mode, tableName),
  },
  {
    id: "tracking-ref",
    label: "Tracking reference lookup",
    description: "Find rows for an X-Azure-Ref / tracking reference value.",
    build: (mode, tableName, filters = {}) =>
      buildAfdTrackingReferenceSearchQuery(mode, tableName, filters.trackingReference ?? ""),
  },
];