// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createTestQueryClient } from "@/lib/query-client";

import { useVirtualisationPoll } from "./use-virtualisation-poll";

function wrapper({ children }: { children: React.ReactNode }) {
  const client = createTestQueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useVirtualisationPoll", () => {
  it("fetches status immediately when the virtualisation tab is active", async () => {
    const refreshStatus = vi.fn().mockResolvedValue(null);

    renderHook(() => useVirtualisationPoll("virtualisation", refreshStatus), { wrapper });

    await waitFor(() => {
      expect(refreshStatus).toHaveBeenCalledTimes(1);
    });
  });

  it("does not fetch when another tab is active", async () => {
    const refreshStatus = vi.fn().mockResolvedValue(null);

    renderHook(() => useVirtualisationPoll("overview", refreshStatus), { wrapper });

    await waitFor(() => {
      expect(refreshStatus).not.toHaveBeenCalled();
    });
  });

  it("loads logs once when entering the virtualisation tab", async () => {
    const refreshStatus = vi.fn().mockResolvedValue(null);
    const refreshLogsOnEnter = vi.fn().mockResolvedValue(null);

    const { rerender } = renderHook(
      ({ tabId }: { tabId: string }) => useVirtualisationPoll(tabId, refreshStatus, refreshLogsOnEnter),
      { wrapper, initialProps: { tabId: "overview" } },
    );

    expect(refreshLogsOnEnter).not.toHaveBeenCalled();

    rerender({ tabId: "virtualisation" });

    await waitFor(() => {
      expect(refreshLogsOnEnter).toHaveBeenCalledTimes(1);
    });

    rerender({ tabId: "virtualisation" });
    await waitFor(() => {
      expect(refreshStatus).toHaveBeenCalled();
    });
    expect(refreshLogsOnEnter).toHaveBeenCalledTimes(1);

    rerender({ tabId: "overview" });
    rerender({ tabId: "virtualisation" });

    await waitFor(() => {
      expect(refreshLogsOnEnter).toHaveBeenCalledTimes(2);
    });
  });
});
