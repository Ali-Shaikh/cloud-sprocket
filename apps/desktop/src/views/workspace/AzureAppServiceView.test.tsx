// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/lib/theme";
import AzureAppServiceView from "./AzureAppServiceView";
import type { WorkspaceSnapshot } from "@/types/backend";

const longValue =
  "Server=tcp:db.example.net,1433;Database=app;User ID=admin;Password=super-secret-password;Encrypt=true;";

const workspace = {
  profile: { displayName: "test-sub", attributes: [] },
  azureWritesEnabled: false,
  azureResourceGroups: [{ name: "rg-apps" }],
  selectedAzureResourceGroup: "rg-apps",
  azureWebApps: [
    {
      name: "my-web-app",
      state: "Running",
      location: "westeurope",
      defaultHostName: "my-web-app.azurewebsites.net",
      kind: "app",
      resourceGroup: "rg-apps",
    },
  ],
  selectedAzureWebAppName: "my-web-app",
  azureWebAppActiveDetail: {
    name: "my-web-app",
    state: "Running",
    location: "westeurope",
    defaultHostName: "my-web-app.azurewebsites.net",
    kind: "app",
    resourceGroup: "rg-apps",
  },
  azureWebAppSettings: [
    { name: "PUBLIC_CONFIG", value: longValue, slotSetting: false },
    { name: "API_CONNECTION_STRING", value: longValue, slotSetting: true },
  ],
  azureAppServicePlans: [],
  azureWebAppDeploymentSlots: [],
  azureLogAnalyticsWorkspaces: [],
} as unknown as WorkspaceSnapshot;

const noop = () => {};
const asyncNoop = async () => {};

describe("AzureAppServiceView application settings", () => {
  it("shows the full setting value in the view dialog", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <AzureAppServiceView
          workspace={workspace}
          onSelectResourceGroup={noop}
          onSelectWebApp={noop}
          onSelectSlot={noop}
          onEditInLogAnalytics={noop}
          onCreateWebApp={noop}
          onInvokeAction={noop}
          onSetSetting={asyncNoop}
          onDeleteSetting={asyncNoop}
          onCreateSlot={noop}
          onSwapSlot={noop}
        />
      </ThemeProvider>,
    );

    const viewButtons = screen.getAllByRole("button", { name: /^view$/i });
    await user.click(viewButtons[0]!);

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(longValue)).toBeTruthy();
  });

  it("reveals sensitive values when the toggle is enabled", async () => {
    render(
      <ThemeProvider>
        <AzureAppServiceView
          workspace={workspace}
          onSelectResourceGroup={noop}
          onSelectWebApp={noop}
          onSelectSlot={noop}
          onEditInLogAnalytics={noop}
          onCreateWebApp={noop}
          onInvokeAction={noop}
          onSetSetting={asyncNoop}
          onDeleteSetting={asyncNoop}
          onCreateSlot={noop}
          onSwapSlot={noop}
        />
      </ThemeProvider>,
    );

    expect(screen.getAllByText("••••••••").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByLabelText("Show sensitive application setting values"));

    expect(screen.getAllByText(longValue).length).toBeGreaterThan(0);
  });
});