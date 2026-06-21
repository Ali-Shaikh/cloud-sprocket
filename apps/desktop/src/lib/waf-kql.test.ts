import { describe, expect, it } from "vitest";

import {
  buildTrackingReferenceExtendQuery,
  buildTrackingReferenceQuery,
  buildTrackingReferenceSearchQuery,
  normaliseWafSchema,
} from "./waf-kql";

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
  },
  detected: true,
});

const trackingRef = "20260619T211623Z-157c4db97d7z2jghhC1DXBy14000000002pg000000006z97";

describe("waf-kql tracking reference", () => {
  it("builds the AdditionalFields extend lookup for AzureDiagnostics", () => {
    const query = buildTrackingReferenceExtendQuery(diagnosticsSchema, trackingRef);
    expect(query).toContain("AzureDiagnostics");
    expect(query).toContain('Category in ("FrontDoorWebApplicationFirewallLog"');
    expect(query).toContain("extend trackingRef = tostring(AdditionalFields.trackingReference)");
    expect(query).toContain(`trackingRef == "${trackingRef}"`);
    expect(query).toContain("project TimeGenerated, action_s, ruleName_s, requestUri_s");
    expect(query).toContain("trackingRef");
    expect(query).not.toContain("trackingReference_s ==");
  });

  it("builds the search-in lookup for AzureDiagnostics", () => {
    const query = buildTrackingReferenceSearchQuery(diagnosticsSchema, trackingRef);
    expect(query).toContain(`search in (AzureDiagnostics) "${trackingRef}"`);
    expect(query).toContain('Category in ("FrontDoorWebApplicationFirewallLog"');
    expect(query).toContain("project TimeGenerated, action_s, ruleName_s, requestUri_s");
    expect(query).not.toContain("AdditionalFields.trackingReference");
  });

  it("defaults buildTrackingReferenceQuery to the extend lookup", () => {
    const query = buildTrackingReferenceQuery(diagnosticsSchema, trackingRef);
    expect(query).toContain("AdditionalFields.trackingReference");
  });
});