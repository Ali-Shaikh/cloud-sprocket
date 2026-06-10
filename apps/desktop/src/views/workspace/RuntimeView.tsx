import { RefreshCw } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LogStream } from "@/components/log-stream";
import { ProviderIcon } from "@/components/provider-icon";
import { StatusPill } from "@/components/status-pill";
import { StatusDot, type Status } from "@/components/status-dot";
import { DetailFieldList } from "./detail-fields";
import type {
  EmulatorLogSnapshot,
  EmulatorSummary,
  WorkspaceSnapshot,
} from "@/types/backend";

export type EmulatorAction = "prepareProfile" | "start" | "stop";

/** Controls and live state for one managed emulator card. */
export type EmulatorControls = {
  persistence: boolean;
  onPersistenceChange: (value: boolean) => void;
  environmentText: string;
  onEnvironmentTextChange: (value: string) => void;
  logs: EmulatorLogSnapshot;
  logsStatus: string;
  actionStatus: string;
  actionInFlight: boolean;
  onRefreshLogs: () => void;
  onInvokeAction: (action: EmulatorAction) => void;
  /** LocalStack only: the auth token field. */
  authToken?: string;
  onAuthTokenChange?: (value: string) => void;
};

export type RuntimeViewProps = {
  workspace: WorkspaceSnapshot;
  /** True when no workspace is open (reached from the rail before connecting). */
  unlocked: boolean;
  showSensitiveValues: boolean;
  onRefreshDockerRuntime: () => void;
  localStack: EmulatorControls;
  flociAz: EmulatorControls;
};

function emulatorStatus(value?: string): Status {
  if (value === "running") {
    return "on";
  }
  if (value === "unhealthy") {
    return "error";
  }
  if (value === "not-configured") {
    return "warning";
  }
  return "off";
}

function dockerEngineStatus(value?: string): Status {
  if (value === "available") {
    return "on";
  }
  if (value === "unavailable") {
    return "warning";
  }
  return "off";
}

function emulatorImage(emulator: EmulatorSummary): string | undefined {
  return emulator.details.find((field) => field.label === "Image")?.value;
}

const fieldLabel =
  "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

const sectionCard = "space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm";

/**
 * M6 Local Runtime: Tailwind replacement for the Cloudscape virtualisation
 * tab. Emulator cards with start/stop/prepare controls and inline logs, the
 * Docker engine status, managed Docker resources, local config artefacts, and
 * the runtime settings. Serves both the open-workspace tab and the standalone
 * rail destination used before a workspace is opened.
 */
export default function RuntimeView({
  workspace,
  unlocked,
  showSensitiveValues,
  onRefreshDockerRuntime,
  localStack,
  flociAz,
}: RuntimeViewProps) {
  const dockerReachable = workspace.dockerRuntime.reachable;
  const emulatorCount = workspace.emulatorSummaries.length;

  const renderEmulatorCard = (emulator: EmulatorSummary) => {
    const controls =
      emulator.emulatorId === "localstack"
        ? localStack
        : emulator.emulatorId === "floci-az"
          ? flociAz
          : undefined;
    // Persistence and environment only take effect when the container is
    // (re)created on start, so lock them while a container is present.
    const settingsLocked = emulator.status === "running" || emulator.status === "unhealthy";
    const isLocalStack = emulator.emulatorId === "localstack";
    const profileLabel = isLocalStack ? "Create AWS Profile" : "Create Azure Profile";
    const startLabel = isLocalStack ? "Start LocalStack" : "Start floci-az";
    const stopLabel = isLocalStack ? "Stop LocalStack" : "Stop floci-az";

    return (
      <div key={emulator.emulatorId} className={sectionCard}>
        <div className="flex items-center gap-3">
          <div className="grid size-11 shrink-0 place-items-center rounded-[11px] bg-muted">
            <ProviderIcon provider={emulator.providerId} size={28} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold">{emulator.label}</div>
            <div className="truncate font-mono text-xs text-muted-foreground">
              {emulatorImage(emulator) ?? `${emulator.providerId.toUpperCase()} via ${emulator.kind}`}
            </div>
          </div>
          <StatusPill
            className="shrink-0"
            status={emulatorStatus(emulator.status)}
            label={emulator.status}
            pulse={emulator.status === "running"}
          />
        </div>

        <p className="text-sm text-muted-foreground">{emulator.summary}</p>

        <DetailFieldList
          fields={emulator.details}
          emptyText="No emulator details are available yet."
          showSensitiveValues={showSensitiveValues}
        />

        {controls ? (
          <>
            <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
              <div className={fieldLabel}>Runtime Action</div>
              <p className="text-sm">{controls.actionStatus}</p>
              {settingsLocked ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Stop {emulator.label} to change{" "}
                  {isLocalStack ? "the auth token, persistence, or environment" : "persistence or environment"}.
                  These apply only when the container is started.
                </p>
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {isLocalStack && controls.onAuthTokenChange ? (
                <div>
                  <div className={cn(fieldLabel, "mb-1")}>LocalStack Auth Token</div>
                  <Input
                    type="password"
                    value={controls.authToken ?? ""}
                    placeholder="Paste token"
                    aria-label="LocalStack auth token"
                    disabled={settingsLocked}
                    onChange={(event) => {
                      controls.onAuthTokenChange?.(event.target.value);
                    }}
                  />
                </div>
              ) : null}
              <div>
                <div className={cn(fieldLabel, "mb-1")}>Persistence</div>
                <label className="flex items-center gap-2.5 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={controls.persistence}
                    disabled={settingsLocked}
                    onChange={(event) => {
                      controls.onPersistenceChange(event.target.checked);
                    }}
                    className="size-4 accent-[color:var(--primary)]"
                  />
                  <span>Enable {emulator.label} persistence</span>
                </label>
              </div>
              <div className="sm:col-span-2">
                <div className={cn(fieldLabel, "mb-1")}>Environment Variables</div>
                <Textarea
                  value={controls.environmentText}
                  placeholder={isLocalStack ? "DEBUG=1" : "FLOCI_AZ_SERVICES_FUNCTIONS_ENABLED=false"}
                  rows={3}
                  disabled={settingsLocked}
                  onChange={(event) => {
                    controls.onEnvironmentTextChange(event.target.value);
                  }}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={controls.actionInFlight}
                onClick={() => {
                  controls.onInvokeAction("prepareProfile");
                }}
              >
                {profileLabel}
              </Button>
              <Button
                size="sm"
                disabled={controls.actionInFlight || emulator.status === "running"}
                onClick={() => {
                  controls.onInvokeAction("start");
                }}
              >
                {startLabel}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={
                  controls.actionInFlight ||
                  (emulator.status !== "running" && emulator.status !== "unhealthy")
                }
                onClick={() => {
                  controls.onInvokeAction("stop");
                }}
              >
                {stopLabel}
              </Button>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className={fieldLabel}>Logs</span>
                <Button variant="ghost" size="sm" onClick={controls.onRefreshLogs}>
                  <RefreshCw />
                  Refresh Logs
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {controls.logsStatus || controls.logs.summary}
              </p>
              <LogStream lines={controls.logs.lines} className="[&_[data-radix-scroll-area-viewport]]:max-h-40" />
            </div>
          </>
        ) : null}
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex items-start gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Local Runtime</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Run cloud APIs on your machine. Docker engine{" "}
            {dockerReachable ? "running" : "not detected"} · {emulatorCount} emulator
            {emulatorCount === 1 ? "" : "s"}
          </p>
          {unlocked ? (
            <p className="mt-1 text-sm text-muted-foreground">
              Manage Docker, LocalStack, and floci-az without an open workspace. Prepare a
              local profile or config here, then return to Connect to open it.
            </p>
          ) : null}
        </div>
        <Button variant="outline" size="sm" className="ml-auto" onClick={onRefreshDockerRuntime}>
          <RefreshCw />
          Refresh Docker
        </Button>
      </header>

      <section className={sectionCard}>
        <div>
          <h2 className="text-base font-bold">Docker Runtime</h2>
          <p className="text-sm text-muted-foreground">
            Live Docker engine status, endpoint resolution, and CloudSprocket ownership policy.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
            <div className={fieldLabel}>Engine State</div>
            <p className="flex items-center gap-1.5 text-sm">
              <StatusDot status={dockerEngineStatus(workspace.dockerDiagnostics.engineState)} />
              {workspace.dockerDiagnostics.engineState}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
            <div className={fieldLabel}>Endpoint</div>
            <p className="truncate font-mono text-xs leading-6">
              {workspace.dockerRuntime.host || "Not detected"}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
            <div className={fieldLabel}>Server Version</div>
            <p className="truncate text-sm">
              {workspace.dockerRuntime.serverVersion || "Unavailable"}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
            <div className={fieldLabel}>Ownership Policy</div>
            <p className="line-clamp-2 text-xs">
              {workspace.dockerRuntime.resourceOwnership.summary}
            </p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{workspace.dockerRuntime.summary}</p>
        <DetailFieldList
          fields={workspace.dockerRuntime.details}
          emptyText="No Docker diagnostics are available yet."
          showSensitiveValues={showSensitiveValues}
        />
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-base font-bold">Local Runtimes</h2>
          <p className="text-sm text-muted-foreground">
            Managed local runtimes for AWS and Azure.
          </p>
        </div>
        {workspace.emulatorSummaries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No emulator summaries are available yet.</p>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {workspace.emulatorSummaries.map(renderEmulatorCard)}
          </div>
        )}
      </section>

      <section className={sectionCard}>
        <div>
          <h2 className="text-base font-bold">Managed Docker Resources</h2>
          <p className="text-sm text-muted-foreground">
            Only resources carrying the CloudSprocket ownership labels appear here.
          </p>
        </div>
        {workspace.dockerResources.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No CloudSprocket-managed Docker resources are currently detected.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {workspace.dockerResources.map((resource) => (
              <div
                key={`${resource.kind}-${resource.resourceId}`}
                className="space-y-2 rounded-lg border border-border bg-muted/40 p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={fieldLabel}>{resource.kind.toUpperCase()}</span>
                  <StatusPill
                    status={resource.state === "running" ? "on" : "off"}
                    label={resource.state || "detected"}
                  />
                </div>
                <div className="text-sm font-semibold">{resource.name}</div>
                <p className="text-xs text-muted-foreground">{resource.summary}</p>
                <DetailFieldList
                  fields={resource.details}
                  emptyText="No resource details are available yet."
                  showSensitiveValues={showSensitiveValues}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={sectionCard}>
        <div>
          <h2 className="text-base font-bold">Local Config Artifacts</h2>
          <p className="text-sm text-muted-foreground">
            App-managed local configuration artefacts are isolated from the user's default
            cloud configuration.
          </p>
        </div>
        {workspace.localConfigArtifacts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No local configuration artefacts are managed yet.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {workspace.localConfigArtifacts.map((artifact) => (
              <div
                key={artifact.artifactId}
                className="space-y-1.5 rounded-lg border border-border bg-muted/40 p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={fieldLabel}>{artifact.label}</span>
                  <StatusPill
                    status={artifact.status === "available" ? "on" : "warning"}
                    label={artifact.status}
                  />
                </div>
                <p className="break-all font-mono text-xs">{artifact.path}</p>
                <p className="text-xs text-muted-foreground">{artifact.summary}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={sectionCard}>
        <div>
          <h2 className="text-base font-bold">Runtime Settings</h2>
          <p className="text-sm text-muted-foreground">
            Paths and platform data coming from the Go daemon.
          </p>
        </div>
        <DetailFieldList
          fields={[
            { label: "Platform", value: workspace.runtimeSettings.platformName || "Unknown" },
            { label: "Runtime Mode", value: workspace.runtimeSettings.runtimeMode || "cloud" },
            { label: "Config Root", value: workspace.runtimeSettings.configDir || "Unavailable" },
            { label: "Database", value: workspace.runtimeSettings.databasePath || "Unavailable" },
            { label: "Log Path", value: workspace.runtimeSettings.logPath || "Unavailable" },
            {
              label: "Local Config Root",
              value: workspace.runtimeSettings.localConfigDir || "Unavailable",
            },
            {
              label: "Emulator State Root",
              value: workspace.runtimeSettings.emulatorStateDir || "Unavailable",
            },
            {
              label: "LocalStack Image",
              value: workspace.runtimeSettings.localStackImage || "localstack/localstack:stable",
            },
            {
              label: "floci-az Image",
              value: workspace.runtimeSettings.flociAzImage || "floci/floci-az:latest",
            },
          ]}
          emptyText="No runtime settings are available yet."
        />
      </section>
    </div>
  );
}
