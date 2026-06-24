// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { describe, expect, it } from "vitest";

import { normaliseWafSchema } from "./waf-kql";
import {
  buildExecutableWafQuery,
  trimWafQueryPageRows,
  wafGroupByOptions,
  wafQueryHasNextPage,
} from "./waf-query-execution";

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
  },
});

const baseQuery = `AzureDiagnostics
| where Category == "FrontDoorWebApplicationFirewallLog"`;

describe("waf-query-execution", () => {
  it("exposes group-by options from the schema map", () => {
    const options = wafGroupByOptions(schema);
    expect(options.map((option) => option.field)).toEqual([
      "action",
      "ruleName",
      "clientIP",
      "host",
      "policyName",
      "requestUri",
    ]);
  });

  it("appends summarize and pagination for grouped first page", () => {
    const built = buildExecutableWafQuery(baseQuery, schema, {
      groupByFields: ["action", "ruleName"],
      page: 1,
      pageSize: 50,
    });
    expect(built.query).toContain("| summarize Count=count() by action_s, ruleName_s");
    expect(built.query).toContain("| order by Count desc");
    expect(built.query).toContain("| take 51");
    expect(built.maxRows).toBe(51);
    expect(built.pageSize).toBe(50);
  });

  it("uses serialize pagination for later pages", () => {
    const built = buildExecutableWafQuery(baseQuery, schema, {
      page: 3,
      pageSize: 25,
    });
    expect(built.query).toContain("| serialize");
    expect(built.query).toContain("RowNum > 50 and RowNum <= 76");
    expect(built.maxRows).toBe(26);
  });

  it("detects and trims probe rows", () => {
    expect(wafQueryHasNextPage(51, 50)).toBe(true);
    expect(trimWafQueryPageRows(["a", "b", "c"], 2)).toEqual(["a", "b"]);
  });

  it("strips project before group-by and uses schema clientIP_s", () => {
    const detailQuery = `AzureDiagnostics
| where Category =~ "FrontDoorWebApplicationFirewallLog"
| where action_s =~ "Block"
| where policy_s == "prodCMS"
| extend BlockingRule = coalesce(ruleName_s, details_matches_s)
| project
    TimeGenerated,
    clientIP_s,
    action_s
| order by TimeGenerated desc`;
    const built = buildExecutableWafQuery(detailQuery, schema, {
      groupByFields: ["clientIP"],
      page: 1,
      pageSize: 500,
    });
    expect(built.query).toContain("| summarize Count=count() by clientIP_s");
    expect(built.query).not.toContain("| project");
  });
});