// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/lib/theme";
import type { IndexedResource } from "@/types/backend";
import ResourcesView from "./ResourcesView";

const resources: IndexedResource[] = [
  {
    id: "aws://aws%3Asandbox/us-east-1/ec2/instance/i-123",
    scopeId: "aws:sandbox",
    provider: "aws",
    accountId: "123456789012",
    region: "us-east-1",
    service: "ec2",
    type: "instance",
    name: "payments-api",
    status: "running",
    tags: { Environment: "production" },
    attributes: { instanceType: "t3.small" },
    lastSeenAt: "2026-06-22T08:00:00Z",
    stale: false,
    inventoryRunId: "run-1",
  },
  {
    id: "azure://azure%3Asub-1/uaenorth/storage/storage-account/appdata",
    scopeId: "azure:sub-1",
    provider: "azure",
    accountId: "sub-1",
    region: "uaenorth",
    service: "storage",
    type: "storage-account",
    name: "appdata",
    lastSeenAt: "2026-06-22T07:00:00Z",
    stale: false,
    inventoryRunId: "run-2",
  },
];

const { backendRequestMock } = vi.hoisted(() => ({ backendRequestMock: vi.fn() }));

vi.mock("@/lib/backend", () => ({ backendRequest: backendRequestMock }));

function renderView() {
  render(
    <ThemeProvider>
      <ResourcesView currentScopeId="aws:sandbox" currentWorkspaceLabel="AWS sandbox" />
    </ThemeProvider>,
  );
}

describe("ResourcesView", () => {
  beforeEach(() => {
    backendRequestMock.mockReset();
    backendRequestMock.mockImplementation(async (method: string, params: Record<string, unknown> = {}) => {
      if (method === "inventory.status") {
        return [{ runId: "run-1", scopeId: "aws:sandbox", provider: "aws", profileId: "sandbox", startedAt: "2026-06-22T08:00:00Z", completedAt: "2026-06-22T08:00:00Z", status: "completed", resourceCount: 1, edgeCount: 0 }];
      }
      if (method === "inventory.refresh") {
        return { runId: "run-3", scopeId: "aws:sandbox", provider: "aws", profileId: "sandbox", startedAt: "2026-06-22T09:00:00Z", status: "completed", resourceCount: 1, edgeCount: 0 };
      }
      if (method === "resources.list") {
        const filtered = resources.filter((resource) =>
          (!params.scopeId || resource.scopeId === params.scopeId) &&
          (!params.provider || resource.provider === params.provider) &&
          (!params.service || resource.service === params.service) &&
          (!params.query || `${resource.name} ${resource.id}`.toLowerCase().includes(String(params.query).toLowerCase())),
        );
        return { resources: filtered, total: filtered.length, limit: 25, offset: 0 };
      }
      throw new Error(`Unexpected method: ${method}`);
    });
  });

  it("lists indexed resources and opens resource details", async () => {
    renderView();

    expect(await screen.findByText("payments-api")).toBeInTheDocument();
    fireEvent.click(screen.getByText("payments-api"));

    const details = await screen.findByRole("dialog");
    expect(within(details).getByText("t3.small")).toBeInTheDocument();
    expect(within(details).getByText("production")).toBeInTheDocument();
  });

  it("searches globally across indexed workspaces", async () => {
    renderView();
    await screen.findByText("payments-api");

    fireEvent.change(screen.getByLabelText("Search resources"), { target: { value: "appdata" } });

    expect(await screen.findByText("appdata")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("payments-api")).not.toBeInTheDocument());
  });

  it("indexes the open workspace and reloads the resource list", async () => {
    renderView();
    await screen.findByText("payments-api");

    fireEvent.click(screen.getByRole("button", { name: "Index open workspace" }));

    await waitFor(() => expect(backendRequestMock).toHaveBeenCalledWith("inventory.refresh"));
    await waitFor(() => expect(backendRequestMock.mock.calls.filter(([method]) => method === "resources.list").length).toBeGreaterThan(1));
  });
});
