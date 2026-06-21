// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { ArrowLeft, ExternalLink, Loader2, Rocket, Square, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { openExternalUrl } from "@/lib/backend";
import type { Deployment, DeploymentOutput, RecipeManifest } from "@/types/backend";

import { AppHandoffCard, LogCommandsCard, PostApplyWarningCard, SuperpowersCard } from "./deployCards";
import { deploymentOutputLink, runtimeDisplayName } from "./deployOutputLinks";
import { CopyButton, RevealButton, StatusBadge } from "./deployShared";

export function DeploymentDetail({
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
  onRetryPostApply,
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
  onRetryPostApply: () => void;
}) {
  const canApply = deployment.status === "planned";
  const canDestroy = deployment.status === "applied";
  const isRunning =
    deployment.status === "planning" ||
    deployment.status === "applying" ||
    deployment.status === "destroying";
  const canRemove = !isRunning && !canDestroy;
  const targetLabel = deployment.local
    ? `Local emulator (${runtimeDisplayName(deployment.runtimeId ?? "localstack")})`
    : `${deployment.providerId} · ${deployment.profileId}`;

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
          <p className="text-sm text-muted-foreground">{targetLabel}</p>
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

      <PostApplyWarningCard deployment={deployment} busy={busy} onRetry={onRetryPostApply} />

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
          {output.sensitive && <RevealButton revealed={revealed} onToggle={() => setRevealed((current) => !current)} />}
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