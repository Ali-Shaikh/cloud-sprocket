// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { Crown, FlaskConical, Rocket } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { RecipeManifest } from "@/types/backend";

import { runtimeDisplayName } from "@/lib/deploy-runtime-labels";
import { recipeLocalRuntimeIds } from "@/lib/deploy-gallery-filter";

import {
  manifestRequiresPro,
  recipeRunTargetTooltip,
  recipeRunTargets,
  type RecipeRunTarget,
} from "./shared";

function difficultyLabel(difficulty: NonNullable<RecipeManifest["lab"]>["difficulty"]): string {
  return difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
}

export function licensedRuntimeTooltip(manifest: RecipeManifest): string {
  const declaredProRuntimes = (manifest.local?.runtimes ?? [])
    .filter((runtime) => runtime.requiresPro)
    .map((runtime) => runtimeDisplayName(runtime.id));
  const runtimeNames = declaredProRuntimes.length > 0
    ? declaredProRuntimes
    : recipeLocalRuntimeIds(manifest).map((id) => runtimeDisplayName(id));
  const names = [...new Set(runtimeNames)].join(" or ") || "a licensed local runtime";
  return `Runs locally on ${names} (licence required)`;
}

function runTargetBadgeClass(target: RecipeRunTarget): string {
  if (target.kind === "cloud") {
    return target.providerId === "azure"
      ? "bg-sky-500/15 text-sky-700 dark:text-sky-300"
      : "bg-orange-500/15 text-orange-700 dark:text-orange-300";
  }
  if (target.runtimeId === "floci-az") {
    return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
  }
  if (target.runtimeId === "localstack") {
    return "bg-violet-500/15 text-violet-700 dark:text-violet-300";
  }
  return "bg-muted text-muted-foreground";
}

function RunTargetBadge({ target }: { target: RecipeRunTarget }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            tabIndex={0}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
              runTargetBadgeClass(target),
            )}
          >
            {target.label}
          </span>
        </TooltipTrigger>
        <TooltipContent>{recipeRunTargetTooltip(target)}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function RecipeCard({ manifest, onConfigure }: { manifest: RecipeManifest; onConfigure: () => void }) {
  const isLab = manifest.kind === "service-lab";
  const lab = manifest.lab;
  const runTargets = recipeRunTargets(manifest);
  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-start justify-between gap-2">
        <div
          className={cn(
            "grid size-10 place-items-center rounded-lg",
            isLab ? "bg-sky-500/10 text-sky-500" : "bg-violet-500/10 text-violet-500",
          )}
        >
          {isLab ? <FlaskConical className="size-5" /> : <Rocket className="size-5" />}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {manifestRequiresPro(manifest) && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    tabIndex={0}
                    className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400"
                  >
                    <Crown className="size-3" /> Licensed runtime
                  </span>
                </TooltipTrigger>
                <TooltipContent>{licensedRuntimeTooltip(manifest)}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {runTargets.map((target) => (
            <RunTargetBadge
              key={target.kind === "local" ? `local:${target.runtimeId}` : `cloud:${target.providerId}`}
              target={target}
            />
          ))}
          {lab && (
            <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-xs font-medium text-sky-600 dark:text-sky-400">
              {difficultyLabel(lab.difficulty)}
            </span>
          )}
          {lab && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              ~{lab.estimatedMinutes} min
            </span>
          )}
          {manifest.source === "imported" && (
            <span
              className="rounded-full bg-orange-500/15 px-2 py-0.5 text-xs font-medium text-orange-700 dark:text-orange-300"
              title="Loaded from a locally imported recipe with a valid trust hash"
            >
              Imported
            </span>
          )}
          <span className="text-xs text-muted-foreground">v{manifest.version}</span>
        </div>
      </div>
      <div>
        <p className="font-semibold text-foreground">{manifest.name}</p>
        <p className="mt-1 text-sm text-muted-foreground">{manifest.summary}</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {(manifest.tags ?? []).map((tag) => (
          <span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {tag}
          </span>
        ))}
      </div>
      <Button className="mt-1 self-start" onClick={onConfigure}>
        Configure
      </Button>
    </Card>
  );
}
