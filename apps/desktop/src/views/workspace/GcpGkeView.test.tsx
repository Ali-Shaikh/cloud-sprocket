// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/lib/theme";
import GcpGkeView from "./GcpGkeView";
import type { WorkspaceSnapshot } from "@/types/backend";

const workspace = {
  profile: {
    displayName: "platform",
    attributes: [{ label: "Project", value: "platform-prod" }],
  },
  gcpGkeClusters: [
    {
      name: "prod-gke",
      location: "us-central1",
      status: "RUNNING",
      masterVersion: "1.29.4-gke.1043002",
      nodeCount: 3,
      mode: "Autopilot",
    },
    {
      name: "dev-gke",
      location: "europe-west1-b",
      status: "RUNNING",
      masterVersion: "1.28.11-gke.1019001",
      nodeCount: 2,
      mode: "Standard",
    },
  ],
  gcpGkeNodePools: [
    {
      name: "default-pool",
      status: "RUNNING",
      machineType: "e2-medium",
      initialNodeCount: 2,
      version: "1.28.11-gke.1019001",
    },
  ],
  selectedGcpGkeCluster: "dev-gke",
  gcpGkeStatusMessage: "Loaded 1 node pool(s) for cluster dev-gke.",
} as unknown as WorkspaceSnapshot;

describe("GcpGkeView", () => {
  it("lists clusters and filters by name", () => {
    const onRefresh = vi.fn();
    render(
      <ThemeProvider>
        <GcpGkeView workspace={workspace} onRefresh={onRefresh} />
      </ThemeProvider>,
    );

    expect(screen.getByText("prod-gke")).toBeTruthy();
    expect(screen.getByText("dev-gke")).toBeTruthy();
    expect(screen.getByText(/project platform-prod/i)).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Filter GKE clusters"), {
      target: { value: "prod" },
    });
    expect(screen.getByText("prod-gke")).toBeTruthy();
    expect(screen.queryByText("dev-gke")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /refresh/i }));
    expect(onRefresh).toHaveBeenCalled();
  });

  it("selects a cluster and shows node pools for the selection", () => {
    const onSelectCluster = vi.fn();
    render(
      <ThemeProvider>
        <GcpGkeView
          workspace={workspace}
          onRefresh={vi.fn()}
          onSelectCluster={onSelectCluster}
        />
      </ThemeProvider>,
    );

    expect(screen.getByText("default-pool")).toBeTruthy();
    expect(screen.getByText("e2-medium")).toBeTruthy();

    fireEvent.click(screen.getByText("prod-gke"));
    expect(onSelectCluster).toHaveBeenCalledWith("prod-gke", "us-central1");
  });

  it("requires write mode and confirms the kubeconfig context switch", async () => {
    const onGetCredentials = vi.fn().mockResolvedValue(undefined);
    const view = (snapshot: WorkspaceSnapshot) => (
      <ThemeProvider>
        <GcpGkeView
          workspace={snapshot}
          onRefresh={vi.fn()}
          onGetCredentials={onGetCredentials}
        />
      </ThemeProvider>
    );
    const { rerender } = render(view(workspace));
    expect(
      screen.getByRole("button", { name: "Get credentials" }),
    ).toBeDisabled();
    rerender(view({ ...workspace, gcpWritesEnabled: true }));
    fireEvent.click(screen.getByRole("button", { name: "Get credentials" }));

    const dialog = within(screen.getByRole("alertdialog"));
    expect(
      dialog.getByText(/switch the current kubectl context/i),
    ).toBeVisible();
    expect(dialog.getByText("europe-west1-b")).toBeVisible();
    expect(onGetCredentials).not.toHaveBeenCalled();
    fireEvent.click(dialog.getByRole("button", { name: "Update kubeconfig" }));
    expect(onGetCredentials).toHaveBeenCalledExactlyOnceWith(
      "dev-gke",
      "europe-west1-b",
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Get credentials" }),
      ).toBeEnabled(),
    );
  });

  it("shows an empty-state when no clusters are loaded", () => {
    const empty = {
      profile: workspace.profile,
      gcpGkeClusters: [],
    } as unknown as WorkspaceSnapshot;

    render(
      <ThemeProvider>
        <GcpGkeView workspace={empty} onRefresh={vi.fn()} />
      </ThemeProvider>,
    );

    expect(screen.getByText("No clusters in this project")).toBeTruthy();
    expect(screen.getByText(/Create a GKE cluster/i)).toBeTruthy();
  });
});
