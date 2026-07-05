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
  it("fetches immediately when the virtualisation tab is active", async () => {
    const refresh = vi.fn().mockResolvedValue(null);

    renderHook(() => useVirtualisationPoll("virtualisation", refresh), { wrapper });

    await waitFor(() => {
      expect(refresh).toHaveBeenCalledTimes(1);
    });
  });

  it("does not fetch when another tab is active", async () => {
    const refresh = vi.fn().mockResolvedValue(null);

    renderHook(() => useVirtualisationPoll("overview", refresh), { wrapper });

    await waitFor(() => {
      expect(refresh).not.toHaveBeenCalled();
    });
  });
});