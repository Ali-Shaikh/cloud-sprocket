// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useMemo, useState } from "react";
import { Cpu, Play, RefreshCw, RotateCcw, Square } from "lucide-react";

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
import type { GcpComputeInstance, WorkspaceSnapshot } from "@/types/backend";

type InstanceAction = (
  instanceName: string,
  zone: string,
) => void | Promise<boolean>;

export type GcpComputeViewProps = {
  workspace: WorkspaceSnapshot;
  onRefresh: () => void;
  onStartInstance?: InstanceAction;
  onStopInstance?: InstanceAction;
  onResetInstance?: InstanceAction;
  lifecyclePending?: boolean;
  inventoryLoading?: boolean;
};

function instanceKey(instance: GcpComputeInstance): string {
  return `${instance.zone}/${instance.name}`;
}

function isRunning(status: string | undefined): boolean {
  return (status ?? "").toUpperCase() === "RUNNING";
}

function isStopped(status: string | undefined): boolean {
  const normalised = (status ?? "").toUpperCase();
  return normalised === "TERMINATED" || normalised === "STOPPED";
}

export default function GcpComputeView({
  workspace,
  onRefresh,
  onStartInstance,
  onStopInstance,
  onResetInstance,
  lifecyclePending = false,
  inventoryLoading = false,
}: GcpComputeViewProps) {
  const [filterText, setFilterText] = useState("");
  const [selectedKey, setSelectedKey] = useState("");
  const [confirmation, setConfirmation] = useState<{
    action: "startInstance" | "stopInstance" | "resetInstance";
    instance: GcpComputeInstance;
  } | null>(null);
  const [actionInFlight, setActionInFlight] = useState(false);
  const instances = workspace.gcpComputeInstances ?? [];
  const status = workspace.gcpComputeStatusMessage?.trim() ?? "";

  const savedSelection = instances.filter(
    (instance) => instance.name === workspace.selectedGcpComputeInstance,
  );
  const selected =
    instances.find((instance) => instanceKey(instance) === selectedKey) ??
    (savedSelection.length === 1 ? savedSelection[0] : undefined);
  const actions = [
    {
      id: "startInstance",
      label: "Start",
      icon: Play,
      accepts: isStopped,
      onAction: onStartInstance,
    },
    {
      id: "stopInstance",
      label: "Stop",
      icon: Square,
      accepts: isRunning,
      onAction: onStopInstance,
    },
    {
      id: "resetInstance",
      label: "Reset",
      icon: RotateCcw,
      accepts: isRunning,
      onAction: onResetInstance,
    },
  ] as const;
  type Action = (typeof actions)[number];

  function disabledReason(
    action: Action,
    instance: GcpComputeInstance | undefined,
  ) {
    const state = actionCapabilityState(workspace, "compute", action.id, "gcp");
    if (!state.enabled) {
      return state.reason ?? "Action unavailable.";
    }
    if (actionInFlight || lifecyclePending) return "A Compute Engine action is in progress.";
    if (!instance) return "Select an instance first.";
    if (!instance.zone) return "Selected instance is missing a zone.";
    if (!action.accepts(instance.status)) {
      const requiredState =
        action.id === "startInstance" ? "stopped or terminated" : "running";
      return `${action.label} is only available when the instance is ${requiredState}.`;
    }
    return undefined;
  }

  const confirmedAction = actions.find(
    (action) => action.id === confirmation?.action,
  );
  const confirmedInstance = confirmation?.instance;
  const currentConfirmedInstance = confirmedInstance
    ? instances.find(
        (instance) => instanceKey(instance) === instanceKey(confirmedInstance),
      )
    : undefined;

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
    workspace.profile?.attributes.find(
      (field) => field.label.toLowerCase() === "project",
    )?.value ?? workspace.profile?.displayName;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[1.375rem] font-[750] tracking-[-0.015em]">
            Compute Engine
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            VM inventory for the open gcloud configuration
            {projectLabel ? ` · project ${projectLabel}` : ""}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {actions.map((action) => {
            if (!action.onAction) return null;
            const reason = disabledReason(action, selected);
            return (
              <Button
                key={action.id}
                variant="outline"
                size="sm"
                disabled={Boolean(reason)}
                title={reason}
                onClick={() => {
                  if (selected)
                    setConfirmation({ action: action.id, instance: selected });
                }}
              >
                <action.icon className="size-3.5" />
                {action.label}
              </Button>
            );
          })}
          <Button variant="outline" size="sm" onClick={onRefresh}>
            <RefreshCw className="size-3.5" />
            Refresh
          </Button>
        </div>
      </header>

      {inventoryLoading && instances.length === 0 ? (
        <InventoryLoadingState
          variant="banner"
          label={gcpInventoryLoadingLabel("gce")}
        />
      ) : status ? (
        <InlineBanner
          tone={status.startsWith("Could not") ? "warning" : "info"}
          title={status.split("\n")[0] ?? status}
          description={
            status.includes("\n")
              ? status.split("\n").slice(1).join(" ").trim()
              : "Select an instance and enable write mode to use lifecycle actions."
          }
        />
      ) : null}

      <section className="space-y-3 rounded-lg border border-border bg-card p-[18px] shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold">Instances</h2>
            <p className="text-xs text-muted-foreground">
              {instances.length === 1
                ? "1 instance"
                : `${instances.length} instances`}{" "}
              loaded via gcloud.
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
          getRowKey={instanceKey}
          selectedKey={selected ? instanceKey(selected) : undefined}
          onRowClick={(row) => setSelectedKey(instanceKey(row))}
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
            inventoryLoading && instances.length === 0 ? (
              <InventoryLoadingState
                label={gcpInventoryLoadingLabel("gce")}
                className="border-0 bg-transparent"
              />
            ) : (
              <EmptyState
                icon={<Cpu />}
                {...gcpTableEmptyCopy({
                  resourceLabel: "instances",
                  createHint: GCP_CREATE_HINTS.instances,
                  rowCount: instances.length,
                  listFailed:
                    workspace.gcpInventory?.gce?.emptyReason === "error",
                })}
              />
            )
          }
        />
      </section>

      <AlertDialog
        open={confirmation !== null}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmation(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmedAction?.label} Compute Engine VM?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmedAction?.label}{" "}
              <span className="font-mono font-medium text-foreground">
                {confirmedInstance?.name}
              </span>{" "}
              in zone{" "}
              <span className="font-mono">{confirmedInstance?.zone}</span>
              {projectLabel ? <> in project {projectLabel}</> : null}.
              {confirmedAction?.id === "resetInstance"
                ? " This immediately restarts the VM without a graceful shutdown. Unsaved data may be lost."
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={
                !confirmedAction ||
                Boolean(
                  disabledReason(confirmedAction, currentConfirmedInstance),
                )
              }
              onClick={async () => {
                if (
                  !confirmedAction?.onAction ||
                  !currentConfirmedInstance?.zone
                )
                  return;
                setConfirmation(null);
                setActionInFlight(true);
                try {
                  await confirmedAction.onAction(
                    currentConfirmedInstance.name,
                    currentConfirmedInstance.zone,
                  );
                } finally {
                  setActionInFlight(false);
                }
              }}
            >
              {confirmedAction?.label} instance
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
