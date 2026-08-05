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

  it("purges a queue when write mode allows it", () => {
    const onPurgeQueue = vi.fn();
    const writeWorkspace = {
      ...workspace,
      actionCapabilities: {
        queues: [{ actionId: "purge", label: "Purge queue", enabled: true }],
      },
    } as unknown as WorkspaceSnapshot;

    render(
      <ThemeProvider>
        <AzureQueuesView
          workspace={writeWorkspace}
          onSelectAccount={() => {}}
          onSelectQueue={() => {}}
          onPurgeQueue={onPurgeQueue}
        />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Purge queue" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Purge queue" }));
    expect(onPurgeQueue).toHaveBeenCalledWith("devstoreaccount1", "jobs");
  });

  it("disables purge when write mode is off", () => {
    const writeWorkspace = {
      ...workspace,
      actionCapabilities: {
        queues: [
          {
            actionId: "purge",
            label: "Purge queue",
            enabled: false,
            reason: "Turn on write mode from the top bar to run mutating actions.",
          },
        ],
      },
    } as unknown as WorkspaceSnapshot;

    render(
      <ThemeProvider>
        <AzureQueuesView
          workspace={writeWorkspace}
          onSelectAccount={() => {}}
          onSelectQueue={() => {}}
          onPurgeQueue={vi.fn()}
        />
      </ThemeProvider>,
    );

    expect(screen.getByRole("button", { name: "Purge queue" })).toBeDisabled();
  });
});
