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
  Square,
  Trash2,
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

interface TargetOption {
  id: string;
  label: string;
  providerId: string;
  profileId: string;
  local: boolean;
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

export default function DeployView({ profiles }: { profiles: ProfileSummary[] }) {
  const [mode, setMode] = useState<Mode>("list");
  const [recipes, setRecipes] = useState<RecipeManifest[]>([]);
  const [tofu, setTofu] = useState<TofuStatus | null>(null);
  const [installing, setInstalling] = useState(false);
  const [deployments, setDeployments] = useState<Deployment[]>([]);

  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [target, setTarget] = useState<string>("local");
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
    const options: TargetOption[] = [
      { id: "local", label: "Local emulator (LocalStack)", providerId: "aws", profileId: "", local: true },
    ];
    for (const profile of profiles) {
      if (profile.providerId === "aws") {
        options.push({
          id: `profile:${profile.profileId}`,
          label: `AWS · ${profile.displayName}`,
          providerId: "aws",
          profileId: profile.profileId,
          local: false,
        });
      }
    }
    return options;
  }, [profiles]);

  async function openRecipe(id: string) {
    try {
      const loaded = await getRecipe(id);
      setRecipe(loaded);
      setValues(seedValues(loaded.variables));
      setTarget("local");
      setMode("configure");
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
        title="Deploy a recipe"
        description="Pick a parameterised stack, customise the variables, and deploy it to a local emulator or your cloud."
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

      <div>
        <h3 className="mb-3 text-sm font-semibold text-foreground">Recipes</h3>
        {recipes.length === 0 ? (
          <EmptyState icon={<Boxes className="size-6" />} title="No recipes available" description="Bundled recipes ship with the app." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {recipes.map((manifest) => (
              <Card key={manifest.id} className="flex flex-col gap-3 p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="grid size-10 place-items-center rounded-lg bg-violet-500/10 text-violet-500">
                    <Rocket className="size-5" />
                  </div>
                  <div className="flex items-center gap-2">
                    {manifest.local?.requiresPro && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                        <Crown className="size-3" /> Pro
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
                <Button className="mt-1 self-start" onClick={() => void openRecipe(manifest.id)}>
                  Configure
                </Button>
              </Card>
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

      {recipe.manifest.local?.requiresPro && (
        <Card className="flex items-center gap-2 border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-400">
          <Crown className="size-4 shrink-0" />
          Uses services that only emulate on LocalStack Pro. Use a LocalStack Pro/Team token for a local
          dry-run, or pick a real AWS profile to deploy to the cloud.
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
          The local emulator runs the same recipe against LocalStack. Switch to a profile to deploy to real AWS.
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
              <OutputRow key={output.name} output={output} local={deployment.local} />
            ))}
          </div>
        </Card>
      )}

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

function OutputRow({ output, local }: { output: DeploymentOutput; local: boolean }) {
  const [revealed, setRevealed] = useState(false);
  const value = String(output.value ?? "");
  const masked = Boolean(output.sensitive) && !revealed;
  const display = masked ? "••••••••" : value;
  const localUrl = local && !output.sensitive ? toLocalStackUrl(value) : null;
  const directUrl = !output.sensitive && /^https?:\/\//i.test(value) ? value : null;
  const openUrl = localUrl ?? directUrl;

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
      {openUrl && (
        <button
          type="button"
          onClick={() => void openExternalUrl(openUrl)}
          className="inline-flex w-fit items-center gap-1 text-xs text-violet-500 hover:underline"
          title={
            localUrl
              ? "The value above is the AWS-format endpoint Terraform reports; this opens the URL actually reachable on LocalStack."
              : "Open in your browser"
          }
        >
          <ExternalLink className="size-3" />
          {localUrl ? `Open on LocalStack: ${localUrl}` : "Open"}
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

// toLocalStackUrl rewrites an AWS-format endpoint (which Terraform's aws provider
// always computes, even against LocalStack) into the URL actually reachable on
// the local emulator via *.localhost.localstack.cloud:4566. Returns null when no
// known pattern matches, so real-cloud values are left untouched.
function toLocalStackUrl(value: string): string | null {
  if (!value) return null;
  let rewritten = value
    .replace(/\.s3-website[.-][a-z0-9-]+\.amazonaws\.com/i, ".s3-website.localhost.localstack.cloud:4566")
    .replace(/\.s3[.-][a-z0-9-]+\.amazonaws\.com/i, ".s3.localhost.localstack.cloud:4566")
    .replace(/\.execute-api\.[a-z0-9-]+\.amazonaws\.com/i, ".execute-api.localhost.localstack.cloud:4566")
    .replace(/\.cloudfront\.net/i, ".cloudfront.localhost.localstack.cloud:4566")
    .replace(/\.[a-z0-9-]+\.elb\.amazonaws\.com/i, ".elb.localhost.localstack.cloud:4566");
  if (rewritten === value) return null;
  if (!/^https?:\/\//i.test(rewritten)) {
    rewritten = "http://" + rewritten;
  } else {
    rewritten = rewritten.replace(/^https:\/\//i, "http://");
  }
  return rewritten;
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
