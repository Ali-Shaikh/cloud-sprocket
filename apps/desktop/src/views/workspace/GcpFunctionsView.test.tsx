// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/lib/theme";
import GcpFunctionsView from "./GcpFunctionsView";
import type { WorkspaceSnapshot } from "@/types/backend";

const baseWorkspace = {
  profile: {
    displayName: "platform",
    attributes: [{ label: "Project", value: "platform-prod" }],
  },
  gcpFunctions: [
    {
      name: "hello-http",
      region: "us-central1",
      runtime: "nodejs20",
      status: "ACTIVE",
      generation: "2nd gen",
      trigger: "HTTPS",
    },
    {
      name: "process-upload",
      region: "europe-west1",
      runtime: "python311",
      status: "ACTIVE",
      generation: "1st gen",
      trigger: "google.storage.object.finalize",
    },
  ],
  gcpFunctionsStatusMessage: "Loaded 2 Cloud Function(s) via gcloud.",
  actionCapabilities: {
    functions: [
      {
        actionId: "invoke",
        label: "Invoke function",
        enabled: false,
        reason: "Turn on write mode from the top bar to run mutating actions.",
      },
    ],
  },
  gcpWritesEnabled: false,
} as unknown as WorkspaceSnapshot;

describe("GcpFunctionsView", () => {
  it("lists functions and filters by name", () => {
    const onRefresh = vi.fn();
    render(
      <ThemeProvider>
        <GcpFunctionsView workspace={baseWorkspace} onRefresh={onRefresh} />
      </ThemeProvider>,
    );

    expect(screen.getByText("hello-http")).toBeTruthy();
    expect(screen.getByText("process-upload")).toBeTruthy();
    expect(screen.getByText(/project platform-prod/i)).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Filter Cloud Functions"), {
      target: { value: "hello" },
    });
    expect(screen.getByText("hello-http")).toBeTruthy();
    expect(screen.queryByText("process-upload")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /refresh/i }));
    expect(onRefresh).toHaveBeenCalled();
  });

  it("selects a function and invokes when write mode is enabled", async () => {
    const onSelectFunction = vi.fn();
    const onInvoke = vi.fn().mockResolvedValue({
      name: "hello-http",
      region: "us-central1",
      generation: "2nd gen",
      body: '{"ok":true}',
    });
    const writable = {
      ...baseWorkspace,
      selectedGcpFunction: "us-central1/hello-http",
      gcpWritesEnabled: true,
      actionCapabilities: {
        functions: [{ actionId: "invoke", label: "Invoke function", enabled: true }],
      },
    } as unknown as WorkspaceSnapshot;

    render(
      <ThemeProvider>
        <GcpFunctionsView
          workspace={writable}
          onRefresh={() => {}}
          onSelectFunction={onSelectFunction}
          onInvoke={onInvoke}
        />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByText("hello-http"));
    expect(onSelectFunction).toHaveBeenCalledWith(
      "us-central1/hello-http",
      "hello-http",
      "us-central1",
    );

    fireEvent.click(screen.getByRole("button", { name: /^invoke$/i }));
    await waitFor(() => {
      expect(onInvoke).toHaveBeenCalled();
    });
    expect(onInvoke.mock.calls[0][0]).toBe("hello-http");
    expect(onInvoke.mock.calls[0][1]).toBe("us-central1");
    expect(onInvoke.mock.calls[0][2]).toBe("2nd gen");
    await waitFor(() => {
      expect(screen.getByText(/"ok":true/)).toBeTruthy();
    });
  });
});
