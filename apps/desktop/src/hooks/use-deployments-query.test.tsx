// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { listDeployments } from "@/lib/backend";
import { createTestQueryClient } from "@/lib/query-client";
import type { Deployment } from "@/types/backend";

import { useDeploymentsQuery } from "./use-deployments-query";

vi.mock("@/lib/backend", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/backend")>();
  return {
    ...actual,
    listDeployments: vi.fn(),
    subscribeToBackendEvent: vi.fn().mockResolvedValue(() => undefined),
  };
});

function wrapper({ children }: { children: React.ReactNode }) {
  const client = createTestQueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const deploymentFixture: Deployment = {
  id: "dep-1",
  recipeId: "lab-s3",
  name: "lab-s3",
  providerId: "aws",
  profileId: "sandbox",
  local: true,
  status: "planned",
  createdAt: "2026-07-05T00:00:00Z",
  updatedAt: "2026-07-05T00:00:00Z",
  variables: {},
  outputs: [],
};

describe("useDeploymentsQuery", () => {
  beforeEach(() => {
    vi.mocked(listDeployments).mockResolvedValue([deploymentFixture]);
  });

  it("loads deployments through react-query", async () => {
    const { result } = renderHook(() => useDeploymentsQuery(), { wrapper });

    await waitFor(() => {
      expect(result.current.data).toEqual([deploymentFixture]);
    });
    expect(listDeployments).toHaveBeenCalledTimes(1);
  });
});