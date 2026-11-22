// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useMemo, useState } from "react";
import { Boxes, KeyRound, RefreshCw } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { InventoryLoadingState } from "@/components/inventory-loading-state";
import { InlineBanner } from "@/components/inline-banner";
import { ResourceTable } from "@/components/inventory/resource-table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { actionCapabilityState } from "@/lib/action-capabilities";
import { GCP_CREATE_HINTS, gcpTableEmptyCopy } from "@/lib/gcp-empty-copy";
import { gcpInventoryLoadingLabel } from "@/lib/gcp-inventory";
import type {
  GcpGkeCluster,
  GcpGkeNodePool,
  WorkspaceSnapshot,
} from "@/types/backend";

export type GcpGkeViewProps = {
  workspace: WorkspaceSnapshot;
  onRefresh: () => void;
  onSelectCluster?: (
    clusterName: string,
    location: string,
  ) => void | Promise<boolean>;
  onGetCredentials?: (clusterName: string, location: string) => Promise<void>;
  inventoryLoading?: boolean;
};

function clusterKey(cluster: GcpGkeCluster): string {
  return `${cluster.location ?? ""}/${cluster.name}`;
}

export default function GcpGkeView({
  workspace,
  onRefresh,
  onSelectCluster,
  onGetCredentials,
  inventoryLoading = false,
}: GcpGkeViewProps) {
  const [filterText, setFilterText] = useState("");
  const [selectingCluster, setSelectingCluster] = useState(false);
  const [credentialTarget, setCredentialTarget] = useState<{
    name: string;
    location: string;
  } | null>(null);
  const [gettingCredentials, setGettingCredentials] = useState(false);
  const clusters = workspace.gcpGkeClusters ?? [];
  const nodePools = workspace.gcpGkeNodePools ?? [];
  const selectedCluster = workspace.selectedGcpGkeCluster ?? "";
  const selectedLocation = workspace.selectedGcpGkeClusterLocation;
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
    workspace.profile?.attributes.find(
      (field) => field.label.toLowerCase() === "project",
    )?.value ?? workspace.profile?.displayName;

  const matchingClusters = clusters.filter(
    (cluster) =>
      cluster.name === selectedCluster &&
      (!selectedLocation || cluster.location === selectedLocation),
  );
  const selectedClusterMeta =
    matchingClusters.length === 1 ? matchingClusters[0] : undefined;
  const capability = actionCapabilityState(
    workspace,
    "gke",
    "getCredentials",
    "gcp",
  );
  const canGetCredentials =
    capability.enabled &&
    Boolean(selectedClusterMeta?.location) &&
    !selectingCluster &&
    !gettingCredentials;
  const credentialsDisabledReason =
    capability.reason ??
    (!selectedClusterMeta
      ? "Select a cluster first."
      : !selectedClusterMeta.location
        ? "Selected cluster is missing a location."
        : undefined);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[1.375rem] font-[750] tracking-[-0.015em]">
            GKE
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Kubernetes cluster inventory for the open gcloud configuration
            {projectLabel ? ` · project ${projectLabel}` : ""}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onGetCredentials ? (
            <Button
              variant="outline"
              size="sm"
              disabled={!canGetCredentials}
              title={credentialsDisabledReason}
              onClick={() => {
                if (selectedClusterMeta?.location) {
                  setCredentialTarget({
                    name: selectedClusterMeta.name,
                    location: selectedClusterMeta.location,
                  });
                }
              }}
            >
              <KeyRound className="size-3.5" />
              {gettingCredentials ? "Getting credentials…" : "Get credentials"}
            </Button>
          ) : null}
          <Button variant="outline" size="sm" onClick={onRefresh}>
            <RefreshCw className="size-3.5" />
            Refresh
          </Button>
        </div>
      </header>

      <AlertDialog
        open={credentialTarget !== null}
        onOpenChange={(open) => {
          if (!open) setCredentialTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Get GKE credentials?</AlertDialogTitle>
            <AlertDialogDescription>
              Update kubeconfig and switch the current kubectl context to{" "}
              <strong>{credentialTarget?.name}</strong> in{" "}
              <strong>{credentialTarget?.location}</strong>
              {projectLabel ? (
                <>
                  {" "}
                  in project <strong>{projectLabel}</strong>
                </>
              ) : null}
              .
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={
                !canGetCredentials ||
                selectedClusterMeta?.name !== credentialTarget?.name ||
                selectedClusterMeta?.location !== credentialTarget?.location
              }
              onClick={async () => {
                if (!onGetCredentials || !credentialTarget) return;
                setCredentialTarget(null);
                setGettingCredentials(true);
                try {
                  await onGetCredentials(
                    credentialTarget.name,
                    credentialTarget.location,
                  );
                } finally {
                  setGettingCredentials(false);
                }
              }}
            >
              Update kubeconfig
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {inventoryLoading && clusters.length === 0 ? (
        <InventoryLoadingState
          variant="banner"
          label={gcpInventoryLoadingLabel("gke")}
        />
      ) : status ? (
        <InlineBanner
          tone={status.startsWith("Could not") ? "warning" : "info"}
          title={status.split("\n")[0] ?? status}
          description={
            status.includes("\n")
              ? status.split("\n").slice(1).join(" ").trim()
              : selectedCluster
                ? "Node pools load when a cluster is selected."
                : "Select a cluster to list its node pools."
          }
        />
      ) : null}

      <section className="space-y-3 rounded-lg border border-border bg-card p-[18px] shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold">Clusters</h2>
            <p className="text-xs text-muted-foreground">
              {clusters.length === 1
                ? "1 cluster"
                : `${clusters.length} clusters`}{" "}
              loaded via gcloud.
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
          getRowKey={clusterKey}
          selectedKey={
            selectedClusterMeta ? clusterKey(selectedClusterMeta) : undefined
          }
          onRowClick={async (row) => {
            if (!onSelectCluster || selectingCluster || gettingCredentials)
              return;
            setSelectingCluster(true);
            try {
              await onSelectCluster(row.name, row.location ?? "");
            } finally {
              setSelectingCluster(false);
            }
          }}
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
            inventoryLoading && clusters.length === 0 ? (
              <InventoryLoadingState
                label={gcpInventoryLoadingLabel("gke")}
                className="border-0 bg-transparent"
              />
            ) : (
              <EmptyState
                icon={<Boxes />}
                {...gcpTableEmptyCopy({
                  resourceLabel: "clusters",
                  createHint: GCP_CREATE_HINTS.clusters,
                  rowCount: clusters.length,
                  listFailed:
                    workspace.gcpInventory?.gke?.emptyReason === "error",
                })}
              />
            )
          }
        />
      </section>

      <section className="space-y-3 rounded-lg border border-border bg-card p-[18px] shadow-sm">
        <div>
          <h2 className="text-base font-bold">
            Node pools
            {selectedClusterMeta ? ` · ${selectedClusterMeta.name}` : ""}
          </h2>
          <p className="text-xs text-muted-foreground">
            {selectedCluster
              ? `${nodePools.length === 1 ? "1 node pool" : `${nodePools.length} node pools`} for ${selectedCluster}${selectedClusterMeta?.location ? ` in ${selectedClusterMeta.location}` : ""}.`
              : "Select a cluster to list node pools."}
          </p>
        </div>

        <ResourceTable<GcpGkeNodePool>
          columns={[
            { id: "name", label: "Name" },
            { id: "status", label: "Status" },
            { id: "machineType", label: "Machine type" },
            { id: "version", label: "Version" },
            { id: "nodes", label: "Nodes" },
            { id: "locations", label: "Locations" },
          ]}
          rows={nodePools}
          getRowKey={(row) => row.name}
          renderCell={(row, columnId) => {
            switch (columnId) {
              case "name":
                return row.name;
              case "status":
                return row.status || "-";
              case "machineType":
                return row.machineType || "-";
              case "version":
                return row.version || "-";
              case "nodes":
                if (row.autoscalingEnabled) {
                  return `${row.minNodeCount ?? 0}-${row.maxNodeCount ?? 0} (autoscale)`;
                }
                return row.initialNodeCount != null
                  ? String(row.initialNodeCount)
                  : "-";
              case "locations":
                return row.locations || "-";
              default:
                return null;
            }
          }}
          emptyState={
            <EmptyState
              icon={<Boxes />}
              title={selectedCluster ? "No node pools" : "No cluster selected"}
              description={
                selectedCluster
                  ? "This cluster has no node pools, or node pool listing failed. Autopilot clusters may not expose classic node pools."
                  : "Choose a cluster from the table above."
              }
            />
          }
        />
      </section>
    </div>
  );
}
