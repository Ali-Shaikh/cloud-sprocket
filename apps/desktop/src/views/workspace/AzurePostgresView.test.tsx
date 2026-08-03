// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/lib/theme";
import AzurePostgresView from "./AzurePostgresView";
import type { WorkspaceSnapshot } from "@/types/backend";

const workspace = {
  profile: {
    displayName: "floci-az",
    attributes: [{ label: "Tenant ID", value: "cloudsprocket-local" }],
  },
  azurePostgresServers: [
    {
      name: "lab-dev-pg",
      resourceGroup: "app-rg",
      location: "eastus",
      version: "17",
      administratorLogin: "psqladmin",
      sku: "B_Standard_B1ms",
      storageMb: 32768,
      provisioningState: "Succeeded",
      fqdn: "localhost",
      localHost: "localhost",
      localPort: 54983,
    },
  ],
  selectedAzurePostgresServer: "lab-dev-pg",
  azurePostgresConnection: {
    host: "localhost",
    port: 54983,
    psql: 'psql "host=localhost port=54983 dbname=postgres user=psqladmin password=secret sslmode=disable"',
    uri: "postgresql://psqladmin:secret@localhost:54983/postgres?sslmode=disable",
    jdbcUrl:
      "jdbc:postgresql://localhost:54983/postgres?user=psqladmin&password=secret&sslmode=disable",
    dotNet:
      "Host=localhost;Port=54983;Database=postgres;Username=psqladmin;Password=secret;SSL Mode=Disable;",
  },
  azurePostgresStatusMessage: "Loaded 1 PostgreSQL server(s).",
} as unknown as WorkspaceSnapshot;

describe("AzurePostgresView", () => {
  it("shows servers, masks connection strings until reveal, and selects a server", () => {
    const onSelectServer = vi.fn();
    render(
      <ThemeProvider>
        <AzurePostgresView
          workspace={workspace}
          onSelectServer={onSelectServer}
        />
      </ThemeProvider>,
    );

    expect(screen.getByText("lab-dev-pg")).toBeTruthy();
    expect(screen.getByText("psqladmin")).toBeTruthy();
    expect(screen.getAllByText("••••••••").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByLabelText("Reveal connection strings"));
    expect(screen.getAllByText(/sslmode=disable/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByText("lab-dev-pg"));
    expect(onSelectServer).toHaveBeenCalledWith("lab-dev-pg");
  });

  it("invokes start and stop when write capabilities allow it", () => {
    const onStartServer = vi.fn();
    const onStopServer = vi.fn();
    const writeWorkspace = {
      ...workspace,
      actionCapabilities: {
        postgres: [
          { actionId: "startServer", label: "Start server", enabled: true },
          { actionId: "stopServer", label: "Stop server", enabled: true },
        ],
      },
    } as unknown as WorkspaceSnapshot;

    render(
      <ThemeProvider>
        <AzurePostgresView
          workspace={writeWorkspace}
          onSelectServer={vi.fn()}
          onStartServer={onStartServer}
          onStopServer={onStopServer}
        />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Start server" }));
    fireEvent.click(screen.getByRole("button", { name: "Stop server" }));
    expect(onStartServer).toHaveBeenCalledWith("lab-dev-pg", "app-rg");
    expect(onStopServer).toHaveBeenCalledWith("lab-dev-pg", "app-rg");
  });

  it("disables start and stop when write mode is off", () => {
    const writeWorkspace = {
      ...workspace,
      actionCapabilities: {
        postgres: [
          {
            actionId: "startServer",
            label: "Start server",
            enabled: false,
            reason: "Turn on write mode from the top bar to run mutating actions.",
          },
          {
            actionId: "stopServer",
            label: "Stop server",
            enabled: false,
            reason: "Turn on write mode from the top bar to run mutating actions.",
          },
        ],
      },
    } as unknown as WorkspaceSnapshot;

    render(
      <ThemeProvider>
        <AzurePostgresView
          workspace={writeWorkspace}
          onSelectServer={vi.fn()}
          onStartServer={vi.fn()}
          onStopServer={vi.fn()}
        />
      </ThemeProvider>,
    );

    expect(screen.getByRole("button", { name: "Start server" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Stop server" })).toBeDisabled();
  });
});