// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, Loader2, RefreshCw, Server } from "lucide-react";

import { cn } from "@/lib/utils";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EmptyState } from "@/components/empty-state";
import { StatusPill } from "@/components/status-pill";
import type { Status } from "@/components/status-dot";
import {
  ResourceInspectorHeader,
  ResourceInspectorPanel,
  ResourceInventoryShell,
} from "@/components/inventory/resource-inspector";
import { ResourceTable } from "@/components/inventory/resource-table";
import { actionCapabilityState, actionDisabledReason } from "@/lib/action-capabilities";
import { DetailFieldList } from "./detail-fields";
import type {
  AwsEc2Instance,
  JobLifecycle,
  WorkspaceSnapshot,
} from "@/types/backend";

export type EC2LifecycleAction = "start" | "stop" | "reboot";

export type EC2ActionHistoryItem = {
  jobId: string;
  status: JobLifecycle;
  message: string;
  completedAt?: string;
};

export type ComputeViewProps = {
  workspace: WorkspaceSnapshot;
  actionStatus: string;
  actionInFlight: boolean;
  actionHistory: EC2ActionHistoryItem[];
  onRefreshInstances: () => void;
  onSelectRegion: (region: string) => void;
  onSelectInstance: (instanceId: string) => void;
  onInvokeAction: (action: EC2LifecycleAction, instanceId: string) => void;
};

type PendingEC2Action = {
  action: EC2LifecycleAction;
  instance: AwsEc2Instance;
};

/** Maps an EC2 instance state onto the StatusPill palette. */
function instanceStateStatus(state?: string): Status {
  if (state === "running") {
    return "on";
  }
  if (state === "stopped" || state === "stopping") {
    return "warning";
  }
  if (state === "terminated" || state === "shutting-down") {
    return "error";
  }
  return "off";
}

/** Maps a job lifecycle onto the StatusPill palette. */
function jobStatus(status: JobLifecycle): Status {
  if (status === "completed") {
    return "on";
  }
  if (status === "failed") {
    return "error";
  }
  if (status === "running" || status === "queued") {
    return "warning";
  }
  return "off";
}

function ec2ConsoleUrl(region: string | undefined, instanceId: string): string {
  const consoleRegion = region || "us-east-1";
  return `https://${consoleRegion}.console.aws.amazon.com/ec2/home?region=${consoleRegion}#InstanceDetails:instanceId=${instanceId}`;
}

function joinedValues(values: string[] | undefined, emptyText = "Unavailable"): string {
  return values && values.length > 0 ? values.join(", ") : emptyText;
}

function ec2TagValues(tags: AwsEc2Instance["tags"]): string {
  if (!tags || tags.length === 0) {
    return "No tags returned";
  }
  return tags.map((tag) => `${tag.label}=${tag.value}`).join(", ");
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function copyToClipboard(value: string): void {
  if (navigator.clipboard) {
    void navigator.clipboard.writeText(value);
  }
}

const fieldLabel =
  "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

const sectionCard = "space-y-4 rounded-lg border border-border bg-card p-[18px] shadow-sm";

const snippetCard = "rounded-lg border border-border bg-muted/40 p-3";

/**
 * M5b Compute: Tailwind replacement for the Cloudscape EC2 tab. Region-scoped
 * fleet summary, the filterable instance inventory with guarded lifecycle
 * actions, instance detail, copy snippets, and the session action history.
 */
export default function ComputeView({
  workspace,
  actionStatus,
  actionInFlight,
  actionHistory,
  onRefreshInstances,
  onSelectRegion,
  onSelectInstance,
  onInvokeAction,
}: ComputeViewProps) {
  const [filterText, setFilterText] = useState("");
  const [pending, setPending] = useState<PendingEC2Action | undefined>(undefined);
  const [inspectorOpen, setInspectorOpen] = useState(Boolean(workspace.selectedEc2InstanceId));
  const lastSelectedInstanceRef = useRef(workspace.selectedEc2InstanceId || "");

  const selectedInstance =
    workspace.ec2Instances.find(
      (instance) => instance.instanceId === workspace.selectedEc2InstanceId,
    ) ?? workspace.ec2Instances[0];

  const filteredInstances = useMemo(() => {
    const query = filterText.trim().toLowerCase();
    if (!query) {
      return workspace.ec2Instances;
    }
    return workspace.ec2Instances.filter((instance) =>
      [
        instance.instanceId,
        instance.name,
        instance.state,
        instance.instanceType,
        instance.availabilityZone,
        instance.privateIp,
        instance.publicIp,
      ].some((value) => value?.toLowerCase().includes(query)),
    );
  }, [filterText, workspace.ec2Instances]);

  useEffect(() => {
    const nextInstanceId = workspace.selectedEc2InstanceId || "";
    if (nextInstanceId !== lastSelectedInstanceRef.current) {
      lastSelectedInstanceRef.current = nextInstanceId;
      setInspectorOpen(Boolean(nextInstanceId));
    }
  }, [workspace.selectedEc2InstanceId]);

  const selectedState = selectedInstance?.state?.toLowerCase();
  const startCapability = actionCapabilityState(workspace, "ec2", "start");
  const stopCapability = actionCapabilityState(workspace, "ec2", "stop");
  const rebootCapability = actionCapabilityState(workspace, "ec2", "reboot");
  const canStart =
    startCapability.enabled &&
    Boolean(selectedInstance) &&
    selectedState === "stopped" &&
    !actionInFlight;
  const canStop =
    stopCapability.enabled &&
    Boolean(selectedInstance) &&
    selectedState === "running" &&
    !actionInFlight;
  const canReboot =
    rebootCapability.enabled &&
    Boolean(selectedInstance) &&
    selectedState === "running" &&
    !actionInFlight;
  const startDisabledReason = canStart
    ? undefined
    : actionDisabledReason(
        workspace,
        "ec2",
        "start",
        !selectedInstance
          ? "Select an instance first."
          : selectedState !== "stopped"
            ? "Start is only available when the instance is stopped."
            : undefined,
      );
  const stopDisabledReason = canStop
    ? undefined
    : actionDisabledReason(
        workspace,
        "ec2",
        "stop",
        !selectedInstance
          ? "Select an instance first."
          : selectedState !== "running"
            ? "Stop is only available when the instance is running."
            : undefined,
      );
  const rebootDisabledReason = canReboot
    ? undefined
    : actionDisabledReason(
        workspace,
        "ec2",
        "reboot",
        !selectedInstance
          ? "Select an instance first."
          : selectedState !== "running"
            ? "Reboot is only available when the instance is running."
            : undefined,
      );

  const pendingLabel = pending
    ? pending.action[0].toUpperCase() + pending.action.slice(1)
    : "";

  const requestAction = (action: EC2LifecycleAction) => {
    if (selectedInstance) {
      setPending({ action, instance: selectedInstance });
    }
  };

  const copySnippets = selectedInstance
    ? [
        {
          label: "Instance ID",
          value: selectedInstance.instanceId,
        },
        {
          label: "AWS CLI describe command",
          value: `aws ec2 describe-instances --instance-ids ${selectedInstance.instanceId}${
            workspace.selectedEc2Region ? ` --region ${workspace.selectedEc2Region}` : ""
          }`,
        },
        {
          label: "AWS Console URL",
          value: ec2ConsoleUrl(workspace.selectedEc2Region, selectedInstance.instanceId),
        },
        {
          label: "Private connection hint",
          value: selectedInstance.privateIp
            ? `ssh ec2-user@${selectedInstance.privateIp}`
            : "No private IP address is available for this instance.",
        },
        {
          label: "Instance detail JSON",
          value: JSON.stringify(
            {
              region: workspace.selectedEc2Region,
              instance: selectedInstance,
            },
            null,
            2,
          ),
        },
        {
          label: "Instance CSV row",
          value: [
            "region,instanceId,name,state,instanceType,privateIp,publicIp,vpcId,subnetId",
            [
              workspace.selectedEc2Region || "",
              selectedInstance.instanceId,
              selectedInstance.name || "",
              selectedInstance.state || "",
              selectedInstance.instanceType || "",
              selectedInstance.privateIp || "",
              selectedInstance.publicIp || "",
              selectedInstance.vpcId || "",
              selectedInstance.subnetId || "",
            ]
              .map((value) => `"${value.replaceAll("\"", "\"\"")}"`)
              .join(","),
          ].join("\n"),
        },
      ]
    : [];

  const tableEmptyState =
    workspace.ec2Instances.length === 0 ? (
      <EmptyState
        icon={<Server />}
        title="No instances"
        description="No EC2 instances loaded for this region."
        className="border-0"
      />
    ) : (
      <EmptyState
        icon={<Server />}
        title="No matches"
        description="No EC2 instances match the current filter."
        className="border-0"
      />
    );

  const inspectorContent = selectedInstance ? (
    <ResourceInspectorPanel>
      <ResourceInspectorHeader
        icon={Server}
        eyebrow="Instance"
        title={selectedInstance.name || selectedInstance.instanceId}
        subtitle={selectedInstance.instanceId}
        onClose={() => setInspectorOpen(false)}
      />

      <DetailFieldList
        fields={[
          { label: "Name", value: selectedInstance.name || "Unnamed" },
          { label: "State", value: selectedInstance.state || "Unknown" },
          { label: "Instance Type", value: selectedInstance.instanceType || "Unknown" },
          {
            label: "Availability Zone",
            value: selectedInstance.availabilityZone || "Unknown",
          },
          { label: "VPC", value: selectedInstance.vpcId || "Unavailable" },
          { label: "Subnet", value: selectedInstance.subnetId || "Unavailable" },
          {
            label: "Security Groups",
            value: joinedValues(selectedInstance.securityGroups),
          },
          { label: "Key Pair", value: selectedInstance.keyName || "Unavailable" },
          {
            label: "Platform",
            value: selectedInstance.platformDetails || "Unavailable",
          },
          {
            label: "Architecture",
            value: selectedInstance.architecture || "Unavailable",
          },
          { label: "Launch Time", value: selectedInstance.launchTime || "Unavailable" },
          { label: "Private IP", value: selectedInstance.privateIp || "Unavailable" },
          { label: "Public IP", value: selectedInstance.publicIp || "Unavailable" },
          { label: "Tags", value: ec2TagValues(selectedInstance.tags) },
        ]}
        emptyText="No instance details are available."
      />

      <div>
        <div className={fieldLabel}>Copy actions</div>
        {copySnippets.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Select an instance to generate copy actions.
          </p>
        ) : (
          <div className="mt-2 space-y-3">
            {copySnippets.map((snippet) => (
              <div key={snippet.label} className={snippetCard}>
                <div className="flex items-center justify-between gap-2">
                  <span className={fieldLabel}>{snippet.label}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      copyToClipboard(snippet.value);
                    }}
                  >
                    <Copy />
                    Copy
                  </Button>
                </div>
                <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-xs">
                  {snippet.value}
                </pre>
              </div>
            ))}
          </div>
        )}
      </div>
    </ResourceInspectorPanel>
  ) : null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-[1.375rem] font-[750] tracking-[-0.015em]">Compute</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {countLabel(workspace.ec2Instances.length, "instance", "instances")} ·{" "}
          {workspace.selectedEc2Region || "no region selected"}
        </p>
      </header>

      {actionInFlight ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
          <Loader2 className="size-5 shrink-0 animate-spin text-primary" />
          <span className="font-medium">EC2 operation running</span>
          <span className="text-muted-foreground">{actionStatus}</span>
        </div>
      ) : null}

      <section className={sectionCard}>
        <div>
          <h2 className="text-base font-bold">EC2 Fleet</h2>
          <p className="text-sm text-muted-foreground">
            Region-scoped instance inventory with local-endpoint write protection.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
            <div className={fieldLabel}>Selected Region</div>
            <p className="truncate text-sm">
              {workspace.selectedEc2Region || "No region selected"}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
            <div className={fieldLabel}>Selected Instance</div>
            <p className="truncate text-sm">
              {selectedInstance?.instanceId || "No instance selected"}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
            <div className={fieldLabel}>Instances</div>
            <p className="truncate text-sm">
              {countLabel(workspace.ec2Instances.length, "instance", "instances")}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
            <div className={fieldLabel}>Write Mode</div>
            <p className="truncate text-sm">
              {startCapability.enabled ? "Writes enabled" : "Read-only"}
            </p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {workspace.ec2StatusMessage || "EC2 inventory is waiting for an open AWS workspace."}
          {workspace.awsEndpointUrl ? ` Endpoint: ${workspace.awsEndpointUrl}.` : ""}
        </p>
      </section>

      <section className={sectionCard}>
        <div>
          <h2 className="text-base font-bold">Instance Inventory</h2>
          <p className="text-sm text-muted-foreground">
            Select a region, filter instances, then choose one instance for details and actions.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="w-56">
            <div className={cn(fieldLabel, "mb-1")}>Region</div>
            <Select
              value={workspace.selectedEc2Region ?? ""}
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
                {workspace.ec2Regions.map((region) => (
                  <SelectItem key={region} value={region}>
                    {region}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="outline"
            disabled={!workspace.selectedEc2Region || actionInFlight}
            onClick={onRefreshInstances}
          >
            <RefreshCw />
            Refresh EC2
          </Button>
          <div className="min-w-56 flex-1">
            <div className={cn(fieldLabel, "mb-1")}>Filter</div>
            <Input
              value={filterText}
              placeholder="Filter instances"
              onChange={(event) => {
                setFilterText(event.target.value);
              }}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              disabled={!canStart}
              title={startDisabledReason}
              onClick={() => {
                requestAction("start");
              }}
            >
              Start
            </Button>
            <Button
              variant="outline"
              disabled={!canStop}
              title={stopDisabledReason}
              onClick={() => {
                requestAction("stop");
              }}
            >
              Stop
            </Button>
            <Button
              variant="outline"
              disabled={!canReboot}
              title={rebootDisabledReason}
              onClick={() => {
                requestAction("reboot");
              }}
            >
              Reboot
            </Button>
            {startDisabledReason || stopDisabledReason || rebootDisabledReason ? (
              <span className="text-xs text-muted-foreground">
                {startDisabledReason || stopDisabledReason || rebootDisabledReason}
              </span>
            ) : null}
          </div>
          <div className="pb-2 text-xs text-muted-foreground">
            {filteredInstances.length}/{workspace.ec2Instances.length} shown
          </div>
        </div>

        <ResourceInventoryShell
          table={
            <ResourceTable
              columns={[
                { id: "name", label: "Name" },
                { id: "instanceId", label: "Instance ID" },
                { id: "state", label: "State" },
                { id: "type", label: "Type" },
                { id: "zone", label: "Zone" },
                { id: "privateIp", label: "Private IP" },
                { id: "publicIp", label: "Public IP" },
              ]}
              rows={filteredInstances}
              selectedKey={selectedInstance?.instanceId}
              getRowKey={(instance) => instance.instanceId}
              onRowClick={(instance) => {
                onSelectInstance(instance.instanceId);
                setInspectorOpen(true);
              }}
              renderCell={(instance, columnId) => {
                if (columnId === "name") {
                  return <span className="font-medium">{instance.name || "Unnamed"}</span>;
                }
                if (columnId === "instanceId") {
                  return instance.instanceId;
                }
                if (columnId === "state") {
                  return (
                    <StatusPill
                      status={instanceStateStatus(instance.state)}
                      label={instance.state || "Unknown"}
                    />
                  );
                }
                if (columnId === "type") {
                  return instance.instanceType || "Unknown";
                }
                if (columnId === "zone") {
                  return instance.availabilityZone || "Unknown";
                }
                if (columnId === "privateIp") {
                  return instance.privateIp || "Unavailable";
                }
                return instance.publicIp || "Unavailable";
              }}
              emptyState={tableEmptyState}
            />
          }
          inspectorContent={inspectorContent}
          inspectorOpen={inspectorOpen}
          onInspectorOpenChange={setInspectorOpen}
          inspectorAriaLabel="EC2 instance details"
        />

        <p className="text-sm text-muted-foreground">{actionStatus}</p>
      </section>

      <AlertDialog
        open={Boolean(pending)}
        onOpenChange={(open) => {
          if (!open) {
            setPending(undefined);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pendingLabel} EC2 instance</AlertDialogTitle>
            <AlertDialogDescription>
              This will send a live EC2 {pending?.action} request to the selected profile
              endpoint.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <DetailFieldList
            fields={
              pending
                ? [
                    { label: "Instance", value: pending.instance.instanceId },
                    { label: "Current State", value: pending.instance.state || "Unknown" },
                    { label: "Region", value: workspace.selectedEc2Region || "Unknown" },
                    {
                      label: "Endpoint",
                      value: workspace.awsEndpointUrl || "Default AWS endpoint",
                    },
                  ]
                : []
            }
            emptyText="No action details are available."
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pending) {
                  onInvokeAction(pending.action, pending.instance.instanceId);
                }
                setPending(undefined);
              }}
            >
              Confirm {pendingLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <section className={sectionCard}>
        <div>
          <h2 className="text-base font-bold">EC2 Action History</h2>
          <p className="text-sm text-muted-foreground">
            Recent lifecycle job messages for this workspace session.
          </p>
        </div>
        {actionHistory.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No EC2 lifecycle actions have run in this session.
          </p>
        ) : (
          <div className="space-y-3">
            {actionHistory.map((item) => (
              <div key={item.jobId} className={cn(snippetCard, "space-y-1")}>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill
                    status={jobStatus(item.status)}
                    label={item.status}
                    pulse={item.status === "running" || item.status === "queued"}
                  />
                  <span className="text-sm">{item.message}</span>
                </div>
                {item.completedAt ? (
                  <p className="text-xs text-muted-foreground">{item.completedAt}</p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}