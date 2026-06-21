// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useEffect, useMemo, useRef, useState } from "react";
import { Boxes, Download, FlaskConical, Loader2, Rocket, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/empty-state";
import { SectionHeader } from "@/components/section-header";
import {
  applyDeployment,
  cancelDeployment,
  deleteDeployment,
  destroyDeployment,
  getRecipe,
  getTofuStatus,
  installTofu,
  listDeployments,
  listRecipes,
  planDeployment,
  retryPostApplyDeployment,
  subscribeToBackendEvent,
} from "@/lib/backend";
import type { Deployment, ProfileSummary, Recipe, RecipeManifest, TofuStatus } from "@/types/backend";

import { ConfigureRecipe } from "./deployConfigure";
import { DeploymentDetail } from "./deployDetail";
import { runtimeDisplayName } from "./deployOutputLinks";
import { RecipeCard } from "./deployRecipeCard";
import {
  coerceValues,
  SCENARIO_TAGS,
  seedValues,
  StatusBadge,
  type DeployMode,
  type GallerySection,
  type TargetOption,
} from "./deployShared";

export default function DeployView({ profiles }: { profiles: ProfileSummary[] }) {
  const [mode, setMode] = useState<DeployMode>("list");
  const [recipes, setRecipes] = useState<RecipeManifest[]>([]);
  const [tofu, setTofu] = useState<TofuStatus | null>(null);
  const [installing, setInstalling] = useState(false);
  const [deployments, setDeployments] = useState<Deployment[]>([]);

  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [target, setTarget] = useState<string>("local");
  const [gallerySection, setGallerySection] = useState<GallerySection>("app-deploy");
  const [scenarioFilter, setScenarioFilter] = useState<string>("all");
  const [busy, setBusy] = useState(false);

  const [active, setActive] = useState<Deployment | null>(null);
  const [logs, setLogs] = useState<Record<string, string[]>>({});
  const logRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void listRecipes().then(setRecipes).catch(() => setRecipes([]));
    void getTofuStatus().then(setTofu).catch(() => setTofu(null));
    void listDeployments().then(setDeployments).catch(() => setDeployments([]));

    const unsubChanged = subscribeToBackendEvent("deployment.changed", (deployment) => {
      setDeployments((current) => {
        const next = current.filter((entry) => entry.id !== deployment.id);
        return [deployment, ...next];
      });
      setActive((current) => (current && current.id === deployment.id ? deployment : current));
    });
    const unsubLog = subscribeToBackendEvent("deployment.log", (event) => {
      setLogs((current) => ({
        ...current,
        [event.deploymentId]: [...(current[event.deploymentId] ?? []), event.line],
      }));
    });
    return () => {
      void unsubChanged.then((fn) => fn());
      void unsubLog.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs, active?.id]);

  const targetOptions = useMemo<TargetOption[]>(() => {
    const providers = new Set(recipe?.manifest.providers ?? ["aws"]);
    const declaredRuntimes = recipe?.manifest.local?.runtimes ?? [];
    const legacyEmulator = recipe?.manifest.local?.emulator;
    const runtimes =
      declaredRuntimes.length > 0
        ? declaredRuntimes
        : legacyEmulator
          ? [{ id: legacyEmulator, requiresPro: recipe?.manifest.local?.requiresPro }]
          : [{ id: "localstack" }];

    const options: TargetOption[] = [];
    if (providers.has("aws")) {
      for (const runtime of runtimes) {
        const proSuffix = runtime.requiresPro ? " · Pro" : "";
        options.push({
          id: `local:${runtime.id}`,
          label: `Local emulator (${runtimeDisplayName(runtime.id)})${proSuffix}`,
          providerId: "aws",
          profileId: "",
          local: true,
          runtimeId: runtime.id,
        });
      }
    }
    for (const profile of profiles) {
      if (providers.has(profile.providerId)) {
        options.push({
          id: `profile:${profile.profileId}`,
          label: `${profile.providerId.toUpperCase()} · ${profile.displayName}`,
          providerId: profile.providerId,
          profileId: profile.profileId,
          local: false,
        });
      }
    }
    return options;
  }, [profiles, recipe]);

  useEffect(() => {
    if (targetOptions.length === 0) return;
    if (!targetOptions.some((option) => option.id === target)) {
      setTarget(targetOptions[0].id);
    }
  }, [target, targetOptions]);

  const galleryRecipes = useMemo(() => {
    const sectionKind = gallerySection;
    return recipes.filter((manifest) => {
      const kind = manifest.kind ?? (manifest.id.startsWith("lab-") || manifest.id === "scheduled-job-aws" ? "service-lab" : "app-deploy");
      if (kind !== sectionKind) return false;
      if (sectionKind === "app-deploy" && scenarioFilter !== "all") {
        return (manifest.tags ?? []).includes(scenarioFilter);
      }
      return true;
    });
  }, [recipes, gallerySection, scenarioFilter]);

  async function openRecipe(id: string) {
    try {
      const loaded = await getRecipe(id);
      setRecipe(loaded);
      setValues(seedValues(loaded.variables));
      const firstRuntime = loaded.manifest.local?.runtimes?.[0]?.id ?? loaded.manifest.local?.emulator ?? "localstack";
      setTarget(`local:${firstRuntime}`);
      setMode("configure");
      setGallerySection(loaded.manifest.kind === "service-lab" ? "service-lab" : "app-deploy");
    } catch {
      /* surfaced by the debug log */
    }
  }

  async function handleInstallTofu() {
    setInstalling(true);
    try {
      await installTofu();
      const deadline = Date.now() + 90_000;
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const status = await getTofuStatus();
        if (status.available) {
          setTofu(status);
          break;
        }
      }
    } finally {
      setInstalling(false);
    }
  }

  async function handlePlan() {
    if (!recipe) return;
    const option = targetOptions.find((entry) => entry.id === target) ?? targetOptions[0];
    setBusy(true);
    try {
      const response = await planDeployment({
        recipeId: recipe.manifest.id,
        name: recipe.manifest.name,
        providerId: option.providerId,
        profileId: option.profileId,
        local: option.local,
        runtimeId: option.runtimeId,
        variables: coerceValues(recipe.variables, values),
      });
      setActive(response.deployment);
      setLogs((current) => ({ ...current, [response.deployment.id]: [] }));
      setMode("deployment");
    } finally {
      setBusy(false);
    }
  }

  async function handleApply() {
    if (!active) return;
    setBusy(true);
    try {
      await applyDeployment(active.id);
    } finally {
      setBusy(false);
    }
  }

  async function handleRetryPostApply() {
    if (!active) return;
    setBusy(true);
    try {
      await retryPostApplyDeployment(active.id);
    } finally {
      setBusy(false);
    }
  }

  async function handleDestroy() {
    if (!active) return;
    setBusy(true);
    try {
      await destroyDeployment(active.id);
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel() {
    if (!active) return;
    try {
      await cancelDeployment(active.id);
    } catch {
      /* surfaced by the debug log */
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteDeployment(id);
      setDeployments((current) => current.filter((entry) => entry.id !== id));
      if (active?.id === id) {
        setActive(null);
        setMode("list");
      }
    } catch {
      /* surfaced by the debug log */
    }
  }

  if (mode === "deployment" && active) {
    return (
      <DeploymentDetail
        deployment={active}
        recipeManifest={recipes.find((entry) => entry.id === active.recipeId) ?? null}
        logs={logs[active.id] ?? []}
        logRef={logRef}
        busy={busy}
        onBack={() => {
          setActive(null);
          setMode("list");
        }}
        onApply={handleApply}
        onDestroy={handleDestroy}
        onCancel={handleCancel}
        onDelete={() => void handleDelete(active.id)}
        onRetryPostApply={handleRetryPostApply}
      />
    );
  }

  if (mode === "configure" && recipe) {
    return (
      <ConfigureRecipe
        recipe={recipe}
        values={values}
        onChange={(name, value) => setValues((current) => ({ ...current, [name]: value }))}
        target={target}
        targetOptions={targetOptions}
        onTargetChange={setTarget}
        busy={busy}
        onBack={() => setMode("list")}
        onPlan={handlePlan}
      />
    );
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <SectionHeader
        title="Deploy"
        description="Deploy your application with infra wired, or try a single cloud service in a service lab."
      />

      {tofu && !tofu.available && (
        <Card className="flex items-center justify-between gap-4 border-amber-500/30 bg-amber-500/5 p-4">
          <div className="text-sm">
            <p className="font-medium text-foreground">OpenTofu engine not installed</p>
            <p className="text-muted-foreground">Recipes deploy with OpenTofu. Install the pinned engine to continue.</p>
          </div>
          <Button onClick={handleInstallTofu} disabled={installing}>
            {installing ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            {installing ? "Installing…" : "Install OpenTofu"}
          </Button>
        </Card>
      )}

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={gallerySection === "app-deploy" ? "default" : "outline"}
            size="sm"
            onClick={() => setGallerySection("app-deploy")}
          >
            <Rocket className="size-4" /> Deploy your app
          </Button>
          <Button
            variant={gallerySection === "service-lab" ? "default" : "outline"}
            size="sm"
            onClick={() => setGallerySection("service-lab")}
          >
            <FlaskConical className="size-4" /> Service labs
          </Button>
          {gallerySection === "app-deploy" && (
            <Select value={scenarioFilter} onValueChange={setScenarioFilter}>
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
          )}
        </div>

        {galleryRecipes.length === 0 ? (
          <EmptyState
            icon={gallerySection === "service-lab" ? <FlaskConical className="size-6" /> : <Boxes className="size-6" />}
            title={gallerySection === "service-lab" ? "No service labs match" : "No app recipes match"}
            description="Bundled recipes ship with the app. Try clearing the scenario filter."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {galleryRecipes.map((manifest) => (
              <RecipeCard key={manifest.id} manifest={manifest} onConfigure={() => void openRecipe(manifest.id)} />
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-foreground">Recent deployments</h3>
        {deployments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No deployments yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {deployments.map((deployment) => {
              const removable =
                deployment.status !== "applied" &&
                deployment.status !== "planning" &&
                deployment.status !== "applying" &&
                deployment.status !== "destroying";
              return (
                <div
                  key={deployment.id}
                  className="flex items-center gap-2 rounded-lg border bg-card pr-2 transition-colors hover:bg-accent"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setActive(deployment);
                      setMode("deployment");
                    }}
                    className="flex flex-1 items-center justify-between px-4 py-3 text-left"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">{deployment.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {deployment.local ? "Local emulator" : `${deployment.providerId} · ${deployment.profileId}`} · {deployment.recipeId}
                      </p>
                    </div>
                    <StatusBadge status={deployment.status} />
                  </button>
                  {removable && (
                    <button
                      type="button"
                      onClick={() => void handleDelete(deployment.id)}
                      title="Remove this deployment record"
                      className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}