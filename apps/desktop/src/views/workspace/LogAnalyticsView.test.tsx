import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

describe("LogAnalyticsView", () => {
  it("runs a KQL query and renders the result table", async () => {
    const onRunQuery = vi.fn().mockResolvedValue({
      columns: ["Level", "Message"],
      rows: [["Info", "hello-from-kql"]],
      durationMs: 10,
    });
    render(
      <ThemeProvider>
        <LogAnalyticsView workspace={workspace} onSelectWorkspace={() => {}} onRunQuery={onRunQuery} />
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

  it("opens the row drawer with full column values", async () => {
    const onRunQuery = vi.fn().mockResolvedValue(wafResult);
    render(
      <ThemeProvider>
        <LogAnalyticsView workspace={workspace} onSelectWorkspace={() => {}} onRunQuery={onRunQuery} />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /run query/i }));
    expect(await screen.findByText("Block")).toBeTruthy();

    const dataRows = screen.getAllByRole("row");
    fireEvent.click(dataRows[1]!);
    const drawer = await screen.findByRole("dialog");
    expect(within(drawer).getByText("Row 1 of 1")).toBeTruthy();
    expect(within(drawer).getByText("details_matches_s")).toBeTruthy();
    expect(within(drawer).getByText(/matchVariableName/)).toBeTruthy();
  });

  it("surfaces a query error", async () => {
    const onRunQuery = vi.fn().mockRejectedValue(new Error("bad KQL"));
    render(
      <ThemeProvider>
        <LogAnalyticsView workspace={workspace} onSelectWorkspace={() => {}} onRunQuery={onRunQuery} />
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
        />
      </ThemeProvider>,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Switching workspace...");
    expect(screen.getByRole("combobox", { name: "Select Log Analytics workspace" })).toBeDisabled();
  });
});