// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { Crown, FlaskConical, Rocket, Shield } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { RecipeManifest } from "@/types/backend";

import { proCapabilityHint } from "@/lib/local-runtime-labels";
import { recipeLocalRuntimeIds } from "@/lib/deploy-gallery-filter";

import { manifestRequiresPro } from "./shared";

export function RecipeCard({ manifest, onConfigure }: { manifest: RecipeManifest; onConfigure: () => void }) {
  const isLab = manifest.kind === "service-lab";
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
        <div className="flex items-center gap-2">
          {manifestRequiresPro(manifest) && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400"
              title={proCapabilityHint(recipeLocalRuntimeIds(manifest))}
            >
              <Crown className="size-3" /> Licensed runtime
            </span>
          )}
          {manifest.superpowers?.iamPolicyStream && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400"
              title="IAM Policy Stream available after a local run"
            >
              <Shield className="size-3" /> IAM
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