import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Boxes,
  Check,
  Copy,
  Crown,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FolderOpen,
  Loader2,
  Play,
  Rocket,
  Shield,
  Square,
  Terminal,
  Trash2,
  FlaskConical,
} from "lucide-react";
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
import { EmptyState } from "@/components/empty-state";
import { SectionHeader } from "@/components/section-header";
import { cn } from "@/lib/utils";
import { deploymentOutputLink, logCommandsForDeployment, runtimeDisplayName } from "./deployOutputLinks";
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
  openExternalUrl,
  planDeployment,
  subscribeToBackendEvent,
} from "@/lib/backend";
import type {
  Deployment,
  DeploymentOutput,
  ProfileSummary,
  Recipe,
  RecipeManifest,
  RecipeVariable,
  TofuStatus,
} from "@/types/backend";

type Mode = "list" | "configure" | "deployment";
type GallerySection = "app-deploy" | "service-lab";

const SCENARIO_TAGS = ["webhooks", "saas", "marketing", "async", "internal-tool", "staging", "ci"] as const;

interface TargetOption {
  id: string;
  label: string;
  providerId: string;
  profileId: string;
  local: boolean;
  runtimeId?: string;
}

const STATUS_VARIANT: Record<Deployment["status"], string> = {
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

function StatusBadge({ status }: { status: Deployment["status"] }) {
  return (
    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium capitalize", STATUS_VARIANT[status])}>
      {status}
    </span>
  );
}

function manifestRequiresPro(manifest: RecipeManifest): boolean {
  if (manifest.local?.requiresPro) return true;
  return (manifest.local?.runtimes ?? []).some((runtime) => runtime.requiresPro);
}

function RecipeCard({ manifest, onConfigure }: { manifest: RecipeManifest; onConfigure: () => void }) {
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
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
              <Crown className="size-3" /> Pro
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

export default function DeployView({ profiles }: { profiles: ProfileSummary[] }) {
  const [mode, setMode] = useState<Mode>("list");
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

  // Initial load + live subscriptions.
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

function ConfigureRecipe({
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
  const groups = useMemo(() => groupVariables(recipe.variables), [recipe.variables]);

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

      {recipe.manifest.imageBuild && (
        <Card className="border-sky-500/30 bg-sky-500/5 p-3 text-sm text-muted-foreground">
          Set <span className="font-medium text-foreground">dockerfile_dir</span> to build from your Dockerfile before
          plan. On real AWS the image is pushed to ECR automatically; locally the built tag is used for ECS.
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
          Pick a local runtime to dry-run the recipe, or switch to a cloud profile to deploy to real AWS unchanged.
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

function DeploymentDetail({
  deployment,
  recipeManifest,
  logs,
  logRef,
  busy,
  onBack,
  onApply,
  onDestroy,
  onCancel,
  onDelete,
}: {
  deployment: Deployment;
  recipeManifest: RecipeManifest | null;
  logs: string[];
  logRef: React.MutableRefObject<HTMLDivElement | null>;
  busy: boolean;
  onBack: () => void;
  onApply: () => void;
  onDestroy: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const canApply = deployment.status === "planned";
  const canDestroy = deployment.status === "applied";
  const isRunning =
    deployment.status === "planning" ||
    deployment.status === "applying" ||
    deployment.status === "destroying";
  const canRemove = !isRunning && !canDestroy;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5 p-6">
      <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Back to recipes
      </button>

      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-foreground">{deployment.name}</h2>
            <StatusBadge status={deployment.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            {deployment.local ? "Local emulator (LocalStack)" : `${deployment.providerId} · ${deployment.profileId}`}
          </p>
        </div>
        <div className="flex gap-2">
          {isRunning && (
            <Button variant="destructive" onClick={onCancel}>
              <Square className="size-4" /> Stop
            </Button>
          )}
          {canApply && (
            <Button onClick={onApply} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Rocket className="size-4" />}
              Apply
            </Button>
          )}
          {canDestroy && (
            <Button variant="destructive" onClick={onDestroy} disabled={busy}>
              <Trash2 className="size-4" /> Destroy
            </Button>
          )}
          {canRemove && (
            <Button variant="outline" onClick={onDelete}>
              <Trash2 className="size-4" /> Remove
            </Button>
          )}
        </div>
      </div>

      {deployment.error && (
        <Card className="border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{deployment.error}</Card>
      )}

      {deployment.plan && (
        <Card className="p-4">
          <div className="mb-3 flex items-center gap-4 text-sm">
            <span className="font-medium text-foreground">Plan</span>
            <span className="text-emerald-600 dark:text-emerald-400">+{deployment.plan.add} add</span>
            <span className="text-amber-600 dark:text-amber-400">~{deployment.plan.change} change</span>
            <span className="text-destructive">-{deployment.plan.destroy} destroy</span>
          </div>
          <div className="flex flex-col gap-1">
            {deployment.plan.changes.map((change) => (
              <div key={change.address} className="flex items-center gap-2 font-mono text-xs">
                <span className="text-muted-foreground">{change.actions.join(",")}</span>
                <span className="text-foreground">{change.address}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {deployment.outputs && deployment.outputs.length > 0 && (
        <Card className="p-4">
          <p className="mb-3 text-sm font-medium text-foreground">Outputs</p>
          <div className="flex flex-col divide-y divide-border">
            {deployment.outputs.map((output) => (
              <OutputRow key={output.name} output={output} deployment={deployment} />
            ))}
          </div>
        </Card>
      )}

      {deployment.status === "applied" && deployment.outputs && deployment.outputs.length > 0 && (
        <AppHandoffCard deployment={deployment} />
      )}

      {deployment.status === "applied" && recipeManifest?.superpowers && (
        <SuperpowersCard deployment={deployment} superpowers={recipeManifest.superpowers} />
      )}

      <LogCommandsCard deployment={deployment} />

      <div>
        <p className="mb-2 text-sm font-medium text-foreground">Logs</p>
        <div
          ref={logRef}
          className="h-72 overflow-auto rounded-lg border bg-[#0d1117] p-3 font-mono text-xs leading-relaxed text-[#c9d1d9]"
        >
          {logs.length === 0 ? (
            <span className="text-muted-foreground">Waiting for output…</span>
          ) : (
            logs.map((line, index) => (
              <div key={index} className="whitespace-pre-wrap">
                {line}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function AppHandoffCard({ deployment }: { deployment: Deployment }) {
  const apiOutput =
    deployment.outputs?.find((output) => output.name === "api_endpoint") ??
    deployment.outputs?.find((output) => output.name === "ingest_endpoint") ??
    deployment.outputs?.find((output) => output.name === "alb_dns_name");
  const queueOutput = deployment.outputs?.find((output) => output.name === "queue_url");
  const dbOutput = deployment.outputs?.find((output) => output.name === "database_url");
  const frontendOutput =
    deployment.outputs?.find((output) => output.name === "frontend_url") ??
    deployment.outputs?.find((output) => output.name === "frontend_website_endpoint") ??
    deployment.outputs?.find((output) => output.name === "website_endpoint");

  const envLines = [
    apiOutput ? `API_URL=${String(apiOutput.value ?? "")}` : null,
    queueOutput ? `QUEUE_URL=${String(queueOutput.value ?? "")}` : null,
    dbOutput ? `DATABASE_URL=${String(dbOutput.value ?? "")}` : null,
    frontendOutput ? `FRONTEND_URL=${String(frontendOutput.value ?? "")}` : null,
  ].filter((line): line is string => Boolean(line));

  if (envLines.length === 0) return null;

  const snippet = envLines.join("\n");

  return (
    <Card className="p-4">
      <p className="mb-2 text-sm font-medium text-foreground">Connect your app</p>
      <p className="mb-3 text-xs text-muted-foreground">
        Copy these values into your local <code className="rounded bg-muted px-1">.env</code> or deployment config.
      </p>
      <code className="block select-text whitespace-pre-wrap break-all rounded bg-muted px-3 py-2 font-mono text-xs text-foreground">
        {snippet}
      </code>
      <div className="mt-2">
        <CopyButton value={snippet} />
      </div>
    </Card>
  );
}

function SuperpowersCard({
  deployment,
  superpowers,
}: {
  deployment: Deployment;
  superpowers: NonNullable<RecipeManifest["superpowers"]>;
}) {
  if (!superpowers.iamPolicyStream || !deployment.local) return null;

  // IAM Policy Stream is a LocalStack Pro feature. We surface the real steps and the
  // exact command rather than implying an in-app control, so the guidance actually works.
  const streamCommand = "localstack aws iam stream";
  const dashboardUrl = "https://app.localstack.cloud/inst/default/policy-stream";

  return (
    <Card className="border-violet-500/20 bg-violet-500/5 p-4">
      <div className="mb-2 flex items-center gap-2">
        <Shield className="size-4 text-emerald-500" />
        <p className="text-sm font-medium text-foreground">IAM Policy Stream (LocalStack Pro)</p>
      </div>
      <p className="mb-3 text-sm text-muted-foreground">
        Capture a least-privilege IAM policy from this local run, then bake it back into the recipe.
      </p>
      <ol className="flex flex-col gap-2 text-sm text-muted-foreground">
        <li>
          1. Start LocalStack with <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">IAM_SOFT_MODE=1</code> so
          violations are logged without blocking calls.
        </li>
        <li className="flex flex-col gap-1.5">
          <span>2. Stream the generated policies in a terminal:</span>
          <span className="flex items-center justify-between gap-2 rounded-lg border bg-muted/40 p-2">
            <code className="select-text break-all font-mono text-xs text-foreground">{streamCommand}</code>
            <CopyButton value={streamCommand} />
          </span>
        </li>
        <li>3. Exercise the deployed stack (call the API), then copy the suggested policy into your IaC.</li>
      </ol>
      <button
        type="button"
        onClick={() => void openExternalUrl(dashboardUrl)}
        className="mt-3 inline-flex items-center gap-1 text-sm text-violet-600 hover:underline dark:text-violet-400"
      >
        Open the IAM Policy Stream dashboard
        <ExternalLink className="size-3.5" />
      </button>
    </Card>
  );
}

function LogCommandsCard({ deployment }: { deployment: Deployment }) {
  const commands = logCommandsForDeployment(deployment);

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <Terminal className="size-4 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">Runtime log commands</p>
      </div>
      {commands.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          This recipe does not produce application runtime logs by default. Static S3 sites need S3 or CloudFront access
          logging configured separately.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {commands.map((entry) => (
            <div key={entry.label} className="rounded-lg border bg-muted/40 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-foreground">{entry.label}</p>
                  <p className="text-xs text-muted-foreground">{entry.detail}</p>
                </div>
                <CopyButton value={entry.command} />
              </div>
              <code className="block select-text break-all rounded bg-background px-2.5 py-2 font-mono text-xs text-foreground">
                {entry.command}
              </code>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function OutputRow({ output, deployment }: { output: DeploymentOutput; deployment: Deployment }) {
  const [revealed, setRevealed] = useState(false);
  const value = String(output.value ?? "");
  const masked = Boolean(output.sensitive) && !revealed;
  const display = masked ? "••••••••" : value;
  const outputLink = !output.sensitive ? deploymentOutputLink(deployment, output) : null;
  const openUrl = outputLink?.url?.trim() ? outputLink.url : null;

  return (
    <div className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs font-medium text-foreground">{output.name}</span>
        <div className="flex items-center gap-1">
          {output.sensitive && (
            <button
              type="button"
              onClick={() => setRevealed((current) => !current)}
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              title={revealed ? "Hide value" : "Reveal value"}
            >
              {revealed ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
              {revealed ? "Hide" : "Reveal"}
            </button>
          )}
          {!masked && <CopyButton value={value} />}
        </div>
      </div>
      <code className="block select-text break-all rounded bg-muted px-2.5 py-1.5 text-xs text-foreground">
        {display}
      </code>
      {outputLink?.note && (
        <p className="text-xs text-amber-600 dark:text-amber-400">{outputLink.note}</p>
      )}
      {openUrl && (
        <button
          type="button"
          onClick={() => void openExternalUrl(openUrl)}
          className="inline-flex w-fit items-center gap-1 text-xs text-violet-500 hover:underline"
          title={outputLink?.title ?? "Open in your browser"}
        >
          <ExternalLink className="size-3" />
          {outputLink ? `${outputLink.label}: ${outputLink.url}` : "Open"}
        </button>
      )}
    </div>
  );
}

function CopyButton({ value }: { value: string }) {
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

function seedValues(variables: RecipeVariable[]): Record<string, unknown> {
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

function coerceValues(variables: RecipeVariable[], values: Record<string, unknown>): Record<string, unknown> {
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

function groupVariables(variables: RecipeVariable[]): { title: string; variables: RecipeVariable[] }[] {
  const groups: { title: string; variables: RecipeVariable[] }[] = [];
  for (const variable of variables) {
    let group = groups.find((entry) => entry.title === variable.group);
    if (!group) {
      group = { title: variable.group, variables: [] };
      groups.push(group);
    }
    group.variables.push(variable);
  }
  return groups;
}
