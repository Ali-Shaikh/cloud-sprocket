// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { describe, expect, it } from "vitest";

import type { RecipeManifest } from "@/types/backend";

import {
  filterGalleryRecipes,
  galleryProviderOptions,
  galleryRuntimeOptions,
  inferRecipeKind,
} from "./deploy-gallery-filter";

function manifest(partial: Partial<RecipeManifest> & Pick<RecipeManifest, "id" | "name">): RecipeManifest {
  return {
    apiVersion: "cloudsprocket.recipe/v1",
    version: "0.1.0",
    engine: { type: "opentofu", minVersion: "1.6.0" },
    providers: ["aws"],
    ...partial,
  };
}

describe("deploy-gallery-filter", () => {
  const recipes: RecipeManifest[] = [
    manifest({
      id: "async-app-aws",
      name: "Async app",
      kind: "app-deploy",
      tags: ["async"],
      local: { runtimes: [{ id: "localstack" }] },
    }),
    manifest({
      id: "lab-queue-worker-aws",
      name: "Queue worker lab",
      kind: "service-lab",
      local: { runtimes: [{ id: "localstack" }] },
    }),
    manifest({
      id: "lab-postgres-flexible-azure",
      name: "Postgres lab",
      kind: "service-lab",
      providers: ["azure"],
      local: { runtimes: [{ id: "floci-az" }] },
    }),
  ];

  it("infers service-lab kind from id prefix", () => {
    expect(inferRecipeKind(manifest({ id: "lab-secrets-aws", name: "Secrets" }))).toBe("service-lab");
  });

  it("filters by section, provider, runtime, and query", () => {
    const filtered = filterGalleryRecipes(recipes, {
      section: "service-lab",
      scenario: "all",
      query: "postgres",
      provider: "azure",
      runtime: "floci-az",
    });
    expect(filtered.map((entry) => entry.id)).toEqual(["lab-postgres-flexible-azure"]);
  });

  it("lists provider and runtime facet options", () => {
    expect(galleryProviderOptions(recipes)).toEqual(["aws", "azure"]);
    expect(galleryRuntimeOptions(recipes)).toEqual(["floci-az", "localstack"]);
  });
});