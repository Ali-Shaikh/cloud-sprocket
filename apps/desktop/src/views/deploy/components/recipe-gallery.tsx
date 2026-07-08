// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { Boxes, FlaskConical, Rocket } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  GALLERY_PROVIDER_ALL,
  GALLERY_RUNTIME_ALL,
  type GalleryFilters,
  type GallerySection,
} from "@/lib/deploy-gallery-filter";
import { runtimeDisplayName } from "@/lib/deploy-runtime-labels";
import type { RecipeManifest } from "@/types/backend";

import { RecipeCard } from "../recipe-card";
import { SCENARIO_TAGS } from "../shared";

export function RecipeGallery({
  recipes,
  catalogueRecipes,
  filters,
  onFiltersChange,
  onConfigure,
}: {
  recipes: RecipeManifest[];
  catalogueRecipes: RecipeManifest[];
  filters: GalleryFilters;
  onFiltersChange: (patch: Partial<GalleryFilters>) => void;
  onConfigure: (recipeId: string) => void;
}) {
  const { section, scenario, query, provider, runtime } = filters;
  const providerOptions = [
    ...new Set(catalogueRecipes.flatMap((manifest) => manifest.providers ?? ["aws"])),
  ].sort();
  const runtimeOptions = [
    ...new Set(
      catalogueRecipes.flatMap((manifest) => {
        const declared = manifest.local?.runtimes ?? [];
        if (declared.length > 0) return declared.map((entry) => entry.id);
        return manifest.local?.emulator ? [manifest.local.emulator] : [];
      }),
    ),
  ].sort();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={section === "app-deploy" ? "default" : "outline"}
          size="sm"
          onClick={() => onFiltersChange({ section: "app-deploy" })}
        >
          <Rocket className="size-4" /> Deploy your app
        </Button>
        <Button
          variant={section === "service-lab" ? "default" : "outline"}
          size="sm"
          onClick={() => onFiltersChange({ section: "service-lab" })}
        >
          <FlaskConical className="size-4" /> Service labs
        </Button>
        {section === "app-deploy" ? (
          <Select value={scenario} onValueChange={(value) => onFiltersChange({ scenario: value })}>
            <SelectTrigger className="h-8 w-[180px]">
              <SelectValue placeholder="All scenarios" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All scenarios</SelectItem>
              {SCENARIO_TAGS.map((tag) => (
                <SelectItem key={tag} value={tag}>
                  {tag}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={query}
          onChange={(event) => onFiltersChange({ query: event.target.value })}
          placeholder="Search recipes"
          aria-label="Search recipes"
          className="h-8 max-w-xs"
        />
        <Select value={provider} onValueChange={(value) => onFiltersChange({ provider: value })}>
          <SelectTrigger className="h-8 w-[140px]">
            <SelectValue placeholder="All providers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={GALLERY_PROVIDER_ALL}>All providers</SelectItem>
            {providerOptions.map((entry) => (
              <SelectItem key={entry} value={entry}>
                {entry.toUpperCase()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={runtime} onValueChange={(value) => onFiltersChange({ runtime: value })}>
          <SelectTrigger className="h-8 w-[180px]">
            <SelectValue placeholder="All runtimes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={GALLERY_RUNTIME_ALL}>All local runtimes</SelectItem>
            {runtimeOptions.map((entry) => (
              <SelectItem key={entry} value={entry}>
                {runtimeDisplayName(entry)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {recipes.length === 0 ? (
        <EmptyState
          icon={section === "service-lab" ? <FlaskConical className="size-6" /> : <Boxes className="size-6" />}
          title={section === "service-lab" ? "No service labs match" : "No app recipes match"}
          description="Try clearing filters or search. Bundled recipes ship with the app."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {recipes.map((manifest) => (
            <RecipeCard key={manifest.id} manifest={manifest} onConfigure={() => onConfigure(manifest.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

export function defaultGalleryFilters(section: GallerySection = "app-deploy"): GalleryFilters {
  return {
    section,
    scenario: "all",
    query: "",
    provider: GALLERY_PROVIDER_ALL,
    runtime: GALLERY_RUNTIME_ALL,
  };
}