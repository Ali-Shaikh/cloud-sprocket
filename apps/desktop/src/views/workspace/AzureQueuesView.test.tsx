// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/lib/theme";
import AzureQueuesView from "./AzureQueuesView";
import type { WorkspaceSnapshot } from "@/types/backend";

const workspace = {
  profile: { displayName: "floci-az" },
  azureStorageAccounts: [{ name: "devstoreaccount1" }],
  azureStorageQueues: [{ name: "jobs" }, { name: "events" }],
  azureQueueMessages: [{ id: "msg-1", text: "process order 42", dequeueCount: 0, insertionTime: "2026-06-21T10:00:00Z" }],
  selectedAzureStorageAccount: "devstoreaccount1",
  selectedAzureQueue: "jobs",
  azureQueuesStatusMessage: "Loaded 2 queue(s).",
} as unknown as WorkspaceSnapshot;

describe("AzureQueuesView", () => {
  it("lists queues, peeks messages, and selects a queue", () => {
    const onSelectQueue = vi.fn();
    render(
      <ThemeProvider>
        <AzureQueuesView workspace={workspace} onSelectAccount={() => {}} onSelectQueue={onSelectQueue} />
      </ThemeProvider>,
    );

    expect(screen.getByText("events")).toBeTruthy();
    expect(screen.getByText("process order 42")).toBeTruthy();

    fireEvent.click(screen.getByText("events"));
    expect(onSelectQueue).toHaveBeenCalledWith("events");
  });
});
