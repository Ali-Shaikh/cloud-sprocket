// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { afterEach, describe, expect, it } from "vitest";

import {
  clearWafLogSchemaCache,
  getCachedWafLogSchema,
  setCachedWafLogSchema,
} from "./waf-schema-cache";

afterEach(() => {
  clearWafLogSchemaCache();
});

describe("waf-schema-cache", () => {
  it("stores and retrieves schema per workspace", () => {
    setCachedWafLogSchema("law-platform", {
      mode: "azureDiagnostics",
      tableName: "AzureDiagnostics",
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
    expect(getCachedWafLogSchema("law-platform")?.detected).toBe(true);
    expect(getCachedWafLogSchema("other")).toBeUndefined();
  });
});