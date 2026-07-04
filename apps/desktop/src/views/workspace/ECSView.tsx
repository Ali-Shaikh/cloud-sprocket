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
  AwsEcsCluster,
  AwsEcsService,
  AwsEcsTask,
  WorkspaceSnapshot,
} from "@/types/backend";

export type EcsWorkspaceSnapshot = WorkspaceSnapshot & {
  selectedEcsRegion?: string;
  selectedEcsClusterArn?: string;
  selectedEcsServiceArn?: string;
  selectedEcsTaskArn?: string;
  ecsStatusMessage?: string;
  ecsRegions: string[];
  ecsClusters: AwsEcsCluster[];
  ecsServices: AwsEcsService[];
  ecsTasks: AwsEcsTask[];
};

export type ECSViewProps = {
  workspace: EcsWorkspaceSnapshot;
  actionStatus: string;
  onRefresh: () => void;
  onSelectRegion: (region: string) => void;
  onSelectCluster: (clusterArn: string) => void;
  onSelectService: (serviceArn: string) => void;
  onSelectTask: (taskArn: string) => void;
};

const fieldLabel =
  "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

const sectionCard = "space-y-4 rounded-lg border border-border bg-card p-[18px] shadow-sm";

const snippetCard = "rounded-lg border border-border bg-muted/40 p-3";

function resourceStatus(status?: string): Status {
  const normalised = status?.toUpperCase();
  if (normalised === "ACTIVE" || normalised === "RUNNING") {
    return "on";
  }
  if (
    normalised === "PENDING" ||
    normalised === "PROVISIONING" ||
    normalised === "DRAINING"
  ) {
    return "warning";
  }
  if (normalised === "FAILED" || normalised === "STOPPED") {
    return "error";
  }
  return "off";
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function shortArn(arn: string): string {
  const parts = arn.split("/");
  return parts.length > 1 ? parts[parts.length - 1] : arn;
}

function copyToClipboard(value: string, label = "Copied to clipboard"): void {
  if (navigator.clipboard) {
    void navigator.clipboard.writeText(value).then(() => {
      notify("success", label);
    });
  }
}

export default function ECSView({
  workspace,
  actionStatus,
  onRefresh,
  onSelectRegion,
  onSelectCluster,
  onSelectService,
  onSelectTask,
}: ECSViewProps) {
  const [clusterFilter, setClusterFilter] = useState("");

  const regions =
    workspace.ecsRegions.length > 0
      ? workspace.ecsRegions
      : workspace.rdsRegions.length > 0
        ? workspace.rdsRegions
        : workspace.lambdaRegions.length > 0
          ? workspace.lambdaRegions
          : workspace.ec2Regions;

  const selectedCluster =
    workspace.ecsClusters.find(
      (cluster) => cluster.clusterArn === workspace.selectedEcsClusterArn,
    ) ?? workspace.ecsClusters[0];

  const selectedService =
    workspace.ecsServices.find(
      (service) => service.serviceArn === workspace.selectedEcsServiceArn,
    ) ?? undefined;

  const selectedTask =
    workspace.ecsTasks.find((task) => task.taskArn === workspace.selectedEcsTaskArn) ??
    workspace.ecsTasks[0];

  const filteredClusters = useMemo(() => {
    const query = clusterFilter.trim().toLowerCase();
    if (!query) {
      return workspace.ecsClusters;
    }
    return workspace.ecsClusters.filter((cluster) =>
      [cluster.clusterName, cluster.clusterArn, cluster.status].some((value) =>
        value?.toLowerCase().includes(query),
      ),
    );
  }, [clusterFilter, workspace.ecsClusters]);

  const statusMessage =
    actionStatus ||
    workspace.ecsStatusMessage ||
    "ECS inventory is waiting for an open AWS workspace.";

  const detailFields = selectedTask
    ? [
        { label: "Task ARN", value: selectedTask.taskArn },
        { label: "Last status", value: selectedTask.lastStatus || "Unknown" },
        { label: "Desired status", value: selectedTask.desiredStatus || "Unknown" },
        { label: "Launch type", value: selectedTask.launchType || "Unknown" },
        { label: "Started at", value: selectedTask.startedAt || "Unknown" },
        { label: "Task definition", value: selectedTask.taskDefinitionArn || "Unknown" },
      ]
    : selectedService
      ? [
          { label: "Service", value: selectedService.serviceName },
          { label: "Status", value: selectedService.status || "Unknown" },
          { label: "Launch type", value: selectedService.launchType || "Unknown" },
          {
            label: "Desired / running",
            value: `${selectedService.desiredCount ?? 0} / ${selectedService.runningCount ?? 0}`,
          },
          { label: "Task definition", value: selectedService.taskDefinition || "Unknown" },
        ]
      : selectedCluster
        ? [
            { label: "Cluster", value: selectedCluster.clusterName },
            { label: "Status", value: selectedCluster.status || "Unknown" },
            {
              label: "Services",
              value: String(selectedCluster.activeServicesCount ?? workspace.ecsServices.length),
            },
            {
              label: "Running tasks",
              value: String(selectedCluster.runningTasksCount ?? workspace.ecsTasks.length),
            },
          ]
        : [];

  const copySnippets = selectedTask
    ? [
        { label: "Task ARN", value: selectedTask.taskArn },
        {
          label: "AWS CLI describe command",
          value: `aws ecs describe-tasks --cluster ${selectedCluster?.clusterName ?? "<cluster>"} --tasks ${shortArn(selectedTask.taskArn)}${
            workspace.selectedEcsRegion ? ` --region ${workspace.selectedEcsRegion}` : ""
          }`,
        },
        {
          label: "Task detail JSON",
          value: JSON.stringify(
            {
              region: workspace.selectedEcsRegion,
              cluster: selectedCluster,
              service: selectedService,
              task: selectedTask,
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
          title="ECS requires an AWS workspace"
          description="Open an AWS profile from Connect to list clusters, services, and tasks (works on LocalStack and real AWS)."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-[1.375rem] font-[750] tracking-[-0.015em]">ECS</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {countLabel(workspace.ecsClusters.length, "cluster", "clusters")} ·{" "}
          {workspace.selectedEcsRegion || "no region selected"}
        </p>
      </header>

      <section className={sectionCard}>
        <div>
          <h2 className="text-base font-bold">Container Fleet</h2>
          <p className="text-sm text-muted-foreground">
            Regional ECS inventory with cluster, service, and task drill-down.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
            <div className={fieldLabel}>Selected Region</div>
            <p className="truncate text-sm">{workspace.selectedEcsRegion || "No region selected"}</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
            <div className={fieldLabel}>Selected Cluster</div>
            <p className="truncate text-sm">{selectedCluster?.clusterName || "No cluster selected"}</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
            <div className={fieldLabel}>Services</div>
            <p className="truncate text-sm">
              {countLabel(workspace.ecsServices.length, "service", "services")}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
            <div className={fieldLabel}>Tasks</div>
            <p className="truncate text-sm">
              {countLabel(workspace.ecsTasks.length, "task", "tasks")}
            </p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{statusMessage}</p>
      </section>

      <section className={sectionCard}>
        <div>
          <h2 className="text-base font-bold">Cluster Inventory</h2>
          <p className="text-sm text-muted-foreground">
            Select a region, then choose a cluster to load services and tasks.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="w-56">
            <div className={cn(fieldLabel, "mb-1")}>Region</div>
            <Select
              value={workspace.selectedEcsRegion ?? ""}
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
          <Button variant="outline" disabled={!workspace.selectedEcsRegion} onClick={onRefresh}>
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
          {workspace.ecsClusters.length === 0 ? (
            <EmptyState
              icon={<Boxes />}
              title="No clusters"
              description={
                workspace.selectedEcsRegion
                  ? `No ECS clusters were returned for ${workspace.selectedEcsRegion}.`
                  : "Select a region to list ECS clusters."
              }
              className="border-0"
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cluster</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Services</TableHead>
                  <TableHead>Running tasks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredClusters.map((cluster) => (
                  <TableRow
                    key={cluster.clusterArn}
                    className={cn(
                      "cursor-pointer",
                      cluster.clusterArn === workspace.selectedEcsClusterArn && "bg-muted/50",
                    )}
                    onClick={() => {
                      onSelectCluster(cluster.clusterArn);
                    }}
                  >
                    <TableCell className="font-medium">{cluster.clusterName}</TableCell>
                    <TableCell>
                      <StatusPill status={resourceStatus(cluster.status)} label={cluster.status || "Unknown"} />
                    </TableCell>
                    <TableCell>{cluster.activeServicesCount ?? 0}</TableCell>
                    <TableCell>{cluster.runningTasksCount ?? 0}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </section>

      {selectedCluster ? (
        <section className="grid gap-6 lg:grid-cols-2">
          <div className={sectionCard}>
            <h2 className="text-base font-bold">Services</h2>
            <div className="overflow-hidden rounded-lg border border-border">
              {workspace.ecsServices.length === 0 ? (
                <EmptyState
                  icon={<Boxes />}
                  title="No services"
                  description={`No services were returned for ${selectedCluster.clusterName}.`}
                  className="border-0"
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Service</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Desired</TableHead>
                      <TableHead>Running</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {workspace.ecsServices.map((service) => (
                      <TableRow
                        key={service.serviceArn}
                        className={cn(
                          "cursor-pointer",
                          service.serviceArn === workspace.selectedEcsServiceArn && "bg-muted/50",
                        )}
                        onClick={() => {
                          onSelectService(service.serviceArn);
                        }}
                      >
                        <TableCell className="font-medium">{service.serviceName}</TableCell>
                        <TableCell>
                          <StatusPill status={resourceStatus(service.status)} label={service.status || "Unknown"} />
                        </TableCell>
                        <TableCell>{service.desiredCount ?? 0}</TableCell>
                        <TableCell>{service.runningCount ?? 0}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>

          <div className={sectionCard}>
            <h2 className="text-base font-bold">Tasks</h2>
            <div className="overflow-hidden rounded-lg border border-border">
              {workspace.ecsTasks.length === 0 ? (
                <EmptyState
                  icon={<Boxes />}
                  title="No tasks"
                  description={
                    selectedService
                      ? `No tasks were returned for ${selectedService.serviceName}.`
                      : `No tasks were returned for ${selectedCluster.clusterName}.`
                  }
                  className="border-0"
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Task</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Launch</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {workspace.ecsTasks.map((task) => (
                      <TableRow
                        key={task.taskArn}
                        className={cn(
                          "cursor-pointer",
                          task.taskArn === workspace.selectedEcsTaskArn && "bg-muted/50",
                        )}
                        onClick={() => {
                          onSelectTask(task.taskArn);
                        }}
                      >
                        <TableCell className="font-mono text-xs">{shortArn(task.taskArn)}</TableCell>
                        <TableCell>
                          <StatusPill status={resourceStatus(task.lastStatus)} label={task.lastStatus || "Unknown"} />
                        </TableCell>
                        <TableCell>{task.launchType || "Unknown"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>
        </section>
      ) : null}

      {detailFields.length > 0 ? (
        <section className={sectionCard}>
          <h2 className="text-base font-bold">Selection Detail</h2>
          <DetailFieldList fields={detailFields} emptyText="No ECS selection details are available." />
          {selectedTask?.containers && selectedTask.containers.length > 0 ? (
            <div className="space-y-2">
              <div className={fieldLabel}>Containers</div>
              {selectedTask.containers.map((container) => (
                <div key={container.name} className={snippetCard}>
                  <p className="text-sm font-medium">{container.name}</p>
                  <p className="text-xs text-muted-foreground">{container.image || "Unknown image"}</p>
                  <p className="text-xs text-muted-foreground">{container.lastStatus || "Unknown status"}</p>
                </div>
              ))}
            </div>
          ) : null}
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