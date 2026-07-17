// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { ArrowLeft, ExternalLink, Loader2, RefreshCw, Rocket, ShieldAlert, ShieldCheck, Square, Trash2 } from "lucide-react";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { openExternalUrl } from "@/lib/backend";
import type { NavigateToResourceParams } from "@/lib/navigate-to-resource";
import type { Deployment, DeploymentOutput, RecipeManifest } from "@/types/backend";

import { formatDeploymentTargetLabel } from "@/lib/local-runtime-labels";

import { AppHandoffCard, LogCommandsCard, PostApplyWarningCard, SuperpowersCard } from "./cards";
import { deploymentOutputLink } from "./output-links";
import { CopyButton, RevealButton, StatusBadge } from "./shared";
import { VirtualizedLogPane } from "./components/virtualized-log-pane";
import { LabRunner } from "./lab/lab-runner";

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
  onCheckDrift,
  onUpdate,
  navigateToResource,
}: {
  deployment: Deployment;
  recipeManifest: RecipeManifest | null;
  logs: string[];
  logRef?: React.MutableRefObject<HTMLDivElement | null>;
  busy: boolean;
  onBack: () => void;
  onApply: (policyOverride?: string) => void;
  onDestroy: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onRetryPostApply: () => void;
  onCheckDrift?: () => void;
  onUpdate?: () => void;
  navigateToResource?: (params: NavigateToResourceParams) => void;
}) {
  const [policyOverrideOpen, setPolicyOverrideOpen] = useState(false);
  const [policyConfirmation, setPolicyConfirmation] = useState("");
  const canApply = deployment.status === "planned";
  const canDestroy = deployment.status === "applied";
  const isRunning =
    deployment.status === "planning" ||
    deployment.status === "applying" ||
    deployment.status === "destroying";
  const hasLiveResources = deployment.status === "applied" || (deployment.status === "cancelled" && (deployment.outputs?.length ?? 0) > 0);
  const canRemove = !isRunning && !hasLiveResources;
  const targetLabel = formatDeploymentTargetLabel(deployment);
  const isUpdateReplan = canApply && ((deployment.outputs?.length ?? 0) > 0 || (deployment.revisions?.length ?? 0) > 0);
  const policyOverridePhrase = `APPLY ${deployment.id}`;
  const policyOverrideValid = deployment.policy?.status === "blocked" && deployment.policy.override?.decisionDigest === deployment.policy.decisionDigest;
  const policyBlocksApply = canApply && !deployment.local && deployment.policy?.status === "blocked" && !policyOverrideValid;

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
          {recipeManifest && deployment.recipeVersion && recipeManifest.version && recipeManifest.version !== deployment.recipeVersion && (
            <p className="text-xs text-amber-600 dark:text-amber-400">Recipe updated: {deployment.recipeVersion} to {recipeManifest.version}. Use Update for the latest.</p>
          )}
        </div>
        <div className="flex gap-2">
          {isRunning && (
            <Button variant="destructive" onClick={onCancel}>
              <Square className="size-4" /> Stop
            </Button>
          )}
          {canApply && (
            <Button onClick={() => policyBlocksApply ? setPolicyOverrideOpen(true) : onApply()} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Rocket className="size-4" />}
              {policyBlocksApply ? "Review policy" : isUpdateReplan ? "Confirm and Apply" : "Apply"}
            </Button>
          )}
          {canDestroy && (
            <Button variant="destructive" onClick={onDestroy} disabled={busy}>
              <Trash2 className="size-4" /> Destroy
            </Button>
          )}
          {deployment.status === "applied" && onCheckDrift && (
            <Button variant="outline" size="sm" onClick={onCheckDrift} disabled={busy}>
              Check drift
            </Button>
          )}
          {deployment.status === "applied" && onUpdate && (
            <Button variant="outline" onClick={onUpdate} disabled={busy}>
              <RefreshCw className="size-4" /> Update
            </Button>
          )}
          {canRemove && (
            <Button variant="outline" onClick={onDelete}>
              <Trash2 className="size-4" /> Remove
            </Button>
          )}
        </div>
      </div>

      {isRunning && (
        <Card className="border-sky-500/30 bg-sky-500/5 p-4 text-sm text-sky-950 dark:text-sky-100">
          <p className="font-medium text-foreground">OpenTofu is still running</p>
          <p className="mt-1 text-muted-foreground">
            Quiet periods are normal while providers download or resources create. The log prints a
            heartbeat about every 45 seconds when OpenTofu has not produced new output.
          </p>
          {deployment.local &&
            (deployment.recipeId === "lab-postgres-flexible-azure" ||
              deployment.recipeId.includes("postgres")) && (
              <p className="mt-2 text-muted-foreground">
                First local PostgreSQL apply may take 1-2 minutes while Docker pulls the Postgres
                image. This is expected and is not cloud-only.
              </p>
            )}
        </Card>
      )}

      {deployment.error && (
        <Card className="border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm font-medium text-destructive">Deployment failed</p>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-xs text-destructive">
            {deployment.error}
          </pre>
          <p className="mt-2 text-xs text-muted-foreground">
            The message above includes the last OpenTofu output when available. Retry after fixing
            network, runtime, or lock issues, or stop a stuck run first.
          </p>
        </Card>
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
            {deployment.plan.changes.map((change) => {
              const destructive = change.actions.some((a) => a === "delete" || (a === "create" && change.actions.includes("delete")));
              return (
                <div key={change.address} className="flex items-center gap-2 font-mono text-xs">
                  <span className={destructive ? "text-destructive" : "text-muted-foreground"}>{change.actions.join(",")}</span>
                  <span className={destructive ? "text-destructive" : "text-foreground"}>{change.address}</span>
                </div>
              );
            })}
          </div>
          {deployment.plan.destroy > 0 && (
            <p className="mt-2 text-xs text-destructive">Destructive changes detected. Review carefully before confirming apply.</p>
          )}
        </Card>
      )}

      {deployment.policy && (
        <Card
          className={
            deployment.policy.status === "blocked"
              ? "border-destructive/40 bg-destructive/5 p-4"
              : deployment.policy.status === "warned"
                ? "border-amber-500/40 bg-amber-500/5 p-4"
                : "border-emerald-500/30 bg-emerald-500/5 p-4"
          }
        >
          <div className="flex items-start gap-3">
            {deployment.policy.status === "passed" ? (
              <ShieldCheck className="mt-0.5 size-5 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <ShieldAlert
                className={
                  deployment.policy.status === "blocked"
                    ? "mt-0.5 size-5 text-destructive"
                    : "mt-0.5 size-5 text-amber-600 dark:text-amber-400"
                }
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-foreground">Policy guardrails</p>
                <span className="rounded bg-background/70 px-2 py-0.5 text-xs font-medium uppercase tracking-wide">
                  {deployment.policy.status}
                </span>
              </div>
              {deployment.policy.status === "passed" ? (
                <p className="mt-1 text-xs text-muted-foreground">The saved plan passed all bundled guardrails.</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {deployment.policy.findings.map((finding) => {
                    const displaySeverity = deployment.local && finding.severity === "deny" ? "warning" : finding.severity;
                    return (
                      <div
                        key={`${finding.ruleId}:${finding.resourceAddress ?? finding.message}`}
                        className="rounded border border-border/70 bg-background/50 p-3"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-medium text-foreground">{finding.title}</span>
                          <span
                            className={
                              displaySeverity === "deny"
                                ? "text-xs font-medium text-destructive"
                                : "text-xs font-medium text-amber-600 dark:text-amber-400"
                            }
                          >
                            {displaySeverity}
                          </span>
                          <span className="font-mono text-[11px] text-muted-foreground">{finding.ruleId}</span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{finding.message}</p>
                        {finding.resourceAddress && (
                          <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">{finding.resourceAddress}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {deployment.local && deployment.policy.findings.some((finding) => finding.severity === "deny") && (
                <p className="mt-3 text-xs text-muted-foreground">Local targets warn only. Apply remains available.</p>
              )}
              {policyOverrideValid && (
                <p className="mt-3 text-xs text-destructive">A typed override is recorded for this exact plan and policy decision.</p>
              )}
            </div>
          </div>
        </Card>
      )}

      {deployment.revisions && deployment.revisions.length > 0 && (
        <Card className="p-4">
          <div className="mb-2 text-sm font-medium text-foreground">Revisions (B2 history)</div>
          <div className="space-y-1 text-xs">
            {deployment.revisions.slice().reverse().map((rev) => (
              <div key={rev.at} className="flex gap-2 text-muted-foreground">
                <span>{new Date(rev.at).toLocaleString()}</span>
                <span>v{rev.recipeVersion || '?'}</span>
                {rev.plan && <span>+{rev.plan.add} ~{rev.plan.change} -{rev.plan.destroy}</span>}
              </div>
            ))}
          </div>
        </Card>
      )}

      {deployment.drift && (
        <Card className="p-4">
          <div className="mb-2 flex items-center gap-2 text-sm">
            <span className="font-medium text-foreground">Drift</span>
            {deployment.drift.hasDrift ? (
              <span className="rounded bg-amber-500/15 px-2 py-0.5 text-xs text-amber-600 dark:text-amber-400">drift detected</span>
            ) : (
              <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-600 dark:text-emerald-400">in sync</span>
            )}
          </div>
          {deployment.drift.hasDrift && deployment.drift.drift ? (
            <div className="text-xs text-muted-foreground">
              {deployment.drift.drift.changes?.length || 0} resource(s) drifted. Use the workspace to inspect.
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">No drift detected on last check.</div>
          )}
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

      {deployment.status === "applied" && recipeManifest?.lab && (
        <LabRunner
          deployment={deployment}
          labSpec={recipeManifest.lab}
          providerId={deployment.providerId === "azure" ? "azure" : "aws"}
          navigateToResource={navigateToResource}
        />
      )}

      <LogCommandsCard deployment={deployment} />

      <div>
        <p className="mb-2 text-sm font-medium text-foreground">Logs</p>
        <VirtualizedLogPane lines={logs} scrollRef={logRef} />
      </div>

      <AlertDialog
        open={policyOverrideOpen}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setPolicyOverrideOpen(false);
            setPolicyConfirmation("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Override blocking policy findings</AlertDialogTitle>
            <AlertDialogDescription>
              This live-cloud plan has {deployment.policy?.blockingCount ?? 0} blocking finding(s). Review the findings above, then type{" "}
              <span className="font-mono font-medium text-foreground">{policyOverridePhrase}</span>{" "}
              to apply this exact saved plan. The override will be recorded in Activity.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={policyConfirmation}
            placeholder={policyOverridePhrase}
            aria-label="Policy override confirmation"
            disabled={busy}
            onChange={(event) => setPolicyConfirmation(event.target.value)}
          />
          <AlertDialogFooter>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setPolicyOverrideOpen(false);
                setPolicyConfirmation("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy || policyConfirmation !== policyOverridePhrase}
              onClick={() => {
                const confirmation = policyConfirmation;
                setPolicyOverrideOpen(false);
                setPolicyConfirmation("");
                onApply(confirmation);
              }}
            >
              Apply with override
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
