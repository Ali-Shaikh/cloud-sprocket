// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { ArrowLeft, Crown, FolderOpen, Loader2, Play } from "lucide-react";
import { useMemo } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { SectionHeader } from "@/components/section-header";
import type { Recipe, RecipeVariable } from "@/types/backend";

import {
  groupVariables,
  MAGENTO_COMPOSE_RECIPE_ID,
  magentoComposePlanWarnings,
  manifestCloudOnlyAWS,
  manifestCloudOnlyAzure,
  manifestRequiresPro,
  type TargetOption,
} from "./deployShared";

export function ConfigureRecipe({
  recipe,
  values,
  onChange,
  target,
  targetOptions,
  onTargetChange,
  busy,
  onBack,
  onPlan,
}: {
  recipe: Recipe;
  values: Record<string, unknown>;
  onChange: (name: string, value: unknown) => void;
  target: string;
  targetOptions: TargetOption[];
  onTargetChange: (id: string) => void;
  busy: boolean;
  onBack: () => void;
  onPlan: () => void;
}) {
  const groups = useMemo(() => groupVariables(recipe.variables, values), [recipe.variables, values]);
  const planWarnings = useMemo(
    () => magentoComposePlanWarnings(recipe.manifest.id, values),
    [recipe.manifest.id, values],
  );

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Back to recipes
      </button>
      <SectionHeader title={recipe.manifest.name} description={recipe.manifest.summary} />

      {manifestRequiresPro(recipe.manifest) && (
        <Card className="flex items-center gap-2 border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-400">
          <Crown className="size-4 shrink-0" />
          Uses services that only emulate on LocalStack Pro. Use a LocalStack Pro/Team token for a local
          dry-run, or pick a real AWS profile to deploy to the cloud.
        </Card>
      )}

      {manifestCloudOnlyAzure(recipe.manifest) && (
        <Card className="flex items-center gap-2 border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-400">
          <Crown className="size-4 shrink-0" />
          Cloud Azure subscription required. floci-az cannot dry-run this recipe; pick a subscription where your
          account can create resource groups.
        </Card>
      )}

      {manifestCloudOnlyAWS(recipe.manifest) && (
        <Card className="flex items-center gap-2 border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-400">
          <Crown className="size-4 shrink-0" />
          Real AWS account required. LocalStack cannot dry-run ECS, RDS, and ElastiCache for this recipe; pick an AWS
          profile with permissions to create VPC, ECS, RDS, and ElastiCache resources.
        </Card>
      )}

      {recipe.manifest.imageBuild && (
        <Card className="border-sky-500/30 bg-sky-500/5 p-3 text-sm text-muted-foreground">
          Set <span className="font-medium text-foreground">dockerfile_dir</span> to build from your Dockerfile before
          plan. On real AWS the image is pushed to ECR automatically; locally the built tag is used for ECS.
        </Card>
      )}

      {recipe.manifest.id === MAGENTO_COMPOSE_RECIPE_ID && values.stack_profile === "simple" && (
        <Card className="border-sky-500/30 bg-sky-500/5 p-3 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Simple stack</span> — shinsenter auto-installs Magento into a
          Docker volume on first boot (~5–10 minutes, ~4 GB Docker RAM). Use{" "}
          <span className="font-medium text-foreground">latest</span> for the newest build, or{" "}
          <span className="font-medium text-foreground">stable</span> after tagging a pinned image locally.
        </Card>
      )}

      {recipe.manifest.id === MAGENTO_COMPOSE_RECIPE_ID && values.stack_profile === "official" && (
        <Card className="border-sky-500/30 bg-sky-500/5 p-3 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Official stack</span> — installs Adobe Magento Open Source via
          Composer using markshust/docker-magento defaults (community / 2.4.9). First boot ~15–25 minutes, ~6 GB Docker
          RAM. Adobe Marketplace keys are required.
        </Card>
      )}

      {planWarnings.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-800 dark:text-amber-300">
          <ul className="list-disc space-y-1 pl-5">
            {planWarnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="flex flex-col gap-2 p-4">
        <label className="text-sm font-medium text-foreground">Deploy target</label>
        <Select value={target} onValueChange={onTargetChange}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {targetOptions.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Pick a local runtime to dry-run the recipe, or switch to a cloud profile to deploy to real infrastructure
          unchanged.
        </p>
      </Card>

      {groups.map((group) => (
        <div key={group.title} className="flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-foreground">{group.title}</h3>
          {group.variables.map((variable) => (
            <VariableField
              key={variable.name}
              variable={variable}
              value={values[variable.name]}
              onChange={(value) => onChange(variable.name, value)}
            />
          ))}
        </div>
      ))}

      <div className="flex justify-end">
        <Button onClick={onPlan} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
          Plan deployment
        </Button>
      </div>
    </div>
  );
}

function VariableField({
  variable,
  value,
  onChange,
}: {
  variable: RecipeVariable;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const label = (
    <div className="flex items-center justify-between">
      <label className="text-sm font-medium text-foreground">{variable.name}</label>
      <span className="text-xs text-muted-foreground">{variable.type}</span>
    </div>
  );
  const help = (variable.help || variable.description) && (
    <p className="text-xs text-muted-foreground">{variable.help || variable.description}</p>
  );

  return (
    <div className="flex flex-col gap-1.5">
      {label}
      {variable.widget === "switch" ? (
        <Switch checked={Boolean(value)} onCheckedChange={(checked) => onChange(checked)} />
      ) : variable.widget === "select" ? (
        <Select value={String(value ?? "")} onValueChange={onChange}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(variable.options ?? []).map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : variable.widget === "textarea" ? (
        <Textarea value={String(value ?? "")} onChange={(event) => onChange(event.target.value)} rows={3} />
      ) : variable.widget === "directory" ? (
        <div className="flex gap-2">
          <Input
            value={String(value ?? "")}
            onChange={(event) => onChange(event.target.value)}
            placeholder="Path to a folder…"
          />
          <Button
            type="button"
            variant="outline"
            onClick={async () => {
              try {
                const picked = await openDialog({ directory: true, multiple: false });
                if (typeof picked === "string") onChange(picked);
              } catch {
                /* browser/dev: fall back to typing the path */
              }
            }}
          >
            <FolderOpen className="size-4" /> Browse
          </Button>
        </div>
      ) : variable.widget === "number" ? (
        <Input
          type="number"
          value={String(value ?? "")}
          onChange={(event) => onChange(event.target.value === "" ? "" : Number(event.target.value))}
        />
      ) : (
        <Input
          type={variable.widget === "password" ? "password" : "text"}
          value={String(value ?? "")}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {help}
    </div>
  );
}