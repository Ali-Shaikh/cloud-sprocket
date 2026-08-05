// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { fireEvent, render, screen } from "@testing-library/react";
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
  gcpGkeStatusMessage: "Loaded 2 GKE cluster(s) via gcloud.",
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
});
