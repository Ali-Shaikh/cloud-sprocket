// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { Check, Copy, Eye, EyeOff } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";
import type { Deployment, ProfileSummary, RecipeManifest, RecipeVariable } from "@/types/backend";

export type DeployMode = "list" | "configure" | "deployment";
export type GallerySection = "app-deploy" | "service-lab";

export const SCENARIO_TAGS = ["webhooks", "saas", "marketing", "async", "internal-tool", "staging", "ci", "ecommerce"] as const;

export interface TargetOption {
  id: string;
  label: string;
  providerId: string;
  profileId: string;
  local: boolean;
  runtimeId?: string;
}

export const STATUS_VARIANT: Record<Deployment["status"], string> = {
  pending: "bg-muted text-muted-foreground",
  planning: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  planned: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  applying: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  applied: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  destroying: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  destroyed: "bg-muted text-muted-foreground",
  failed: "bg-destructive/15 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

export function StatusBadge({ status }: { status: Deployment["status"] }) {
  return (
    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium capitalize", STATUS_VARIANT[status])}>
      {status}
    </span>
  );
}

export function manifestRequiresPro(manifest: RecipeManifest): boolean {
  if (manifest.local?.requiresPro) return true;
  return (manifest.local?.runtimes ?? []).some((runtime) => runtime.requiresPro);
}

export function isFlociAzureProfile(profile: ProfileSummary): boolean {
  return profile.attributes.some(
    (field) => field.label === "Tenant ID" && field.value === "cloudsprocket-local",
  );
}

export function manifestCloudOnly(manifest: RecipeManifest, providerId: string): boolean {
  if (!(manifest.providers ?? []).includes(providerId)) return false;
  if ((manifest.local?.runtimes ?? []).length > 0) return false;
  return !manifest.local?.emulator;
}

export function manifestCloudOnlyAzure(manifest: RecipeManifest): boolean {
  return manifestCloudOnly(manifest, "azure");
}

export function manifestCloudOnlyAWS(manifest: RecipeManifest): boolean {
  return manifestCloudOnly(manifest, "aws");
}

export function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable; the value is still selectable above */
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      title="Copy to clipboard"
    >
      {copied ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export function RevealButton({ revealed, onToggle }: { revealed: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      title={revealed ? "Hide value" : "Reveal value"}
    >
      {revealed ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
      {revealed ? "Hide" : "Reveal"}
    </button>
  );
}

export const MAGENTO_COMPOSE_RECIPE_ID = "magento-commerce-compose";

export function isVariableVisible(variable: RecipeVariable, values: Record<string, unknown>): boolean {
  const when = variable.visibleWhen;
  if (!when) return true;
  return String(values[when.variable] ?? "") === when.equals;
}

export function magentoComposeDir(stackProfile: unknown): string {
  return stackProfile === "official" ? "compose/official" : "compose/simple";
}

export function normaliseMagentoComposeValues(values: Record<string, unknown>): Record<string, unknown> {
  const profile = values.stack_profile ?? "simple";
  return {
    ...values,
    stack_profile: profile,
    compose_dir: magentoComposeDir(profile),
    magento_image_channel: values.magento_image_channel ?? "latest",
    expose_debug_ports: values.expose_debug_ports ?? false,
  };
}

export function magentoComposePlanWarnings(
  recipeId: string,
  values: Record<string, unknown>,
): string[] {
  if (recipeId !== MAGENTO_COMPOSE_RECIPE_ID) return [];
  const warnings: string[] = [];
  if (values.stack_profile === "official") {
    const publicKey = String(values.magento_public_key ?? "").trim();
    const privateKey = String(values.magento_private_key ?? "").trim();
    if (!publicKey || !privateKey) {
      warnings.push("Adobe Marketplace keys are required for the official stack. Apply may succeed but Magento install will fail until keys are set.");
    }
    warnings.push("Official stack first boot via Composer typically takes 15–25 minutes and needs ~6 GB Docker RAM.");
  } else if (values.magento_image_channel === "stable") {
    warnings.push(
      "Stable channel expects a local shinsenter/magento:stable tag. Run: docker pull shinsenter/magento:latest && docker tag shinsenter/magento:latest shinsenter/magento:stable",
    );
  } else {
    warnings.push("Simple stack first boot typically takes 5–10 minutes and needs ~4 GB Docker RAM.");
  }
  return warnings;
}

export function seedValues(variables: RecipeVariable[]): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const variable of variables) {
    if (variable.widget === "textarea" && variable.default && typeof variable.default === "object") {
      values[variable.name] = JSON.stringify(variable.default, null, 2);
    } else if (variable.widget === "switch") {
      values[variable.name] = Boolean(variable.default);
    } else {
      values[variable.name] = variable.default ?? "";
    }
  }
  return values;
}

export function coerceValues(variables: RecipeVariable[], values: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const variable of variables) {
    const raw = values[variable.name];
    if (variable.widget === "switch") {
      result[variable.name] = Boolean(raw);
    } else if (variable.widget === "number") {
      result[variable.name] = raw === "" || raw === undefined ? variable.default ?? 0 : Number(raw);
    } else if (variable.widget === "textarea") {
      const text = String(raw ?? "").trim();
      if (text === "") {
        result[variable.name] = variable.default ?? {};
      } else {
        try {
          result[variable.name] = JSON.parse(text);
        } catch {
          result[variable.name] = text;
        }
      }
    } else {
      result[variable.name] = raw ?? "";
    }
  }
  return result;
}

export function groupVariables(
  variables: RecipeVariable[],
  values: Record<string, unknown> = {},
): { title: string; variables: RecipeVariable[] }[] {
  const groups: { title: string; variables: RecipeVariable[] }[] = [];
  for (const variable of variables) {
    if (!isVariableVisible(variable, values)) continue;
    let group = groups.find((entry) => entry.title === variable.group);
    if (!group) {
      group = { title: variable.group, variables: [] };
      groups.push(group);
    }
    group.variables.push(variable);
  }
  return groups.filter((group) => group.variables.length > 0);
}