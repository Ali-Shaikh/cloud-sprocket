// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { ExternalLink, Shield, Terminal } from "lucide-react";

import { Card } from "@/components/ui/card";
import { openExternalUrl } from "@/lib/backend";
import type { Deployment, RecipeManifest } from "@/types/backend";

import { logCommandsForDeployment } from "./deployOutputLinks";
import { CopyButton } from "./deployShared";

export function AppHandoffCard({ deployment }: { deployment: Deployment }) {
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

export function PostApplyWarningCard({
  deployment,
  busy,
  onRetry,
}: {
  deployment: Deployment;
  busy: boolean;
  onRetry: () => void;
}) {
  if (!deployment.postApplyError) return null;

  return (
    <Card className="border-amber-500/30 bg-amber-500/5 p-4">
      <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Infrastructure applied; post-apply step failed</p>
      <p className="mt-2 text-sm text-muted-foreground">
        OpenTofu finished successfully and outputs are available below. A post-apply command (for example database
        migrations) failed and can be retried without re-running apply.
      </p>
      <p className="mt-2 rounded bg-muted px-3 py-2 font-mono text-xs text-destructive">{deployment.postApplyError}</p>
      <button
        type="button"
        onClick={onRetry}
        disabled={busy}
        className="mt-3 inline-flex items-center rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
      >
        Retry post-apply steps
      </button>
    </Card>
  );
}

export function SuperpowersCard({
  deployment,
  superpowers,
}: {
  deployment: Deployment;
  superpowers: NonNullable<RecipeManifest["superpowers"]>;
}) {
  if (!superpowers.iamPolicyStream || !deployment.local) return null;

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

export function LogCommandsCard({ deployment }: { deployment: Deployment }) {
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