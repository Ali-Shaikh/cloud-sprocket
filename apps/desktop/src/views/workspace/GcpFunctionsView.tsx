// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useMemo, useState } from "react";
import { RefreshCw, Zap } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { InlineBanner } from "@/components/inline-banner";
import { ResourceTable } from "@/components/inventory/resource-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { GcpCloudFunction, WorkspaceSnapshot } from "@/types/backend";

export type GcpFunctionsViewProps = {
  workspace: WorkspaceSnapshot;
  onRefresh: () => void;
};

/**
 * Foundation Cloud Functions panel: lists 1st and 2nd gen functions from the
 * workspace snapshot. Invoke and lifecycle actions are deferred.
 */
export default function GcpFunctionsView({ workspace, onRefresh }: GcpFunctionsViewProps) {
  const [filterText, setFilterText] = useState("");
  const functions = workspace.gcpFunctions ?? [];
  const status = workspace.gcpFunctionsStatusMessage?.trim() ?? "";

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
        <Button variant="outline" size="sm" onClick={onRefresh}>
          <RefreshCw className="size-3.5" />
          Refresh
        </Button>
      </header>

      {status ? (
        <InlineBanner
          tone={status.startsWith("Could not") ? "warning" : "info"}
          title={status.split("\n")[0] ?? status}
          description={
            status.includes("\n")
              ? status.split("\n").slice(1).join(" ").trim()
              : "Invoke and lifecycle actions are not available in this foundation release."
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
          getRowKey={(row) => `${row.region ?? ""}/${row.name}`}
          selectedKey={
            workspace.selectedGcpFunction
              ? workspace.selectedGcpFunction
              : undefined
          }
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
    </div>
  );
}
