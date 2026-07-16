// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/lib/theme";
import type { RecipeManifest } from "@/types/backend";

import { licensedRuntimeTooltip, RecipeCard } from "./recipe-card";

const manifest: RecipeManifest = {
  apiVersion: "cloudsprocket.dev/v1alpha1",
  id: "pro-recipe",
  version: "1.0.0",
  name: "Pro recipe",
  summary: "A licensed runtime recipe",
  kind: "app-deploy",
  providers: ["aws"],
  tags: [],
  engine: { type: "opentofu" },
  local: { runtimes: [{ id: "localstack", requiresPro: true }] },
  superpowers: { iamPolicyStream: true },
};

describe("RecipeCard", () => {
  it("explains the licensed runtime and omits parked superpower badges", () => {
    render(
      <ThemeProvider>
        <RecipeCard manifest={manifest} onConfigure={vi.fn()} />
      </ThemeProvider>,
    );

    expect(screen.queryByText("IAM")).not.toBeInTheDocument();
    expect(screen.getByText("Licensed runtime")).toBeInTheDocument();
    expect(licensedRuntimeTooltip(manifest)).toBe(
      "Runs locally on LocalStack (licence required)",
    );
  });

  it("badges cloud-only Azure recipes", () => {
    const cloudOnly: RecipeManifest = {
      apiVersion: "cloudsprocket.recipe/v1",
      id: "lab-functions-http-azure",
      version: "0.1.1",
      name: "Azure Functions lab (HTTP)",
      summary: "Cloud only",
      kind: "service-lab",
      providers: ["azure"],
      tags: ["cloud-azure"],
      engine: { type: "opentofu", minVersion: "1.6.0" },
      local: { runtimes: [] },
    };
    render(
      <ThemeProvider>
        <RecipeCard manifest={cloudOnly} onConfigure={vi.fn()} />
      </ThemeProvider>,
    );
    expect(screen.getByText("Cloud Azure")).toBeInTheDocument();
  });

  it("badges local floci-az run targets so users know where to run", () => {
    const localAzure: RecipeManifest = {
      apiVersion: "cloudsprocket.recipe/v1",
      id: "lab-storage-blobs-azure",
      version: "0.1.0",
      name: "Azure Storage blobs lab",
      summary: "Local dry-run",
      kind: "service-lab",
      providers: ["azure"],
      tags: ["azure", "storage"],
      engine: { type: "opentofu", minVersion: "1.6.0" },
      local: { runtimes: [{ id: "floci-az" }] },
    };
    render(
      <ThemeProvider>
        <RecipeCard manifest={localAzure} onConfigure={vi.fn()} />
      </ThemeProvider>,
    );
    expect(screen.getByText("floci-az")).toBeInTheDocument();
    expect(screen.queryByText("Cloud Azure")).not.toBeInTheDocument();
  });
});
