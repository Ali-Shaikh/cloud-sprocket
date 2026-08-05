// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/lib/theme";
import GcpComputeView from "./GcpComputeView";
import type { WorkspaceSnapshot } from "@/types/backend";

const workspace = {
  profile: {
    displayName: "platform",
    attributes: [{ label: "Project", value: "platform-prod" }],
  },
  gcpComputeInstances: [
    {
      name: "web-1",
      zone: "us-central1-a",
      machineType: "e2-micro",
      status: "RUNNING",
      internalIp: "10.0.0.2",
      externalIp: "203.0.113.5",
    },
    {
      name: "batch-1",
      zone: "europe-west1-b",
      machineType: "e2-standard-2",
      status: "TERMINATED",
      internalIp: "10.0.0.3",
    },
  ],
  gcpComputeStatusMessage: "Loaded 2 Compute Engine instance(s) via gcloud.",
} as unknown as WorkspaceSnapshot;

describe("GcpComputeView", () => {
  it("lists instances and filters by name", () => {
    const onRefresh = vi.fn();
    render(
      <ThemeProvider>
        <GcpComputeView workspace={workspace} onRefresh={onRefresh} />
      </ThemeProvider>,
    );

    expect(screen.getByText("web-1")).toBeTruthy();
    expect(screen.getByText("batch-1")).toBeTruthy();
    expect(screen.getByText(/project platform-prod/i)).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Filter Compute Engine instances"), {
      target: { value: "web" },
    });
    expect(screen.getByText("web-1")).toBeTruthy();
    expect(screen.queryByText("batch-1")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /refresh/i }));
    expect(onRefresh).toHaveBeenCalled();
  });
});
