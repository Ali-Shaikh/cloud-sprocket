// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { describe, expect, it } from "vitest";

import {
  buildAnomalyScoringDetailQuery,
  buildBlockedRequestsDetailQuery,
  WAF_CURATED_QUERIES,
} from "./waf-curated-queries";
import { normaliseWafSchema } from "./waf-kql";

const diagnosticsSchema = normaliseWafSchema({
  mode: "azureDiagnostics",
  tableName: "AzureDiagnostics",
  categories: ["FrontDoorWebApplicationFirewallLog"],
  columns: {
    timeGenerated: "TimeGenerated",
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
  },
  detected: true,
});

/** ERW-PROD-AFD workspace: customer logs with details_matches_s but no details_msg_s. */
const erwProdSchema = normaliseWafSchema({
  mode: "azureDiagnostics",
  tableName: "AzureDiagnostics",
  categories: ["FrontDoorWebApplicationFirewallLog"],
  columns: {
    timeGenerated: "TimeGenerated",
    action: "action_s",
    ruleName: "ruleName_s",
    requestUri: "requestUri_s",
    clientIP: "clientIP_s",
    host: "host_s",
    policyName: "policy_s",
    policyMode: "policyMode_s",
    trackingReference: "trackingReference_s",
    detailsMatches: "details_matches_s",
  },
  detected: true,
});

describe("waf-curated-queries", () => {
  it("builds detail queries from undetected defaults without phantom detail columns", () => {
    const query = buildBlockedRequestsDetailQuery(normaliseWafSchema(), { policy: "prodCMS" });
    expect(query).toContain("details_matches_s");
    expect(query).not.toContain("details_msg_s");
    expect(query).not.toContain("details_data_s");
  });

  it("builds detail queries for ERW-PROD without absent details_msg_s or details_data_s", () => {
    const query = buildBlockedRequestsDetailQuery(erwProdSchema, { policy: "prodCMS" });
    expect(query).toContain("clientIP_s");
    expect(query).toContain("host_s");
    expect(query).toContain("policy_s");
    expect(query).toContain("details_matches_s");
    expect(query).toContain("extend BlockingRule = coalesce(ruleName_s, details_matches_s)");
    expect(query).not.toContain("details_msg_s");
    expect(query).not.toContain("details_data_s");
  });

  it("builds the anomaly scoring detail query with BlockingRule and diagnostics columns", () => {
    const query = buildAnomalyScoringDetailQuery(diagnosticsSchema, { policy: "prod" });
    expect(query).toContain("AzureDiagnostics");
    expect(query).toContain('Category =~ "FrontDoorWebApplicationFirewallLog"');
    expect(query).toContain('action_s =~ "AnomalyScoring"');
    expect(query).toContain('policy_s == "prod"');
    expect(query).toContain(
      "extend BlockingRule = coalesce(ruleName_s, details_msg_s, details_matches_s)",
    );
    expect(query).toContain("host_s");
    expect(query).toContain("clientIP_s");
    expect(query).toContain("trackingReference_s");
    expect(query).toContain("order by TimeGenerated desc");
  });

  it("builds blocked detail query with Block filter", () => {
    const query = buildBlockedRequestsDetailQuery(diagnosticsSchema, { policy: "waf-portal" });
    expect(query).toContain('action_s =~ "Block"');
    expect(query).toContain('policy_s == "waf-portal"');
    expect(query).toContain("BlockingRule");
  });

  it("ships at least the anomaly detail preset in the curated catalogue", () => {
    const anomaly = WAF_CURATED_QUERIES.find((item) => item.id === "anomaly-detail");
    expect(anomaly?.label).toContain("Anomaly scoring");
    expect(anomaly?.build(diagnosticsSchema, { policy: "prod" })).toContain("AnomalyScoring");
  });
});