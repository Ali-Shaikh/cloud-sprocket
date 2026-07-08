// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import type { RecipeManifest } from "@/types/backend";

export type GallerySection = "app-deploy" | "service-lab";

export type GalleryFilters = {
  section: GallerySection;
  scenario: string;
  query: string;
  provider: string;
  runtime: string;
};

export const GALLERY_PROVIDER_ALL = "all";
export const GALLERY_RUNTIME_ALL = "all";

export function inferRecipeKind(manifest: RecipeManifest): GallerySection {
  if (manifest.kind) {
    return manifest.kind;
  }
  if (manifest.id.startsWith("lab-") || manifest.id === "scheduled-job-aws") {
    return "service-lab";
  }
  return "app-deploy";
}

export function recipeProviders(manifest: RecipeManifest): string[] {
  return manifest.providers ?? ["aws"];
}

export function recipeLocalRuntimeIds(manifest: RecipeManifest): string[] {
  const declared = manifest.local?.runtimes ?? [];
  if (declared.length > 0) {
    return declared.map((runtime) => runtime.id);
  }
  if (manifest.local?.emulator) {
    return [manifest.local.emulator];
  }
  return [];
}

export function recipeSearchHaystack(manifest: RecipeManifest): string {
  const tags = (manifest.tags ?? []).join(" ");
  const runtimes = recipeLocalRuntimeIds(manifest).join(" ");
  const providers = recipeProviders(manifest).join(" ");
  return `${manifest.id} ${manifest.name} ${manifest.summary ?? ""} ${tags} ${providers} ${runtimes}`.toLowerCase();
}

export function filterGalleryRecipes(
  recipes: RecipeManifest[],
  filters: GalleryFilters,
): RecipeManifest[] {
  const needle = filters.query.trim().toLowerCase();
  return recipes.filter((manifest) => {
    const kind = inferRecipeKind(manifest);
    if (kind !== filters.section) return false;

    if (filters.section === "app-deploy" && filters.scenario !== "all") {
      if (!(manifest.tags ?? []).includes(filters.scenario)) return false;
    }

    if (filters.provider !== GALLERY_PROVIDER_ALL) {
      if (!recipeProviders(manifest).includes(filters.provider)) return false;
    }

    if (filters.runtime !== GALLERY_RUNTIME_ALL) {
      const runtimes = recipeLocalRuntimeIds(manifest);
      if (runtimes.length === 0 || !runtimes.includes(filters.runtime)) return false;
    }

    if (needle && !recipeSearchHaystack(manifest).includes(needle)) return false;

    return true;
  });
}

export function galleryProviderOptions(recipes: RecipeManifest[]): string[] {
  const providers = new Set<string>();
  for (const manifest of recipes) {
    for (const provider of recipeProviders(manifest)) {
      providers.add(provider);
    }
  }
  return [...providers].sort();
}

export function galleryRuntimeOptions(recipes: RecipeManifest[]): string[] {
  const runtimes = new Set<string>();
  for (const manifest of recipes) {
    for (const runtime of recipeLocalRuntimeIds(manifest)) {
      runtimes.add(runtime);
    }
  }
  return [...runtimes].sort();
}