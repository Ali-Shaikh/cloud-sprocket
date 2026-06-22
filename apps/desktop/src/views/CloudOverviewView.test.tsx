// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/lib/theme";
import CloudOverviewView from "./CloudOverviewView";

const { backendRequestMock } = vi.hoisted(() => ({ backendRequestMock: vi.fn() }));
vi.mock("@/lib/backend", () => ({ backendRequest: backendRequestMock }));

const overview = {
  resourceCount: 12,
  staleResourceCount: 2,
  workspaceCount: 2,
  providers: [{ key: "aws", count: 8 }, { key: "azure", count: 4 }],
  services: [{ key: "ec2", count: 5 }, { key: "storage", count: 4 }],
  regions: [{ key: "eu-west-1", count: 7 }, { key: "global", count: 5 }],
  inventoryRuns: [{ runId: "run-1", scopeId: "aws:sandbox", provider: "aws", profileId: "sandbox", startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), status: "completed", resourceCount: 8, edgeCount: 1 }],
};

describe("CloudOverviewView", () => {
  beforeEach(() => {
    backendRequestMock.mockReset();
    backendRequestMock.mockImplementation(async (method: string) => {
      if (method === "overview.get") return overview;
      if (method === "inventory.refresh") return overview.inventoryRuns[0];
      throw new Error(`Unexpected method: ${method}`);
    });
  });

  it("renders provider, service, region and freshness summaries", async () => {
    render(<ThemeProvider><CloudOverviewView canIndexCurrentWorkspace onOpenResources={vi.fn()} /></ThemeProvider>);

    expect(await screen.findByText("Provider footprint")).toBeInTheDocument();
    expect(screen.getByText("Services")).toBeInTheDocument();
    expect(screen.getByText("Regional footprint")).toBeInTheDocument();
    expect(screen.getByText("Inventory freshness")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
  });

  it("opens the resource explorer", async () => {
    const onOpenResources = vi.fn();
    render(<ThemeProvider><CloudOverviewView canIndexCurrentWorkspace onOpenResources={onOpenResources} /></ThemeProvider>);
    await screen.findByText("Provider footprint");

    fireEvent.click(screen.getByRole("button", { name: "Explore resources" }));
    expect(onOpenResources).toHaveBeenCalledOnce();
  });

  it("indexes the current workspace and refreshes the overview", async () => {
    render(<ThemeProvider><CloudOverviewView canIndexCurrentWorkspace onOpenResources={vi.fn()} /></ThemeProvider>);
    await screen.findByText("Provider footprint");

    fireEvent.click(screen.getByRole("button", { name: "Index open workspace" }));
    await waitFor(() => expect(backendRequestMock).toHaveBeenCalledWith("inventory.refresh"));
    await waitFor(() => expect(backendRequestMock.mock.calls.filter(([method]) => method === "overview.get").length).toBeGreaterThan(1));
  });
});
