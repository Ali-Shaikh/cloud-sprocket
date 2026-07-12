// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { describe, expect, it, vi } from "vitest";

import { AppProviders } from "@/components/app-providers";
import { getRecipe } from "@/lib/backend";

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

describe("DeployView", () => {
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
});
