// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/lib/theme";
import GcpFunctionsView from "./GcpFunctionsView";
import type { WorkspaceSnapshot } from "@/types/backend";

const workspace = {
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
} as unknown as WorkspaceSnapshot;

describe("GcpFunctionsView", () => {
  it("lists functions and filters by name", () => {
    const onRefresh = vi.fn();
    render(
      <ThemeProvider>
        <GcpFunctionsView workspace={workspace} onRefresh={onRefresh} />
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
});
