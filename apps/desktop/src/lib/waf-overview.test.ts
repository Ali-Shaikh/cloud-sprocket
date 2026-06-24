// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { describe, expect, it } from "vitest";

import { normaliseWafSchema } from "./waf-kql";
import {
  buildWafOverviewQueries,
  mergeWafOverviewResults,
  parseLabeledCounts,
} from "./waf-overview";

const schema = normaliseWafSchema({
  mode: "azureDiagnostics",
  tableName: "AzureDiagnostics",
  categories: ["FrontDoorWebApplicationFirewallLog"],
  columns: {
    action: "action_s",
    ruleName: "ruleName_s",
    clientIP: "clientIP_s",
    policyName: "policy_s",
  },
});

describe("waf-overview", () => {
  it("builds compact overview queries scoped to a policy", () => {
    const queries = buildWafOverviewQueries(schema, { policy: "waf-portal" });
    expect(queries.topRules).toContain("policy_s == \"waf-portal\"");
    expect(queries.topRules).toContain("| take 8");
    expect(queries.blockedTotal).toContain("summarize Blocked=count()");
  });

  it("parses aggregate rows and merges overview slices", () => {
    const actions = {
      columns: ["action_s", "Count"],
      rows: [
        ["Block", "12"],
        ["Log", "4"],
      ],
    };
    const topRules = {
      columns: ["ruleName_s", "Count"],
      rows: [["942100", "7"]],
    };
    const topIPs = {
      columns: ["clientIP_s", "Count"],
      rows: [["203.0.113.10", "3"]],
    };
    const blockedTotal = {
      columns: ["Blocked"],
      rows: [["12"]],
    };
    const overview = mergeWafOverviewResults(actions, topRules, topIPs, blockedTotal, schema);
    expect(overview.blockedTotal).toBe(12);
    expect(overview.actions[0]).toEqual({ label: "Block", count: 12 });
    expect(parseLabeledCounts(topRules, ["ruleName_s"])[0].label).toBe("942100");
  });
});