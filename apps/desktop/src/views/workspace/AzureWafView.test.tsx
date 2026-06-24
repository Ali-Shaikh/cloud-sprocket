// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/lib/theme";
import { clearWafLogSchemaCache } from "@/lib/waf-schema-cache";
import AzureWafView from "./AzureWafView";
import type { AzureWafLogSchemaProfile, WorkspaceSnapshot } from "@/types/backend";

const workspace = {
  profile: { displayName: "Marketing Subscription" },
  azureLogAnalyticsWorkspaces: [{ name: "law-platform", customerId: "g1" }],
  selectedAzureLogWorkspace: "law-platform",
  azureWafPolicies: [
    { name: "waf-portal", resourceGroup: "rg-marketing-prod", enabled: true, mode: "Prevention" },
  ],
  selectedAzureWafPolicy: "waf-portal",
  azureWafStatusMessage: "Loaded 1 Front Door WAF policy.",
  azureWafLogSchema: {
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
  },
  azureWafPolicyDetail: {
    name: "waf-portal",
    resourceGroup: "rg-marketing-prod",
    mode: "Prevention",
    enabled: true,
    managedRuleSets: [
      { ruleSetType: "Microsoft_DefaultRuleSet", ruleSetVersion: "2.1", ruleGroupName: "SQLI" },
    ],
    managedRuleOverrides: [
      { ruleId: "942100", ruleGroupName: "SQLI", enabled: false },
    ],
    exclusions: [],
    customRules: [],
  },
  azureWafRuleFireCounts: [{ ruleName: "942100", count: 12, action: "Block" }],
  azureWritesEnabled: false,
} as unknown as WorkspaceSnapshot;

const noop = () => {};

const erwProdSchema: AzureWafLogSchemaProfile = {
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
  message: "WAF logs detected in AzureDiagnostics.",
};

afterEach(() => {
  clearWafLogSchemaCache();
});

describe("AzureWafView", () => {
  it("probes log schema once per workspace in the background", async () => {
    const onProbeLogSchema = vi.fn().mockResolvedValue(erwProdSchema);
    const workspaceWithoutSchema = {
      ...workspace,
      azureWafLogSchema: undefined,
    } as unknown as WorkspaceSnapshot;
    render(
      <ThemeProvider>
        <AzureWafView
          workspace={workspaceWithoutSchema}
          onSelectWorkspace={noop}
          onSelectPolicy={noop}
          onRunQuery={vi.fn()}
          onEditInLogAnalytics={noop}
          onSetMode={async () => {}}
          onSetManagedRule={async () => {}}
          onRemoveExclusion={async () => {}}
          onAddExclusion={async () => {}}
          onProbeLogSchema={onProbeLogSchema}
        />
      </ThemeProvider>,
    );

    await waitFor(() => expect(onProbeLogSchema).toHaveBeenCalledTimes(1));
    expect(onProbeLogSchema.mock.calls[0]?.[0]).toBe("law-platform");
    expect(onProbeLogSchema.mock.calls[0]?.[1]).toBe("P1D");
    expect(await screen.findByText("Schema detected")).toBeTruthy();
  });

  it("does not probe schema while the config tab is active", async () => {
    const onProbeLogSchema = vi.fn().mockResolvedValue(erwProdSchema);
    const workspaceWithoutSchema = {
      ...workspace,
      azureWafLogSchema: undefined,
    } as unknown as WorkspaceSnapshot;
    render(
      <ThemeProvider>
        <AzureWafView
          workspace={workspaceWithoutSchema}
          onSelectWorkspace={noop}
          onSelectPolicy={noop}
          onRunQuery={vi.fn()}
          onEditInLogAnalytics={noop}
          onSetMode={async () => {}}
          onSetManagedRule={async () => {}}
          onRemoveExclusion={async () => {}}
          onAddExclusion={async () => {}}
          onProbeLogSchema={onProbeLogSchema}
        />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByRole("tab", { name: /config/i }));
    await waitFor(() => expect(onProbeLogSchema).not.toHaveBeenCalled());
  });
  it("looks up a tracking reference and renders WAF results", async () => {
    const onRunQuery = vi.fn().mockResolvedValue({
      columns: ["action_s", "trackingReference_s"],
      rows: [["Block", "20260619T211623Z-abc123"]],
      durationMs: 50,
    });
    render(
      <ThemeProvider>
        <AzureWafView
          workspace={workspace}
          onSelectWorkspace={noop}
          onSelectPolicy={noop}
          onRunQuery={onRunQuery}
          onEditInLogAnalytics={noop}
          onSetMode={async () => {}}
          onSetManagedRule={async () => {}}
          onRemoveExclusion={async () => {}}
          onAddExclusion={async () => {}}
        />
      </ThemeProvider>,
    );

    fireEvent.change(screen.getByLabelText("WAF tracking reference"), {
      target: { value: "20260619T211623Z-abc123" },
    });
    fireEvent.click(screen.getByRole("button", { name: /look up ref/i }));

    await waitFor(() => {
      const queries = onRunQuery.mock.calls.map((call) => String(call[1] ?? ""));
      expect(queries.some((entry) => entry.includes("trackingReference_s =="))).toBe(true);
    });
    const trackingCall = onRunQuery.mock.calls.find((call) =>
      String(call[1] ?? "").includes("trackingReference_s =="),
    );
    expect(trackingCall?.[1]).toContain("| take 101");
    expect(trackingCall?.[3]).toBe(101);
    expect(trackingCall?.[1]).not.toContain("AdditionalFields");
    expect(await screen.findByText("20260619T211623Z-abc123")).toBeTruthy();
  });

  it("appends group-by summarize when dimensions are selected", async () => {
    const user = userEvent.setup();
    const onRunQuery = vi.fn().mockResolvedValue({
      columns: ["action_s", "Count"],
      rows: [["Block", "5"]],
      durationMs: 12,
    });
    render(
      <ThemeProvider>
        <AzureWafView
          workspace={workspace}
          onSelectWorkspace={noop}
          onSelectPolicy={noop}
          onRunQuery={onRunQuery}
          onEditInLogAnalytics={noop}
          onSetMode={async () => {}}
          onSetManagedRule={async () => {}}
          onRemoveExclusion={async () => {}}
          onAddExclusion={async () => {}}
        />
      </ThemeProvider>,
    );

    await user.click(screen.getByRole("button", { name: /curated queries/i }));
    await user.click(
      screen.getByRole("menuitem", { name: /Blocked requests.*All blocked WAF actions/i }),
    );
    await user.click(screen.getByRole("button", { name: /group by action/i }));
    await user.click(screen.getByRole("button", { name: /run query/i }));

    await waitFor(() => expect(onRunQuery).toHaveBeenCalled());
    expect(onRunQuery.mock.calls[0]?.[1]).toContain(
      "| summarize Count=count() by action_s",
    );
  });

  it("routes Edit in Log Analytics with the current query", async () => {
    const user = userEvent.setup();
    const onEditInLogAnalytics = vi.fn();
    render(
      <ThemeProvider>
        <AzureWafView
          workspace={workspace}
          onSelectWorkspace={noop}
          onSelectPolicy={noop}
          onRunQuery={vi.fn()}
          onEditInLogAnalytics={onEditInLogAnalytics}
          onSetMode={async () => {}}
          onSetManagedRule={async () => {}}
          onRemoveExclusion={async () => {}}
          onAddExclusion={async () => {}}
        />
      </ThemeProvider>,
    );

    await user.click(screen.getByRole("button", { name: /curated queries/i }));
    await user.click(
      screen.getByRole("menuitem", { name: /Blocked requests.*All blocked WAF actions/i }),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /edit in log analytics/i })).not.toBeDisabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: /edit in log analytics/i }));
    expect(onEditInLogAnalytics).toHaveBeenCalledWith(
      "law-platform",
      expect.stringContaining("AzureDiagnostics"),
      expect.any(String),
    );
  });
});