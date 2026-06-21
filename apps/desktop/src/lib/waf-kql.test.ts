import { describe, expect, it } from "vitest";

import { buildTrackingReferenceQuery, normaliseWafSchema } from "./waf-kql";

const schema = normaliseWafSchema({
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
  },
  detected: true,
});

describe("waf-kql", () => {
  it("builds a tracking-reference query against diagnostics columns", () => {
    const query = buildTrackingReferenceQuery(schema, "20260619T211623Z-abc");
    expect(query).toContain("AzureDiagnostics");
    expect(query).toContain('trackingReference_s == "20260619T211623Z-abc"');
    expect(query).not.toContain("AdditionalFields.trackingReference");
  });
});