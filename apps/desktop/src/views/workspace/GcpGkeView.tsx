// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useMemo, useState } from "react";
import { Boxes, RefreshCw } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { InlineBanner } from "@/components/inline-banner";
import { ResourceTable } from "@/components/inventory/resource-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { GcpGkeCluster, WorkspaceSnapshot } from "@/types/backend";

export type GcpGkeViewProps = {
  workspace: WorkspaceSnapshot;
  onRefresh: () => void;
};

/**
 * Foundation GKE panel: lists clusters from the workspace snapshot.
 * Node pool and credentials actions are deferred.
 */
export default function GcpGkeView({ workspace, onRefresh }: GcpGkeViewProps) {
  const [filterText, setFilterText] = useState("");
  const clusters = workspace.gcpGkeClusters ?? [];
  const status = workspace.gcpGkeStatusMessage?.trim() ?? "";

  const filtered = useMemo(() => {
    const query = filterText.trim().toLowerCase();
    if (!query) {
      return clusters;
    }
    return clusters.filter((cluster) => {
      const haystack = [
        cluster.name,
        cluster.location,
        cluster.status,
        cluster.masterVersion,
        cluster.mode,
        cluster.endpoint,
        cluster.summary,
        cluster.nodeCount != null ? String(cluster.nodeCount) : "",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [clusters, filterText]);

  const projectLabel =
    workspace.profile?.attributes.find((field) => field.label.toLowerCase() === "project")
      ?.value ?? workspace.profile?.displayName;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[1.375rem] font-[750] tracking-[-0.015em]">GKE</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Kubernetes cluster inventory for the open gcloud configuration
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
              : "Node pool and credentials actions are not available in this foundation release."
          }
        />
      ) : null}

      <section className="space-y-3 rounded-lg border border-border bg-card p-[18px] shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold">Clusters</h2>
            <p className="text-xs text-muted-foreground">
              {clusters.length === 1 ? "1 cluster" : `${clusters.length} clusters`} loaded via
              gcloud.
            </p>
          </div>
          <Input
            value={filterText}
            onChange={(event) => setFilterText(event.target.value)}
            placeholder="Filter clusters"
            className="max-w-xs"
            aria-label="Filter GKE clusters"
          />
        </div>

        <ResourceTable<GcpGkeCluster>
          columns={[
            { id: "name", label: "Name" },
            { id: "location", label: "Location" },
            { id: "status", label: "Status" },
            { id: "mode", label: "Mode" },
            { id: "masterVersion", label: "Version" },
            { id: "nodeCount", label: "Nodes" },
          ]}
          rows={filtered}
          getRowKey={(row) => row.name}
          selectedKey={workspace.selectedGcpGkeCluster}
          renderCell={(row, columnId) => {
            switch (columnId) {
              case "name":
                return row.name;
              case "location":
                return row.location || "-";
              case "status":
                return row.status || "-";
              case "mode":
                return row.mode || "-";
              case "masterVersion":
                return row.masterVersion || "-";
              case "nodeCount":
                return row.nodeCount != null ? String(row.nodeCount) : "-";
              default:
                return null;
            }
          }}
          emptyState={
            <EmptyState
              icon={<Boxes />}
              title={
                clusters.length === 0
                  ? "No clusters in this project"
                  : "No clusters match the filter"
              }
              description={
                clusters.length === 0
                  ? "Create a GKE cluster in the console or with gcloud, then refresh."
                  : "Clear the filter to see the full inventory."
              }
            />
          }
        />
      </section>
    </div>
  );
}
