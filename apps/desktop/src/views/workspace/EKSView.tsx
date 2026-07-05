// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useMemo, useState } from "react";
import { Boxes, Copy, RefreshCw } from "lucide-react";

import { cn } from "@/lib/utils";
import { notify } from "@/lib/notify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { StatusPill } from "@/components/status-pill";
import type { Status } from "@/components/status-dot";
import { DetailFieldList } from "./detail-fields";
import type {
  AwsEksCluster,
  AwsEksNodeGroup,
  WorkspaceSnapshot,
} from "@/types/backend";

export type EksWorkspaceSnapshot = WorkspaceSnapshot & {
  selectedEksRegion?: string;
  selectedEksClusterName?: string;
  eksStatusMessage?: string;
  eksRegions: string[];
  eksClusters: AwsEksCluster[];
  eksNodeGroups: AwsEksNodeGroup[];
};

export type EKSViewProps = {
  workspace: EksWorkspaceSnapshot;
  actionStatus: string;
  onRefresh: () => void;
  onSelectRegion: (region: string) => void;
  onSelectCluster: (clusterName: string) => void;
};

const fieldLabel =
  "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

const sectionCard = "space-y-4 rounded-lg border border-border bg-card p-[18px] shadow-sm";

const snippetCard = "rounded-lg border border-border bg-muted/40 p-3";

function resourceStatus(status?: string): Status {
  const normalised = status?.toUpperCase();
  if (normalised === "ACTIVE") {
    return "on";
  }
  if (
    normalised === "CREATING" ||
    normalised === "UPDATING" ||
    normalised === "PENDING" ||
    normalised === "DEGRADED"
  ) {
    return "warning";
  }
  if (normalised === "FAILED" || normalised === "DELETING") {
    return "error";
  }
  return "off";
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function copyToClipboard(value: string, label = "Copied to clipboard"): void {
  if (navigator.clipboard) {
    void navigator.clipboard.writeText(value).then(() => {
      notify("success", label);
    });
  }
}

export default function EKSView({
  workspace,
  actionStatus,
  onRefresh,
  onSelectRegion,
  onSelectCluster,
}: EKSViewProps) {
  const [clusterFilter, setClusterFilter] = useState("");

  const regions =
    workspace.eksRegions.length > 0
      ? workspace.eksRegions
      : workspace.ecsRegions.length > 0
        ? workspace.ecsRegions
        : workspace.rdsRegions.length > 0
          ? workspace.rdsRegions
          : workspace.lambdaRegions.length > 0
            ? workspace.lambdaRegions
            : workspace.ec2Regions;

  const selectedCluster =
    workspace.eksClusters.find(
      (cluster) => cluster.clusterName === workspace.selectedEksClusterName,
    ) ?? workspace.eksClusters[0];

  const filteredClusters = useMemo(() => {
    const query = clusterFilter.trim().toLowerCase();
    if (!query) {
      return workspace.eksClusters;
    }
    return workspace.eksClusters.filter((cluster) =>
      [cluster.clusterName, cluster.clusterArn, cluster.status, cluster.version].some((value) =>
        value?.toLowerCase().includes(query),
      ),
    );
  }, [clusterFilter, workspace.eksClusters]);

  const statusMessage =
    actionStatus ||
    workspace.eksStatusMessage ||
    "EKS inventory is waiting for an open AWS workspace.";

  const detailFields = selectedCluster
    ? [
        { label: "Cluster", value: selectedCluster.clusterName },
        { label: "Status", value: selectedCluster.status || "Unknown" },
        { label: "Version", value: selectedCluster.version || "Unknown" },
        { label: "Platform", value: selectedCluster.platformVersion || "Unknown" },
        { label: "Endpoint", value: selectedCluster.endpoint || "Unknown" },
        { label: "Role ARN", value: selectedCluster.roleArn || "Unknown" },
      ]
    : [];

  const copySnippets = selectedCluster
    ? [
        { label: "Cluster ARN", value: selectedCluster.clusterArn },
        {
          label: "AWS CLI describe command",
          value: `aws eks describe-cluster --name ${selectedCluster.clusterName}${
            workspace.selectedEksRegion ? ` --region ${workspace.selectedEksRegion}` : ""
          }`,
        },
        {
          label: "Cluster detail JSON",
          value: JSON.stringify(
            {
              region: workspace.selectedEksRegion,
              cluster: selectedCluster,
              nodeGroups: workspace.eksNodeGroups,
            },
            null,
            2,
          ),
        },
      ]
    : [];

  if (workspace.provider?.providerId && workspace.provider.providerId !== "aws") {
    return (
      <div className="p-6">
        <EmptyState
          icon={<Boxes />}
          title="EKS requires an AWS workspace"
          description="Open an AWS profile from Connect to list Kubernetes clusters and node groups (works on LocalStack and real AWS)."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-[1.375rem] font-[750] tracking-[-0.015em]">EKS</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {countLabel(workspace.eksClusters.length, "cluster", "clusters")} ·{" "}
          {workspace.selectedEksRegion || "no region selected"}
        </p>
      </header>

      <section className={sectionCard}>
        <div>
          <h2 className="text-base font-bold">Kubernetes Fleet</h2>
          <p className="text-sm text-muted-foreground">
            Regional EKS inventory with cluster detail and managed node group summaries.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
            <div className={fieldLabel}>Selected Region</div>
            <p className="truncate text-sm">{workspace.selectedEksRegion || "No region selected"}</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
            <div className={fieldLabel}>Selected Cluster</div>
            <p className="truncate text-sm">{selectedCluster?.clusterName || "No cluster selected"}</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
            <div className={fieldLabel}>Version</div>
            <p className="truncate text-sm">{selectedCluster?.version || "Unknown"}</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
            <div className={fieldLabel}>Node Groups</div>
            <p className="truncate text-sm">
              {countLabel(workspace.eksNodeGroups.length, "node group", "node groups")}
            </p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{statusMessage}</p>
      </section>

      <section className={sectionCard}>
        <div>
          <h2 className="text-base font-bold">Cluster Inventory</h2>
          <p className="text-sm text-muted-foreground">
            Select a region, then choose a cluster to load node group summaries.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="w-56">
            <div className={cn(fieldLabel, "mb-1")}>Region</div>
            <Select
              value={workspace.selectedEksRegion ?? ""}
              onValueChange={(value) => {
                if (value) {
                  onSelectRegion(value);
                }
              }}
            >
              <SelectTrigger aria-label="Select region">
                <SelectValue placeholder="Select region" />
              </SelectTrigger>
              <SelectContent>
                {regions.map((region) => (
                  <SelectItem key={region} value={region}>
                    {region}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" disabled={!workspace.selectedEksRegion} onClick={onRefresh}>
            <RefreshCw />
            Refresh inventory
          </Button>
          <div className="min-w-56 flex-1">
            <div className={cn(fieldLabel, "mb-1")}>Filter clusters</div>
            <Input
              value={clusterFilter}
              placeholder="Filter clusters"
              onChange={(event) => {
                setClusterFilter(event.target.value);
              }}
            />
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-border">
          {workspace.eksClusters.length === 0 ? (
            <EmptyState
              icon={<Boxes />}
              title="No clusters"
              description={
                workspace.selectedEksRegion
                  ? `No EKS clusters were returned for ${workspace.selectedEksRegion}.`
                  : "Select a region to list EKS clusters."
              }
              className="border-0"
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cluster</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Platform</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredClusters.map((cluster) => (
                  <TableRow
                    key={cluster.clusterArn}
                    className={cn(
                      "cursor-pointer",
                      cluster.clusterName === workspace.selectedEksClusterName && "bg-muted/50",
                    )}
                    onClick={() => {
                      onSelectCluster(cluster.clusterName);
                    }}
                  >
                    <TableCell className="font-medium">{cluster.clusterName}</TableCell>
                    <TableCell>
                      <StatusPill status={resourceStatus(cluster.status)} label={cluster.status || "Unknown"} />
                    </TableCell>
                    <TableCell>{cluster.version || "Unknown"}</TableCell>
                    <TableCell>{cluster.platformVersion || "Unknown"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </section>

      {selectedCluster ? (
        <section className={sectionCard}>
          <h2 className="text-base font-bold">Node Groups</h2>
          <div className="overflow-hidden rounded-lg border border-border">
            {workspace.eksNodeGroups.length === 0 ? (
              <EmptyState
                icon={<Boxes />}
                title="No node groups"
                description={`No managed node groups were returned for ${selectedCluster.clusterName}.`}
                className="border-0"
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Node Group</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Desired</TableHead>
                    <TableHead>Instance Types</TableHead>
                    <TableHead>Capacity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {workspace.eksNodeGroups.map((nodeGroup) => (
                    <TableRow key={nodeGroup.nodeGroupArn}>
                      <TableCell className="font-medium">{nodeGroup.nodeGroupName}</TableCell>
                      <TableCell>
                        <StatusPill
                          status={resourceStatus(nodeGroup.status)}
                          label={nodeGroup.status || "Unknown"}
                        />
                      </TableCell>
                      <TableCell>{nodeGroup.desiredSize ?? 0}</TableCell>
                      <TableCell>{nodeGroup.instanceTypes?.join(", ") || "Unknown"}</TableCell>
                      <TableCell>{nodeGroup.capacityType || "Unknown"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </section>
      ) : null}

      {detailFields.length > 0 ? (
        <section className={sectionCard}>
          <h2 className="text-base font-bold">Selection Detail</h2>
          <DetailFieldList fields={detailFields} emptyText="No EKS selection details are available." />
          {copySnippets.length > 0 ? (
            <div className="space-y-2">
              <div className={fieldLabel}>Copy helpers</div>
              {copySnippets.map((snippet) => (
                <div key={snippet.label} className={snippetCard}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {snippet.label}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Copy ${snippet.label}`}
                      onClick={() => {
                        copyToClipboard(snippet.value);
                      }}
                    >
                      <Copy />
                    </Button>
                  </div>
                  <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all text-xs">{snippet.value}</pre>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}