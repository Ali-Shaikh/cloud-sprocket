// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { describe, expect, it } from "vitest";

import {
  resolveWafPolicySelection,
  resolveWafWorkspaceSelection,
  WAF_ALL_POLICIES_VALUE,
  wafPolicyQueryFilter,
} from "./waf-selection";

const workspaces = [
  { name: "law-platform", customerId: "guid-1" },
  { name: "law-secondary", customerId: "guid-2" },
];

const policies = [
  { name: "waf-portal", resourceGroup: "rg-a", enabled: true },
  { name: "waf-cms", resourceGroup: "rg-b", enabled: true },
];

describe("waf-selection", () => {
  it("falls back to the first workspace when the session value is unknown", () => {
    const resolved = resolveWafWorkspaceSelection(workspaces, "stale-workspace");
    expect(resolved.workspace).toBe("law-platform");
    expect(resolved.needsSync).toBe(true);
  });

  it("defaults to all policies when multiple policies are loaded", () => {
    const resolved = resolveWafPolicySelection(policies, "missing-policy");
    expect(resolved.policyValue).toBe(WAF_ALL_POLICIES_VALUE);
    expect(resolved.queryPolicy).toBeUndefined();
    expect(resolved.configPolicy).toBe("waf-portal");
    expect(resolved.needsSync).toBe(true);
  });

  it("keeps a known policy selection", () => {
    const resolved = resolveWafPolicySelection(policies, "waf-cms");
    expect(resolved.policyValue).toBe("waf-cms");
    expect(resolved.queryPolicy).toBe("waf-cms");
    expect(resolved.needsSync).toBe(false);
  });

  it("treats the all-policies sentinel as no KQL filter", () => {
    expect(wafPolicyQueryFilter(WAF_ALL_POLICIES_VALUE)).toBeUndefined();
    expect(wafPolicyQueryFilter("prodCMS")).toBe("prodCMS");
  });
});