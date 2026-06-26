// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/lib/theme";
import AzureFrontDoorView from "./AzureFrontDoorView";
import type { WorkspaceSnapshot } from "@/types/backend";

const workspace = {
  profile: { displayName: "test-sub" },
  azureFrontDoorProfiles: [{ name: "afd-profile" }],
  azureLogAnalyticsWorkspaces: [{ name: "law-platform", customerId: "g1" }],
  selectedAzureLogWorkspace: "law-platform",
  selectedAzureFrontDoorProfile: "afd-profile",
  azureFrontDoorEndpoints: [],
  azureFrontDoorOriginGroups: [],
  azureFrontDoorOrigins: [],
} as unknown as WorkspaceSnapshot;

const noop = () => {};

describe("AzureFrontDoorView access logs", () => {
  it("runs the editor query without rebuilding from filters", async () => {
    // Tab switch + curated query selection exercises the editor state path.
    const onRunQuery = vi.fn().mockResolvedValue({
      columns: ["httpStatusCode_d"],
      rows: [["200"]],
      durationMs: 12,
    });

    const user = userEvent.setup();

    render(
      <ThemeProvider>
        <AzureFrontDoorView
          workspace={workspace}
          onRefresh={noop}
          onSelectProfile={noop}
          onSelectEndpoint={noop}
          onSelectOriginGroup={noop}
          onPurgeCache={noop}
          onOpenWafPolicy={noop}
          onEditInLogAnalytics={noop}
          onRunQuery={onRunQuery}
        />
      </ThemeProvider>,
    );

    await user.click(screen.getByRole("tab", { name: /access logs/i }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /status code breakdown/i })).toBeTruthy(),
    );
    await user.click(screen.getByRole("button", { name: /status code breakdown/i }));

    const hostFilter = screen.getByPlaceholderText("Host filter");
    fireEvent.change(hostFilter, { target: { value: "should-not-appear.example.com" } });

    fireEvent.click(screen.getByRole("button", { name: /run query/i }));

    await waitFor(() => expect(onRunQuery).toHaveBeenCalled());
    const executedQuery = onRunQuery.mock.calls[0]?.[1] as string;
    expect(executedQuery).toContain("summarize count() by httpStatusCode_d");
    expect(executedQuery).not.toContain("should-not-appear.example.com");
  });
});