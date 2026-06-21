// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/lib/theme";
import AzureFunctionsView from "./AzureFunctionsView";
import type { WorkspaceSnapshot } from "@/types/backend";

function makeWorkspace(writes: boolean): WorkspaceSnapshot {
  return {
    profile: { displayName: "floci-az" },
    azureWritesEnabled: writes,
    azureFunctionApps: [{ name: "orders-fn", resourceGroup: "rg-app", state: "Running" }],
    azureFunctions: [{ name: "createOrder", trigger: "httpTrigger" }],
    selectedAzureFunctionApp: "orders-fn",
    selectedAzureFunction: "createOrder",
    azureFunctionsStatusMessage: "Loaded 1 Function App(s).",
  } as unknown as WorkspaceSnapshot;
}

describe("AzureFunctionsView", () => {
  it("invokes the selected function and renders the response", async () => {
    const onInvoke = vi.fn().mockResolvedValue({ statusCode: 200, body: '{"ok":true}' });
    render(
      <ThemeProvider>
        <AzureFunctionsView
          workspace={makeWorkspace(true)}
          onSelectApp={() => {}}
          onSelectFunction={() => {}}
          onInvoke={onInvoke}
        />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /invoke/i }));

    await waitFor(() => expect(onInvoke).toHaveBeenCalledWith("orders-fn", "createOrder", expect.any(String)));
    expect(await screen.findByText(/"ok":true/)).toBeTruthy();
    expect(screen.getByText("HTTP 200")).toBeTruthy();
  });

  it("disables invoke when write mode is off", () => {
    render(
      <ThemeProvider>
        <AzureFunctionsView
          workspace={makeWorkspace(false)}
          onSelectApp={() => {}}
          onSelectFunction={() => {}}
          onInvoke={vi.fn()}
        />
      </ThemeProvider>,
    );
    expect(screen.getByRole("button", { name: /invoke/i })).toHaveProperty("disabled", true);
  });
});
