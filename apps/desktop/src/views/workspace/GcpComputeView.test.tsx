// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WRITE_MODE_REQUIRED_REASON } from "@/lib/action-capabilities";
import { ThemeProvider } from "@/lib/theme";
import GcpComputeView from "./GcpComputeView";
import type { WorkspaceSnapshot } from "@/types/backend";

const workspace = {
  profile: {
    displayName: "platform",
    attributes: [{ label: "Project", value: "platform-prod" }],
  },
  gcpWriteCapable: true,
  gcpWriteModeEnabled: true,
  gcpWritesEnabled: true,
  actionCapabilities: {
    compute: [
      { actionId: "startInstance", label: "Start instance", enabled: true },
      { actionId: "stopInstance", label: "Stop instance", enabled: true },
    ],
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

  it("starts a stopped instance and stops a running instance when write mode is on", () => {
    const onStart = vi.fn();
    const onStop = vi.fn();
    render(
      <ThemeProvider>
        <GcpComputeView
          workspace={workspace}
          onRefresh={vi.fn()}
          onStartInstance={onStart}
          onStopInstance={onStop}
        />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByText("batch-1"));
    fireEvent.click(screen.getByRole("button", { name: /^start$/i }));
    fireEvent.click(screen.getByRole("button", { name: "Start instance" }));
    expect(onStart).toHaveBeenCalledWith("batch-1", "europe-west1-b");

    fireEvent.click(screen.getByText("web-1"));
    fireEvent.click(screen.getByRole("button", { name: /^stop$/i }));
    fireEvent.click(screen.getByRole("button", { name: "Stop instance" }));
    expect(onStop).toHaveBeenCalledWith("web-1", "us-central1-a");
  });

  it("disables start and stop when write mode is off", () => {
    const readOnly = {
      ...workspace,
      gcpWriteModeEnabled: false,
      gcpWritesEnabled: false,
      actionCapabilities: {
        compute: [
          {
            actionId: "startInstance",
            label: "Start instance",
            enabled: false,
            reason: WRITE_MODE_REQUIRED_REASON,
          },
          {
            actionId: "stopInstance",
            label: "Stop instance",
            enabled: false,
            reason: WRITE_MODE_REQUIRED_REASON,
          },
        ],
      },
    } as unknown as WorkspaceSnapshot;

    render(
      <ThemeProvider>
        <GcpComputeView
          workspace={readOnly}
          onRefresh={vi.fn()}
          onStartInstance={vi.fn()}
          onStopInstance={vi.fn()}
        />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByText("batch-1"));
    const start = screen.getByRole("button", { name: /^start$/i });
    expect(start).toBeDisabled();
    expect(start.getAttribute("title") ?? "").toMatch(/write mode/i);

    fireEvent.click(screen.getByText("web-1"));
    const stop = screen.getByRole("button", { name: /^stop$/i });
    expect(stop).toBeDisabled();
    expect(stop.getAttribute("title") ?? "").toMatch(/write mode/i);
  });

  it("shows an empty-state when no instances are loaded", () => {
    const empty = {
      profile: workspace.profile,
      gcpComputeInstances: [],
      gcpWritesEnabled: false,
    } as unknown as WorkspaceSnapshot;

    render(
      <ThemeProvider>
        <GcpComputeView workspace={empty} onRefresh={vi.fn()} />
      </ThemeProvider>,
    );

    expect(screen.getByText("No instances in this project")).toBeTruthy();
    expect(screen.getByText(/Google Cloud console or with gcloud/i)).toBeTruthy();
  });
});
