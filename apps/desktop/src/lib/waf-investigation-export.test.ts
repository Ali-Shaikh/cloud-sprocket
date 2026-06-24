// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { describe, expect, it } from "vitest";

import { buildWafInvestigationBundle } from "./waf-investigation-export";

describe("waf-investigation-export", () => {
  it("builds a SOC handoff bundle with query, schema, and decoded rows", () => {
    const bundle = buildWafInvestigationBundle({
      subscription: "ERW-PROD",
      workspace: "law-platform",
      query: "AzureDiagnostics | take 1",
      timespan: "P1D",
      timeRangeLabel: "Last 24 hours",
      policyName: "prodCMS",
      schemaProfile: {
        detected: true,
        mode: "azureDiagnostics",
        tableName: "AzureDiagnostics",
        categories: ["FrontDoorWebApplicationFirewallLog"],
        columns: {
          action: "action_s",
          trackingReference: "trackingReference_s",
        },
      },
      result: {
        columns: ["action_s", "trackingReference_s"],
        rows: [["Block", "ref-123"]],
        durationMs: 42,
      },
      decodedRows: [
        {
          action: "Block",
          trackingReference: "ref-123",
          matches: [{ matchVariableName: "QueryParamValue:q", matchVariableValue: "' or 1=1" }],
        },
      ],
      page: 1,
      pageSize: 100,
    });

    expect(bundle.tool).toBe("waf-security");
    expect(bundle.workspace).toBe("law-platform");
    expect(bundle.results.rows).toHaveLength(1);
    expect(bundle.attachments.resultsJson).toContain("ref-123");
    expect(bundle.summaryMarkdown).toContain("WAF investigation export");
    expect(bundle.summaryMarkdown).toContain("QueryParamValue:q");
    expect(bundle.handlingNotes.length).toBeGreaterThan(0);
  });
});