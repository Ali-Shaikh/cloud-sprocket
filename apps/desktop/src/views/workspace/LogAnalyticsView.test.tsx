import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

describe("LogAnalyticsView", () => {
  it("runs a KQL query and renders the result table", async () => {
    const onRunQuery = vi.fn().mockResolvedValue({
      columns: ["Level", "Message"],
      rows: [["Info", "hello-from-kql"]],
    });
    render(
      <ThemeProvider>
        <LogAnalyticsView workspace={workspace} onSelectWorkspace={() => {}} onRunQuery={onRunQuery} />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /run query/i }));

    await waitFor(() => expect(onRunQuery).toHaveBeenCalledWith("law-platform", expect.any(String)));
    expect(await screen.findByText("hello-from-kql")).toBeTruthy();
    expect(screen.getByText("Message")).toBeTruthy();
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
});
