// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppProviders } from "@/components/app-providers";
import { cancelDeployment, getRecipe, listDeployments } from "@/lib/backend";
import { __getNotifications, __resetNotifications } from "@/lib/notify";
import type { Deployment } from "@/types/backend";

import DeployView from "./DeployView";

vi.mock("@/lib/backend", () => {
  const beginnerRecipe = {
    manifest: {
      apiVersion: "cloudsprocket.recipe/v1",
      id: "lab-dynamodb-aws",
      version: "0.1.0",
      name: "DynamoDB lab (AWS)",
      summary: "A beginner DynamoDB lab.",
      kind: "service-lab",
      providers: ["aws"],
      engine: { type: "opentofu" },
      local: { runtimes: [{ id: "localstack" }] },
    },
    variables: [],
    outputs: [],
  };
  return {
    applyDeployment: vi.fn(),
    cancelDeployment: vi.fn(),
    checkDeploymentDrift: vi.fn(),
    deleteDeployment: vi.fn(),
    destroyDeployment: vi.fn(),
    getRecipe: vi.fn(async () => beginnerRecipe),
    getTofuStatus: vi.fn(async () => ({
      available: true,
      version: "1.10.0",
      path: "tofu",
    })),
    installTofu: vi.fn(),
    listDeployments: vi.fn(async () => []),
    listRecipes: vi.fn(async () => [beginnerRecipe.manifest]),
    planDeployment: vi.fn(),
    retryPostApplyDeployment: vi.fn(),
    subscribeToBackendEvent: vi.fn(async () => () => undefined),
  };
});

function applyingDeployment(): Deployment {
  return {
    id: "dep-apply-1",
    recipeId: "lab-dynamodb-aws",
    name: "DynamoDB lab run",
    providerId: "aws",
    profileId: "",
    local: true,
    runtimeId: "localstack",
    status: "applying",
    createdAt: "2026-08-13T00:00:00Z",
    updatedAt: "2026-08-13T00:00:00Z",
    variables: {},
    outputs: [],
  };
}

describe("DeployView", () => {
  beforeEach(() => {
    sessionStorage.clear();
    __resetNotifications();
    vi.mocked(listDeployments).mockResolvedValue([]);
    vi.mocked(cancelDeployment).mockReset();
  });

  it("opens an onboarding recipe deep link once", async () => {
    const onInitialRecipeOpened = vi.fn();
    render(
      <StrictMode>
        <AppProviders>
          <DeployView profiles={[]} initialRecipeId="lab-dynamodb-aws" onInitialRecipeOpened={onInitialRecipeOpened} />
        </AppProviders>
      </StrictMode>,
    );

    expect(await screen.findByRole("heading", { name: "DynamoDB lab (AWS)" })).toBeInTheDocument();
    expect(getRecipe).toHaveBeenCalledOnce();
    expect(getRecipe).toHaveBeenCalledWith("lab-dynamodb-aws");
    await waitFor(() => expect(onInitialRecipeOpened).toHaveBeenCalledOnce());
  });

  it("keeps the deep link armed when the recipe load fails, so a revisit can retry", async () => {
    const onInitialRecipeOpened = vi.fn();
    vi.mocked(getRecipe).mockRejectedValueOnce(new Error("daemon unavailable"));
    render(
      <StrictMode>
        <AppProviders>
          <DeployView profiles={[]} initialRecipeId="lab-dynamodb-aws" onInitialRecipeOpened={onInitialRecipeOpened} />
        </AppProviders>
      </StrictMode>,
    );

    await waitFor(() => expect(getRecipe).toHaveBeenCalled());
    // The failure must not consume the one-shot id; the parent keeps it for retry.
    await waitFor(() => expect(screen.queryByRole("heading", { name: "DynamoDB lab (AWS)" })).not.toBeInTheDocument());
    expect(onInitialRecipeOpened).not.toHaveBeenCalled();
  });

  it("does not mark status cancelled when stop RPC fails", async () => {
    vi.mocked(listDeployments).mockResolvedValue([applyingDeployment()]);
    vi.mocked(cancelDeployment).mockRejectedValue(new Error("rpc failed"));

    render(
      <StrictMode>
        <AppProviders>
          <DeployView profiles={[]} />
        </AppProviders>
      </StrictMode>,
    );

    fireEvent.click(await screen.findByRole("button", { name: /DynamoDB lab run/ }));
    expect(await screen.findByRole("button", { name: "Stop" })).toBeInTheDocument();
    expect(screen.getByText("applying")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Stop" }));

    await waitFor(() => {
      expect(cancelDeployment).toHaveBeenCalledWith("dep-apply-1");
    });
    await waitFor(() => {
      expect(__getNotifications().records.some((record) => record.title === "Could not stop deployment")).toBe(true);
    });
    expect(screen.getByText("applying")).toBeInTheDocument();
    expect(screen.queryByText("cancelled")).not.toBeInTheDocument();
    expect(__getNotifications().records.some((record) => record.title === "Stopped")).toBe(false);
  });
});
