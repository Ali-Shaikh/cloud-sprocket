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
});
