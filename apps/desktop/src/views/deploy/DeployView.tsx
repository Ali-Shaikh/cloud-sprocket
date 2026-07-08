// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { SectionHeader } from "@/components/section-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useDeploymentsQuery } from "@/hooks/use-deployments-query";
import { useDeploymentEvents } from "@/hooks/use-deployment-events";
import {
  filterGalleryRecipes,
  inferRecipeKind,
  type GalleryFilters,
} from "@/lib/deploy-gallery-filter";
import { formatLocalTargetLabel } from "@/lib/local-runtime-labels";
import { notify } from "@/lib/notify";
import { queryKeys } from "@/lib/query-keys";
import { formatBackendError } from "@/lib/workspace-snapshot";
import {
  applyDeployment,
  cancelDeployment,
  deleteDeployment,
  destroyDeployment,
  getRecipe,
  getTofuStatus,
  installTofu,
  listRecipes,
  planDeployment,
  retryPostApplyDeployment,
} from "@/lib/backend";
import type { NavigateToResourceParams } from "@/lib/navigate-to-resource";
import type { Deployment, ProfileSummary, Recipe, RecipeManifest, TofuStatus } from "@/types/backend";
import { Download, Loader2, Rocket, Trash2 } from "lucide-react";

import { ConfigureRecipe } from "./configure-recipe";
import { defaultGalleryFilters, RecipeGallery } from "./components/recipe-gallery";
import { DeploymentDetail } from "./deployment-detail";
import {
  coerceValues,
  isFlociAzureProfile,
  MAGENTO_COMPOSE_RECIPE_ID,
  magentoComposeDir,
  normaliseMagentoComposeValues,
  seedValues,
  StatusBadge,
  type TargetOption,
} from "./shared";

function reportDeployError(title: string, error: unknown): void {
  notify("error", title, formatBackendError(error));
}

export default function DeployView({
  profiles,
  navigateToResource,
}: {
  profiles: ProfileSummary[];
  navigateToResource?: (params: NavigateToResourceParams) => void;
}) {
  const [mode, setMode] = useState<"list" | "configure" | "deployment">("list");
  const [recipes, setRecipes] = useState<RecipeManifest[]>([]);
  const [tofu, setTofu] = useState<TofuStatus | null>(null);
  const [installing, setInstalling] = useState(false);
  const [galleryFilters, setGalleryFilters] = useState<GalleryFilters>(defaultGalleryFilters());
  const queryClient = useQueryClient();
  const deploymentsQuery = useDeploymentsQuery();
  const deployments = deploymentsQuery.data ?? [];

  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [target, setTarget] = useState<string>("local");
  const [busy, setBusy] = useState(false);

  const { active, setActive, logs, resetLogsForDeployment } = useDeploymentEvents();
  const logRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void listRecipes()
      .then(setRecipes)
      .catch((error) => {
        setRecipes([]);
        reportDeployError("Could not load recipes", error);
      });
    void getTofuStatus()
      .then(setTofu)
      .catch(() => setTofu(null));
  }, []);

  const targetOptions = useMemo<TargetOption[]>(() => {
    const providers = new Set(recipe?.manifest.providers ?? ["aws"]);
    const declaredRuntimes = recipe?.manifest.local?.runtimes ?? [];
    const legacyEmulator = recipe?.manifest.local?.emulator;
    const runtimes =
      declaredRuntimes.length > 0
        ? declaredRuntimes
        : legacyEmulator
          ? [{ id: legacyEmulator, requiresPro: recipe?.manifest.local?.requiresPro }]
          : [];

    const options: TargetOption[] = [];
    for (const providerId of providers) {
      if (providerId !== "aws" && providerId !== "azure") continue;
      for (const runtime of runtimes) {
        if (providerId === "aws" && runtime.id === "floci-az") continue;
        if (providerId === "azure" && runtime.id === "localstack") continue;
        options.push({
          id: `local:${runtime.id}`,
          label: formatLocalTargetLabel(runtime.id, runtime.requiresPro),
          providerId,
          profileId: "",
          local: true,
          runtimeId: runtime.id,
        });
      }
    }
    for (const profile of profiles) {
      if (!providers.has(profile.providerId)) continue;
      if (profile.providerId === "azure" && isFlociAzureProfile(profile)) continue;
      options.push({
        id: `profile:${profile.profileId}`,
        label: `${profile.providerId.toUpperCase()} · ${profile.displayName}`,
        providerId: profile.providerId,
        profileId: profile.profileId,
        local: false,
      });
    }
    return options;
  }, [profiles, recipe]);

  useEffect(() => {
    if (targetOptions.length === 0) return;
    if (!targetOptions.some((option) => option.id === target)) {
      setTarget(targetOptions[0].id);
    }
  }, [target, targetOptions]);

  const galleryRecipes = useMemo(
    () => filterGalleryRecipes(recipes, galleryFilters),
    [galleryFilters, recipes],
  );

  async function openRecipe(id: string) {
    try {
      const loaded = await getRecipe(id);
      setRecipe(loaded);
      const seeded = seedValues(loaded.variables);
      setValues(
        loaded.manifest.id === MAGENTO_COMPOSE_RECIPE_ID ? normaliseMagentoComposeValues(seeded) : seeded,
      );
      const providers = loaded.manifest.providers ?? ["aws"];
      const declaredRuntimes = loaded.manifest.local?.runtimes ?? [];
      const legacyEmulator = loaded.manifest.local?.emulator;
      const localRuntimes =
        declaredRuntimes.length > 0
          ? declaredRuntimes
          : legacyEmulator
            ? [{ id: legacyEmulator }]
            : [];
      if (localRuntimes.length > 0) {
        setTarget(`local:${localRuntimes[0]?.id ?? "localstack"}`);
      } else {
        const profile = profiles.find(
          (candidate) =>
            providers.includes(candidate.providerId) &&
            !(providers.includes("azure") && isFlociAzureProfile(candidate)),
        );
        setTarget(profile ? `profile:${profile.profileId}` : "");
      }
      setMode("configure");
      setGalleryFilters((current) => ({
        ...current,
        section: inferRecipeKind(loaded.manifest),
      }));
    } catch (error) {
      reportDeployError("Could not open recipe", error);
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
    } catch (error) {
      reportDeployError("Could not install OpenTofu", error);
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
      resetLogsForDeployment(response.deployment.id);
      setMode("deployment");
    } catch (error) {
      reportDeployError("Plan failed", error);
    } finally {
      setBusy(false);
    }
  }

  async function handleApply() {
    if (!active) return;
    setBusy(true);
    try {
      await applyDeployment(active.id);
    } catch (error) {
      reportDeployError("Apply failed", error);
    } finally {
      setBusy(false);
    }
  }

  async function handleRetryPostApply() {
    if (!active) return;
    setBusy(true);
    try {
      await retryPostApplyDeployment(active.id);
    } catch (error) {
      reportDeployError("Post-apply retry failed", error);
    } finally {
      setBusy(false);
    }
  }

  async function handleDestroy() {
    if (!active) return;
    setBusy(true);
    try {
      await destroyDeployment(active.id);
    } catch (error) {
      reportDeployError("Destroy failed", error);
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel() {
    if (!active) return;
    try {
      await cancelDeployment(active.id);
    } catch (error) {
      reportDeployError("Could not stop deployment", error);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteDeployment(id);
      queryClient.setQueryData<Deployment[]>(queryKeys.deployments.list, (current = []) =>
        current.filter((entry) => entry.id !== id),
      );
      if (active?.id === id) {
        setActive(null);
        setMode("list");
      }
    } catch (error) {
      reportDeployError("Could not remove deployment", error);
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
        navigateToResource={navigateToResource}
      />
    );
  }

  if (mode === "configure" && recipe) {
    return (
      <ConfigureRecipe
        recipe={recipe}
        values={values}
        onChange={(name, value) =>
          setValues((current) => {
            const next = { ...current, [name]: value };
            if (recipe.manifest.id === MAGENTO_COMPOSE_RECIPE_ID && name === "stack_profile") {
              next.compose_dir = magentoComposeDir(value);
            }
            return next;
          })
        }
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

      <RecipeGallery
        recipes={galleryRecipes}
        catalogueRecipes={recipes}
        filters={galleryFilters}
        onFiltersChange={(patch) => setGalleryFilters((current) => ({ ...current, ...patch }))}
        onConfigure={(id) => void openRecipe(id)}
      />

      <div>
        <h3 className="mb-3 text-sm font-semibold text-foreground">Recent deployments</h3>
        {deployments.length === 0 ? (
          <EmptyState
            icon={<Rocket className="size-6" />}
            title="No deployments yet"
            description="Pick a recipe above, plan against a local runtime or cloud profile, then apply when ready."
          />
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
                        {deployment.local
                          ? formatLocalTargetLabel(deployment.runtimeId)
                          : `${deployment.providerId} · ${deployment.profileId}`}{" "}
                        · {deployment.recipeId}
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