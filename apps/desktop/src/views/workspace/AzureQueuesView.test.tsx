// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AZURE_QUEUE_MESSAGE_MAX_BYTES } from "@/lib/azure-queue-message";

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

  it("sends a message when write mode allows it", async () => {
    const onSendMessage = vi.fn();
    const writeWorkspace = {
      ...workspace,
      actionCapabilities: {
        queues: [{ actionId: "sendMessage", label: "Send message", enabled: true }],
      },
    } as unknown as WorkspaceSnapshot;

    render(
      <ThemeProvider>
        <AzureQueuesView
          workspace={writeWorkspace}
          onSelectAccount={() => {}}
          onSelectQueue={() => {}}
          onSendMessage={onSendMessage}
        />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    const dialog = screen.getByRole("alertdialog");
    fireEvent.change(within(dialog).getByLabelText("Queue message text"), {
      target: { value: "process order 42" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Send message" }));
    expect(onSendMessage).toHaveBeenCalledWith("devstoreaccount1", "jobs", "process order 42");
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    });
  });

  it("keeps the draft when send fails", async () => {
    const onSendMessage = vi.fn(async () => false);
    const writeWorkspace = {
      ...workspace,
      actionCapabilities: {
        queues: [{ actionId: "sendMessage", label: "Send message", enabled: true }],
      },
    } as unknown as WorkspaceSnapshot;

    render(
      <ThemeProvider>
        <AzureQueuesView
          workspace={writeWorkspace}
          onSelectAccount={() => {}}
          onSelectQueue={() => {}}
          onSendMessage={onSendMessage}
        />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    const dialog = screen.getByRole("alertdialog");
    fireEvent.change(within(dialog).getByLabelText("Queue message text"), {
      target: { value: "process order 42" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Send message" }));
    await waitFor(() => {
      expect(onSendMessage).toHaveBeenCalledWith("devstoreaccount1", "jobs", "process order 42");
    });
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Queue message text")).toHaveValue("process order 42");
  });

  it("does not send an oversized message", () => {
    const onSendMessage = vi.fn();
    const writeWorkspace = {
      ...workspace,
      actionCapabilities: {
        queues: [{ actionId: "sendMessage", label: "Send message", enabled: true }],
      },
    } as unknown as WorkspaceSnapshot;

    render(
      <ThemeProvider>
        <AzureQueuesView
          workspace={writeWorkspace}
          onSelectAccount={() => {}}
          onSelectQueue={() => {}}
          onSendMessage={onSendMessage}
        />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    const dialog = screen.getByRole("alertdialog");
    fireEvent.change(within(dialog).getByLabelText("Queue message text"), {
      target: { value: "x".repeat(AZURE_QUEUE_MESSAGE_MAX_BYTES + 1) },
    });
    expect(within(dialog).getByRole("button", { name: "Send message" })).toBeDisabled();
    expect(onSendMessage).not.toHaveBeenCalled();
  });

  it("disables send when write mode is off", () => {
    const writeWorkspace = {
      ...workspace,
      actionCapabilities: {
        queues: [
          {
            actionId: "sendMessage",
            label: "Send message",
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
          onSendMessage={() => {}}
        />
      </ThemeProvider>,
    );

    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
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
