// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { describe, expect, it } from "vitest";

import {
  buildTrackingReferenceExtendQuery,
  buildTrackingReferenceQuery,
  buildTrackingReferenceSearchQuery,
  describeWafLogSchema,
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

const resourceSpecificSchema = normaliseWafSchema({
  mode: "resourceSpecific",
  tableName: "FrontDoorWebApplicationFirewallLog",
  columns: {
    timeGenerated: "TimeGenerated",
    action: "Action",
    ruleName: "RuleName",
    requestUri: "RequestUri",
    clientIP: "ClientIP",
    host: "Host",
    policyName: "PolicyName",
    policyMode: "PolicyMode",
    trackingReference: "TrackingReference",
    detailsMatches: "Details",
    detailsMessage: "details_msg_s",
  },
  detected: true,
});

const trackingRef = "20260619T211623Z-157c4db97d7z2jghhC1DXBy14000000002pg000000006z97";

describe("waf-kql tracking reference", () => {
  it("builds the trackingReference_s lookup for AzureDiagnostics", () => {
    const query = buildTrackingReferenceExtendQuery(diagnosticsSchema, trackingRef);
    expect(query).toContain("AzureDiagnostics");
    expect(query).toContain('Category in ("FrontDoorWebApplicationFirewallLog"');
    expect(query).toContain(`trackingReference_s == "${trackingRef}"`);
    expect(query).toContain("project TimeGenerated, action_s, ruleName_s, requestUri_s");
    expect(query).not.toContain("AdditionalFields");
    expect(query).not.toContain("extend trackingRef");
  });

  it("builds the AdditionalFields extend lookup for resource-specific tables", () => {
    const query = buildTrackingReferenceExtendQuery(resourceSpecificSchema, trackingRef);
    expect(query).toContain("FrontDoorWebApplicationFirewallLog");
    expect(query).toContain("extend trackingRef = tostring(AdditionalFields.trackingReference)");
    expect(query).toContain(`trackingRef == "${trackingRef}"`);
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
    expect(query).toContain("trackingReference_s ==");
    expect(query).not.toContain("AdditionalFields");
  });

  it("describes AzureDiagnostics schema mode for the UI", () => {
    const description = describeWafLogSchema(diagnosticsSchema);
    expect(description.modeKey).toBe("azureDiagnostics");
    expect(description.modeLabel).toContain("AzureDiagnostics");
    expect(description.trackingLookup).toContain("trackingReference_s");
  });
});