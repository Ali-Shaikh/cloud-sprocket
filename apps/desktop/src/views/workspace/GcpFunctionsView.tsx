// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useMemo, useState } from "react";
import { Play, RefreshCw, Zap } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { InlineBanner } from "@/components/inline-banner";
import { ResourceTable } from "@/components/inventory/resource-table";
import { StatusPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { actionCapabilityState, actionDisabledReason } from "@/lib/action-capabilities";
import { cn } from "@/lib/utils";
import type {
  GcpCloudFunction,
  GcpCloudFunctionInvokeResult,
  WorkspaceSnapshot,
} from "@/types/backend";

export type GcpFunctionsViewProps = {
  workspace: WorkspaceSnapshot;
  onRefresh: () => void;
  onSelectFunction?: (functionKey: string, name: string, region: string) => void;
  onInvoke?: (
    name: string,
    region: string,
    generation: string,
    data: string,
  ) => Promise<GcpCloudFunctionInvokeResult>;
};

const fieldLabel =
  "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

function functionKey(fn: GcpCloudFunction): string {
  const region = (fn.region ?? "").trim();
  const name = (fn.name ?? "").trim();
  return region ? `${region}/${name}` : name;
}

/**
 * Cloud Functions panel: inventory, selection, and write-gated invoke via
 * gcloud functions call.
 */
export default function GcpFunctionsView({
  workspace,
  onRefresh,
  onSelectFunction,
  onInvoke,
}: GcpFunctionsViewProps) {
  const [filterText, setFilterText] = useState("");
  const [payload, setPayload] = useState('{\n  "name": "world"\n}');
  const [invoking, setInvoking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GcpCloudFunctionInvokeResult | null>(null);

  const functions = workspace.gcpFunctions ?? [];
  const status = workspace.gcpFunctionsStatusMessage?.trim() ?? "";
  const selectedKey = workspace.selectedGcpFunction ?? "";
  const selected = functions.find((fn) => functionKey(fn) === selectedKey);

  const invokeCapability = actionCapabilityState(workspace, "functions", "invoke", "gcp");
  const canWrite = invokeCapability.enabled;
  const canInvoke =
    Boolean(onInvoke) && invokeCapability.enabled && Boolean(selected) && !invoking;
  const invokeDisabledReason = canInvoke
    ? undefined
    : actionDisabledReason(
        workspace,
        "functions",
        "invoke",
        !selected ? "Select a function to invoke." : undefined,
        "gcp",
      );

  const filtered = useMemo(() => {
    const query = filterText.trim().toLowerCase();
    if (!query) {
      return functions;
    }
    return functions.filter((fn) => {
      const haystack = [
        fn.name,
        fn.region,
        fn.runtime,
        fn.status,
        fn.generation,
        fn.trigger,
        fn.url,
        fn.summary,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [functions, filterText]);

  const projectLabel =
    workspace.profile?.attributes.find((field) => field.label.toLowerCase() === "project")
      ?.value ?? workspace.profile?.displayName;

  async function invoke() {
    if (!canInvoke || !selected || !onInvoke) {
      return;
    }
    setInvoking(true);
    setError(null);
    try {
      setResult(
        await onInvoke(
          selected.name,
          selected.region ?? "",
          selected.generation ?? "",
          payload,
        ),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setResult(null);
    } finally {
      setInvoking(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[1.375rem] font-[750] tracking-[-0.015em]">Cloud Functions</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Function inventory for the open gcloud configuration
            {projectLabel ? ` · project ${projectLabel}` : ""}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill
            status={canWrite ? "on" : "warning"}
            label={canWrite ? "Writes enabled" : "Read-only"}
          />
          <Button variant="outline" size="sm" onClick={onRefresh}>
            <RefreshCw className="size-3.5" />
            Refresh
          </Button>
        </div>
      </header>

      {status ? (
        <InlineBanner
          tone={status.startsWith("Could not") ? "warning" : "info"}
          title={status.split("\n")[0] ?? status}
          description={
            status.includes("\n")
              ? status.split("\n").slice(1).join(" ").trim()
              : "Select a function and enable write mode to invoke via gcloud functions call."
          }
        />
      ) : null}

      <section className="space-y-3 rounded-lg border border-border bg-card p-[18px] shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold">Functions</h2>
            <p className="text-xs text-muted-foreground">
              {functions.length === 1 ? "1 function" : `${functions.length} functions`} loaded via
              gcloud (1st and 2nd gen).
            </p>
          </div>
          <Input
            value={filterText}
            onChange={(event) => setFilterText(event.target.value)}
            placeholder="Filter functions"
            className="max-w-xs"
            aria-label="Filter Cloud Functions"
          />
        </div>

        <ResourceTable<GcpCloudFunction>
          columns={[
            { id: "name", label: "Name" },
            { id: "region", label: "Region" },
            { id: "runtime", label: "Runtime" },
            { id: "status", label: "Status" },
            { id: "generation", label: "Generation" },
            { id: "trigger", label: "Trigger" },
          ]}
          rows={filtered}
          getRowKey={(row) => functionKey(row)}
          selectedKey={selectedKey || undefined}
          onRowClick={(row) => {
            onSelectFunction?.(functionKey(row), row.name, row.region ?? "");
            setResult(null);
            setError(null);
          }}
          renderCell={(row, columnId) => {
            switch (columnId) {
              case "name":
                return row.name;
              case "region":
                return row.region || "-";
              case "runtime":
                return row.runtime || "-";
              case "status":
                return row.status || "-";
              case "generation":
                return row.generation || "-";
              case "trigger":
                return row.trigger || "-";
              default:
                return null;
            }
          }}
          emptyState={
            <EmptyState
              icon={<Zap />}
              title={
                functions.length === 0
                  ? "No functions in this project"
                  : "No functions match the filter"
              }
              description={
                functions.length === 0
                  ? "Deploy a Cloud Function with gcloud or the console, then refresh."
                  : "Clear the filter to see the full inventory."
              }
            />
          }
        />
      </section>

      {onInvoke ? (
        <section className="space-y-3 rounded-lg border border-border bg-card p-[18px] shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-bold">Invoke</h2>
            <Button onClick={() => void invoke()} disabled={!canInvoke} title={invokeDisabledReason}>
              <Play className="size-3.5" />
              {invoking ? "Invoking…" : "Invoke"}
            </Button>
          </div>
          {invokeDisabledReason ? (
            <p className="text-sm text-muted-foreground">{invokeDisabledReason}</p>
          ) : null}
          <div>
            <div className={cn(fieldLabel, "mb-1")}>
              Request body{selected ? ` · ${selected.name}` : ""}
            </div>
            <textarea
              value={payload}
              onChange={(event) => setPayload(event.target.value)}
              spellCheck={false}
              rows={5}
              aria-label="Function payload"
              className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {result ? (
            <div className="space-y-2">
              <div className={cn(fieldLabel)}>Response · {result.name}</div>
              <pre className="max-h-64 overflow-auto rounded-lg border border-border bg-muted px-3 py-2 font-mono text-xs text-foreground">
                {result.body || "(empty response)"}
              </pre>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
