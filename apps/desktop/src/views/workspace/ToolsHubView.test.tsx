// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/lib/theme";
import ToolsHubView from "./ToolsHubView";
import type { WorkspaceSnapshot, WorkspaceTab } from "@/types/backend";

const workspaceTabs: WorkspaceTab[] = [
  {
    tabId: "azure-tools",
    label: "Tools",
    summary: "Operational workflows",
    detail: "Hub",
    category: "tool",
  },
  {
    tabId: "azure-waf",
    label: "WAF Security",
    summary: "Front Door WAF investigation",
    detail: "Overview dashboard and policy tuning.",
    category: "tool",
  },
  {
    tabId: "azure-log-analytics",
    label: "Log Analytics",
    summary: "Run KQL queries",
    detail: "Query Azure Monitor logs.",
    category: "tool",
  },
];

const workspace = {
  azureWafPolicies: [{ name: "prodCMS" }],
  azureLogAnalyticsWorkspaces: [{ name: "law-platform" }],
  azureFrontDoorProfiles: [],
} as unknown as WorkspaceSnapshot;

describe("ToolsHubView", () => {
  it("lists tool workflows and navigates on card click", () => {
    const onNavigate = vi.fn();
    render(
      <ThemeProvider>
        <ToolsHubView
          workspace={workspace}
          providerLabel="Azure"
          profileLabel="ERW-PROD"
          workspaceTabs={workspaceTabs}
          onNavigate={onNavigate}
        />
      </ThemeProvider>,
    );

    expect(screen.getByRole("heading", { name: "Tools" })).toBeTruthy();
    expect(screen.getByText("WAF Security")).toBeTruthy();
    expect(screen.getByText("Log Analytics")).toBeTruthy();
    expect(screen.queryByText("Launch WAF Security, Log Analytics, and Front Door tools from one place.")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /waf security/i }));
    expect(onNavigate).toHaveBeenCalledWith("azure-waf");
  });
});