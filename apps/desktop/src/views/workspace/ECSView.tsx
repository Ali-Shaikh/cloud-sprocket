// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useEffect, useMemo, useRef, useState } from "react";
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
import { EmptyState } from "@/components/empty-state";
import { StatusPill } from "@/components/status-pill";
import type { Status } from "@/components/status-dot";
import {
  ResourceInspectorHeader,
  ResourceInspectorPanel,
  ResourceInventoryShell,
} from "@/components/inventory/resource-inspector";
import { ResourceTable } from "@/components/inventory/resource-table";
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

function ecsSelectionKey(workspace: EcsWorkspaceSnapshot): string {
  return [
    workspace.selectedEcsClusterArn || "",
    workspace.selectedEcsServiceArn || "",
    workspace.selectedEcsTaskArn || "",
  ].join("|");
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
  const [inspectorOpen, setInspectorOpen] = useState(Boolean(workspace.selectedEcsClusterArn));
  const lastSelectionRef = useRef(ecsSelectionKey(workspace));

  const regions =
    workspace.ecsRegions.length > 0
      ? workspace.ecsRegions
      : workspace.rdsRegions.length > 0
        ? workspace.rdsRegions
        : workspace.lambdaRegions.length > 0
          ? workspace.lambdaRegions
          : workspace.ec2Regions;

  const selectedCluster = workspace.ecsClusters.find(
    (cluster) => cluster.clusterArn === workspace.selectedEcsClusterArn,
  );

  const selectedService = workspace.ecsServices.find(
    (service) => service.serviceArn === workspace.selectedEcsServiceArn,
  );

  const selectedTask = workspace.ecsTasks.find(
    (task) => task.taskArn === workspace.selectedEcsTaskArn,
  );

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

  useEffect(() => {
    const nextSelection = ecsSelectionKey(workspace);
    if (nextSelection !== lastSelectionRef.current) {
      lastSelectionRef.current = nextSelection;
      setInspectorOpen(Boolean(workspace.selectedEcsClusterArn));
    }
  }, [workspace.selectedEcsClusterArn, workspace.selectedEcsServiceArn, workspace.selectedEcsTaskArn]);

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

  const tableEmptyState =
    workspace.ecsClusters.length === 0 ? (
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
      <EmptyState
        icon={<Boxes />}
        title="No matches"
        description="No ECS clusters match the current filter."
        className="border-0"
      />
    );

  const servicesEmptyState = (
    <EmptyState
      icon={<Boxes />}
      title="No services"
      description={
        selectedCluster
          ? `No services were returned for ${selectedCluster.clusterName}.`
          : "Select a cluster to list services."
      }
      className="border-0"
    />
  );

  const tasksEmptyState = (
    <EmptyState
      icon={<Boxes />}
      title="No tasks"
      description={
        selectedService
          ? `No tasks were returned for ${selectedService.serviceName}.`
          : selectedCluster
            ? `No tasks were returned for ${selectedCluster.clusterName}.`
            : "Select a cluster to list tasks."
      }
      className="border-0"
    />
  );

  const inspectorEyebrow = selectedTask ? "Task" : selectedService ? "Service" : "Cluster";
  const inspectorTitle = selectedTask
    ? shortArn(selectedTask.taskArn)
    : selectedService
      ? selectedService.serviceName
      : selectedCluster?.clusterName || "";
  const inspectorSubtitle = selectedTask
    ? selectedTask.taskArn
    : selectedService
      ? selectedService.serviceArn
      : selectedCluster?.clusterArn;

  const inspectorContent = selectedCluster ? (
    <ResourceInspectorPanel>
      <ResourceInspectorHeader
        icon={Boxes}
        eyebrow={inspectorEyebrow}
        title={inspectorTitle}
        subtitle={inspectorSubtitle}
        onClose={() => setInspectorOpen(false)}
      />

      {detailFields.length > 0 ? (
        <DetailFieldList fields={detailFields} emptyText="No ECS selection details are available." />
      ) : null}

      {selectedTask?.containers && selectedTask.containers.length > 0 ? (
        <div>
          <div className={fieldLabel}>Containers</div>
          <div className="mt-2 space-y-2">
            {selectedTask.containers.map((container) => (
              <div key={container.name} className={snippetCard}>
                <p className="text-sm font-medium">{container.name}</p>
                <p className="text-xs text-muted-foreground">{container.image || "Unknown image"}</p>
                <p className="text-xs text-muted-foreground">{container.lastStatus || "Unknown status"}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div>
        <div className={fieldLabel}>Services</div>
        <div className="mt-2">
          <ResourceTable
            columns={[
              { id: "service", label: "Service" },
              { id: "status", label: "Status" },
              { id: "desired", label: "Desired" },
              { id: "running", label: "Running" },
            ]}
            rows={workspace.ecsServices}
            selectedKey={workspace.selectedEcsServiceArn}
            getRowKey={(service) => service.serviceArn}
            onRowClick={(service) => {
              onSelectService(service.serviceArn);
            }}
            renderCell={(service, columnId) => {
              if (columnId === "service") {
                return <span className="font-medium">{service.serviceName}</span>;
              }
              if (columnId === "status") {
                return (
                  <StatusPill
                    status={resourceStatus(service.status)}
                    label={service.status || "Unknown"}
                  />
                );
              }
              if (columnId === "desired") {
                return service.desiredCount ?? 0;
              }
              if (columnId === "running") {
                return service.runningCount ?? 0;
              }
              return null;
            }}
            emptyState={servicesEmptyState}
          />
        </div>
      </div>

      <div>
        <div className={fieldLabel}>Tasks</div>
        <div className="mt-2">
          <ResourceTable
            columns={[
              { id: "task", label: "Task", cellClassName: "font-mono text-xs" },
              { id: "status", label: "Status" },
              { id: "launch", label: "Launch" },
            ]}
            rows={workspace.ecsTasks}
            selectedKey={workspace.selectedEcsTaskArn}
            getRowKey={(task) => task.taskArn}
            onRowClick={(task) => {
              onSelectTask(task.taskArn);
            }}
            renderCell={(task, columnId) => {
              if (columnId === "task") {
                return shortArn(task.taskArn);
              }
              if (columnId === "status") {
                return (
                  <StatusPill
                    status={resourceStatus(task.lastStatus)}
                    label={task.lastStatus || "Unknown"}
                  />
                );
              }
              if (columnId === "launch") {
                return task.launchType || "Unknown";
              }
              return null;
            }}
            emptyState={tasksEmptyState}
          />
        </div>
      </div>

      {copySnippets.length > 0 ? (
        <div>
          <div className={fieldLabel}>Copy helpers</div>
          <div className="mt-2 space-y-2">
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
                <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all text-xs">
                  {snippet.value}
                </pre>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </ResourceInspectorPanel>
  ) : null;

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
          <div className="pb-2 text-xs text-muted-foreground">
            {filteredClusters.length}/{workspace.ecsClusters.length} shown
          </div>
        </div>

        <ResourceInventoryShell
          table={
            <ResourceTable
              columns={[
                { id: "cluster", label: "Cluster" },
                { id: "status", label: "Status" },
                { id: "services", label: "Services" },
                { id: "tasks", label: "Running tasks" },
              ]}
              rows={filteredClusters}
              selectedKey={workspace.selectedEcsClusterArn}
              getRowKey={(cluster) => cluster.clusterArn}
              onRowClick={(cluster) => {
                onSelectCluster(cluster.clusterArn);
                setInspectorOpen(true);
              }}
              renderCell={(cluster, columnId) => {
                if (columnId === "cluster") {
                  return <span className="font-medium">{cluster.clusterName}</span>;
                }
                if (columnId === "status") {
                  return (
                    <StatusPill
                      status={resourceStatus(cluster.status)}
                      label={cluster.status || "Unknown"}
                    />
                  );
                }
                if (columnId === "services") {
                  return cluster.activeServicesCount ?? 0;
                }
                if (columnId === "tasks") {
                  return cluster.runningTasksCount ?? 0;
                }
                return null;
              }}
              emptyState={tableEmptyState}
            />
          }
          inspectorContent={inspectorContent}
          inspectorOpen={inspectorOpen}
          onInspectorOpenChange={setInspectorOpen}
          inspectorAriaLabel="ECS cluster details"
        />
      </section>
    </div>
  );
}