// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useMemo, useState } from "react";
import { Cpu, Play, RefreshCw, Square } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { InlineBanner } from "@/components/inline-banner";
import { ResourceTable } from "@/components/inventory/resource-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { actionCapabilityState, actionDisabledReason } from "@/lib/action-capabilities";
import type { GcpComputeInstance, WorkspaceSnapshot } from "@/types/backend";

export type GcpComputeViewProps = {
  workspace: WorkspaceSnapshot;
  onRefresh: () => void;
  onStartInstance?: (instanceName: string, zone: string) => void;
  onStopInstance?: (instanceName: string, zone: string) => void;
};

function isRunning(status: string | undefined): boolean {
  return (status ?? "").toUpperCase() === "RUNNING";
}

function isStopped(status: string | undefined): boolean {
  const normalised = (status ?? "").toUpperCase();
  return normalised === "TERMINATED" || normalised === "STOPPED";
}

/**
 * Compute Engine panel: lists VMs and offers start/stop when write mode is on.
 */
export default function GcpComputeView({
  workspace,
  onRefresh,
  onStartInstance,
  onStopInstance,
}: GcpComputeViewProps) {
  const [filterText, setFilterText] = useState("");
  const [selectedName, setSelectedName] = useState(workspace.selectedGcpComputeInstance ?? "");
  const instances = workspace.gcpComputeInstances ?? [];
  const status = workspace.gcpComputeStatusMessage?.trim() ?? "";

  const startCapability = actionCapabilityState(workspace, "compute", "startInstance", "gcp");
  const stopCapability = actionCapabilityState(workspace, "compute", "stopInstance", "gcp");

  const selected =
    instances.find((instance) => instance.name === selectedName) ??
    instances.find((instance) => instance.name === workspace.selectedGcpComputeInstance);

  const canStart =
    Boolean(onStartInstance) &&
    startCapability.enabled &&
    Boolean(selected?.name) &&
    Boolean(selected?.zone) &&
    isStopped(selected?.status);
  const canStop =
    Boolean(onStopInstance) &&
    stopCapability.enabled &&
    Boolean(selected?.name) &&
    Boolean(selected?.zone) &&
    isRunning(selected?.status);

  const startDisabledReason = canStart
    ? undefined
    : actionDisabledReason(
        workspace,
        "compute",
        "startInstance",
        !selected
          ? "Select an instance first."
          : !selected.zone
            ? "Selected instance is missing a zone."
            : !isStopped(selected.status)
              ? "Start is only available when the instance is stopped or terminated."
              : undefined,
        "gcp",
      );
  const stopDisabledReason = canStop
    ? undefined
    : actionDisabledReason(
        workspace,
        "compute",
        "stopInstance",
        !selected
          ? "Select an instance first."
          : !selected.zone
            ? "Selected instance is missing a zone."
            : !isRunning(selected.status)
              ? "Stop is only available when the instance is running."
              : undefined,
        "gcp",
      );

  const filtered = useMemo(() => {
    const query = filterText.trim().toLowerCase();
    if (!query) {
      return instances;
    }
    return instances.filter((instance) => {
      const haystack = [
        instance.name,
        instance.zone,
        instance.machineType,
        instance.status,
        instance.internalIp,
        instance.externalIp,
        instance.summary,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [instances, filterText]);

  const projectLabel =
    workspace.profile?.attributes.find((field) => field.label.toLowerCase() === "project")
      ?.value ?? workspace.profile?.displayName;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[1.375rem] font-[750] tracking-[-0.015em]">Compute Engine</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            VM inventory for the open gcloud configuration
            {projectLabel ? ` · project ${projectLabel}` : ""}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onStartInstance ? (
            <Button
              variant="outline"
              size="sm"
              disabled={!canStart}
              title={startDisabledReason}
              onClick={() => {
                if (selected?.name && selected.zone) {
                  onStartInstance(selected.name, selected.zone);
                }
              }}
            >
              <Play className="size-3.5" />
              Start
            </Button>
          ) : null}
          {onStopInstance ? (
            <Button
              variant="outline"
              size="sm"
              disabled={!canStop}
              title={stopDisabledReason}
              onClick={() => {
                if (selected?.name && selected.zone) {
                  onStopInstance(selected.name, selected.zone);
                }
              }}
            >
              <Square className="size-3.5" />
              Stop
            </Button>
          ) : null}
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
              : "Select an instance, enable write mode, then use Start or Stop."
          }
        />
      ) : null}

      <section className="space-y-3 rounded-lg border border-border bg-card p-[18px] shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold">Instances</h2>
            <p className="text-xs text-muted-foreground">
              {instances.length === 1 ? "1 instance" : `${instances.length} instances`} loaded via
              gcloud.
            </p>
          </div>
          <Input
            value={filterText}
            onChange={(event) => setFilterText(event.target.value)}
            placeholder="Filter instances"
            className="max-w-xs"
            aria-label="Filter Compute Engine instances"
          />
        </div>

        <ResourceTable<GcpComputeInstance>
          columns={[
            { id: "name", label: "Name" },
            { id: "zone", label: "Zone" },
            { id: "machineType", label: "Machine type" },
            { id: "status", label: "Status" },
            { id: "internalIp", label: "Internal IP" },
            { id: "externalIp", label: "External IP" },
          ]}
          rows={filtered}
          getRowKey={(row) => row.name}
          selectedKey={selected?.name ?? workspace.selectedGcpComputeInstance}
          onRowClick={(row) => {
            setSelectedName(row.name);
          }}
          renderCell={(row, columnId) => {
            switch (columnId) {
              case "name":
                return row.name;
              case "zone":
                return row.zone || "-";
              case "machineType":
                return row.machineType || "-";
              case "status":
                return row.status || "-";
              case "internalIp":
                return row.internalIp || "-";
              case "externalIp":
                return row.externalIp || "-";
              default:
                return null;
            }
          }}
          emptyState={
            <EmptyState
              icon={<Cpu />}
              title={
                instances.length === 0
                  ? "No instances in this project"
                  : "No instances match the filter"
              }
              description={
                instances.length === 0
                  ? "Create a VM in the Google Cloud console or with gcloud, then refresh."
                  : "Clear the filter to see the full inventory."
              }
            />
          }
        />
      </section>
    </div>
  );
}
