import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/lib/theme";
import LogAnalyticsView from "./LogAnalyticsView";
import type { WorkspaceSnapshot } from "@/types/backend";

const workspace = {
  profile: { displayName: "floci-az" },
  azureLogAnalyticsWorkspaces: [{ name: "law-platform", customerId: "g1" }],
  selectedAzureLogWorkspace: "law-platform",
  azureLogAnalyticsStatusMessage: "Loaded 1 Log Analytics workspace(s).",
} as unknown as WorkspaceSnapshot;

const wafResult = {
  columns: ["action_s", "details_matches_s"],
  rows: [
    [
      "Block",
      '{"matches":[{"matchVariableName":"QueryParamValue:q","matchVariableValue":"\' or 1=1"}]}',
    ],
  ],
  durationMs: 88,
};

const laMocks = {
  onListHistory: vi.fn().mockResolvedValue([]),
  onListSaved: vi.fn().mockResolvedValue([]),
  onSaveQuery: vi.fn().mockResolvedValue({ id: "s1", name: "test", query: "AppEvents" }),
  onDeleteSaved: vi.fn().mockResolvedValue(undefined),
  onListTables: vi.fn().mockResolvedValue([{ name: "AppEvents", columns: ["TimeGenerated"] }]),
};

describe("LogAnalyticsView", () => {
  it("runs a KQL query and renders the result table", async () => {
    const onRunQuery = vi.fn().mockResolvedValue({
      columns: ["Level", "Message"],
      rows: [["Info", "hello-from-kql"]],
      durationMs: 10,
    });
    render(
      <ThemeProvider>
        <LogAnalyticsView
          workspace={workspace}
          onSelectWorkspace={() => {}}
          onRunQuery={onRunQuery}
          {...laMocks}
        />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /run query/i }));

    await waitFor(() =>
      expect(onRunQuery).toHaveBeenCalledWith("law-platform", expect.any(String), expect.any(String)),
    );
    expect(await screen.findByText("hello-from-kql")).toBeTruthy();
    expect(screen.getByText("Message")).toBeTruthy();
    expect(screen.getByText(/10 ms/)).toBeTruthy();
  });

  it("opens the inline row detail panel with populated fields", async () => {
    const onRunQuery = vi.fn().mockResolvedValue(wafResult);
    render(
      <ThemeProvider>
        <LogAnalyticsView
          workspace={workspace}
          onSelectWorkspace={() => {}}
          onRunQuery={onRunQuery}
          {...laMocks}
        />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /run query/i }));
    expect(await screen.findByText("Block")).toBeTruthy();

    const dataRows = screen.getAllByRole("row");
    fireEvent.click(dataRows[1]!);
    const detail = await screen.findByLabelText("Query result row details");
    expect(within(detail).getByText("Row 1 of 1")).toBeTruthy();
    expect(within(detail).getByText("Summary")).toBeTruthy();
    fireEvent.click(within(detail).getByRole("tab", { name: /fields/i }));
    expect(within(detail).getByText("details_matches_s")).toBeTruthy();
    expect(within(detail).getByText(/matchVariableName/)).toBeTruthy();
  });

  it("surfaces a query error", async () => {
    const onRunQuery = vi.fn().mockRejectedValue(new Error("bad KQL"));
    render(
      <ThemeProvider>
        <LogAnalyticsView
          workspace={workspace}
          onSelectWorkspace={() => {}}
          onRunQuery={onRunQuery}
          {...laMocks}
        />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /run query/i }));
    expect(await screen.findByText("bad KQL")).toBeTruthy();
  });

  it("shows a loader and disables workspace changes while selection is saving", () => {
    render(
      <ThemeProvider>
        <LogAnalyticsView
          workspace={workspace}
          workspaceSelectionLoading
          onSelectWorkspace={() => {}}
          onRunQuery={vi.fn()}
          {...laMocks}
        />
      </ThemeProvider>,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Switching workspace...");
    expect(screen.getByRole("combobox", { name: "Select Log Analytics workspace" })).toBeDisabled();
  });

  it("lists history entries in the history menu", async () => {
    const user = userEvent.setup();
    const onListHistory = vi.fn().mockResolvedValue([
      { query: "Heartbeat | take 5", timespan: "P1D", ranAt: "2026-06-21T10:00:00Z" },
    ]);
    render(
      <ThemeProvider>
        <LogAnalyticsView
          workspace={workspace}
          onSelectWorkspace={() => {}}
          onRunQuery={vi.fn()}
          {...laMocks}
          onListHistory={onListHistory}
        />
      </ThemeProvider>,
    );

    await waitFor(() => expect(onListHistory).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: /^history$/i }));
    expect(await screen.findByText("Heartbeat | take 5")).toBeTruthy();
  });
});