// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, Database, RefreshCw } from "lucide-react";

import { actionCapabilityState } from "@/lib/action-capabilities";

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
import type { WorkspaceSnapshot } from "@/types/backend";

export interface AwsRdsInstance {
  dbInstanceIdentifier: string;
  engine?: string;
  engineVersion?: string;
  status?: string;
  instanceClass?: string;
  endpoint?: string;
  endpointAddress?: string;
  endpointPort?: number;
  availabilityZone?: string;
  allocatedStorage?: number;
  multiAz?: boolean;
  storageEncrypted?: boolean;
}

export type RdsWorkspaceSnapshot = WorkspaceSnapshot & {
  selectedRdsRegion?: string;
  selectedRdsInstanceId?: string;
  rdsStatusMessage?: string;
  rdsRegions: string[];
  rdsInstances: AwsRdsInstance[];
};

export type RDSViewProps = {
  workspace: RdsWorkspaceSnapshot;
  actionStatus: string;
  onRefresh: () => void;
  onSelectRegion: (region: string) => void;
  onSelectEntity: (dbInstanceIdentifier: string) => void;
  onInvokeLifecycleAction?: (action: "start" | "stop" | "reboot", instanceId: string) => void;
};

const fieldLabel =
  "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

const sectionCard = "space-y-4 rounded-lg border border-border bg-card p-[18px] shadow-sm";

const snippetCard = "rounded-lg border border-border bg-muted/40 p-3";

function instanceStatus(status?: string): Status {
  const normalised = status?.toLowerCase();
  if (normalised === "available") {
    return "on";
  }
  if (
    normalised === "creating" ||
    normalised === "backing-up" ||
    normalised === "modifying" ||
    normalised === "starting"
  ) {
    return "warning";
  }
  if (normalised === "failed" || normalised === "deleting" || normalised === "stopped") {
    return "error";
  }
  return "off";
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function formatEndpoint(instance: AwsRdsInstance): string {
  if (instance.endpoint) {
    return instance.endpoint;
  }
  if (instance.endpointAddress) {
    return instance.endpointPort
      ? `${instance.endpointAddress}:${instance.endpointPort}`
      : instance.endpointAddress;
  }
  return "Unknown";
}

function copyToClipboard(value: string, label = "Copied to clipboard"): void {
  if (navigator.clipboard) {
    void navigator.clipboard.writeText(value).then(() => {
      notify("success", label);
    });
  }
}

/**
 * v0.6 RDS panel: regional DB instance inventory with endpoint and engine detail.
 */
export default function RDSView({
  workspace,
  actionStatus,
  onRefresh,
  onSelectRegion,
  onSelectEntity,
  onInvokeLifecycleAction,
}: RDSViewProps) {
  const [filterText, setFilterText] = useState("");
  const [inspectorOpen, setInspectorOpen] = useState(Boolean(workspace.selectedRdsInstanceId));
  const lastSelectedInstanceRef = useRef(workspace.selectedRdsInstanceId || "");
  const startCapability = actionCapabilityState(workspace, "rds", "startInstance");
  const stopCapability = actionCapabilityState(workspace, "rds", "stopInstance");
  const rebootCapability = actionCapabilityState(workspace, "rds", "rebootInstance");

  const regions =
    workspace.rdsRegions.length > 0
      ? workspace.rdsRegions
      : workspace.dynamodbRegions.length > 0
        ? workspace.dynamodbRegions
        : workspace.lambdaRegions.length > 0
          ? workspace.lambdaRegions
          : workspace.ec2Regions;

  const selectedInstance = workspace.rdsInstances.find(
    (instance) => instance.dbInstanceIdentifier === workspace.selectedRdsInstanceId,
  );

  const filteredInstances = useMemo(() => {
    const query = filterText.trim().toLowerCase();
    if (!query) {
      return workspace.rdsInstances;
    }
    return workspace.rdsInstances.filter((instance) =>
      [
        instance.dbInstanceIdentifier,
        instance.engine,
        instance.engineVersion,
        instance.status,
        instance.instanceClass,
      ].some((value) => value?.toLowerCase().includes(query)),
    );
  }, [filterText, workspace.rdsInstances]);

  const statusMessage =
    actionStatus ||
    workspace.rdsStatusMessage ||
    "RDS inventory is waiting for an open AWS workspace.";

  const copySnippets = selectedInstance
    ? [
        { label: "DB instance identifier", value: selectedInstance.dbInstanceIdentifier },
        { label: "Endpoint", value: formatEndpoint(selectedInstance) },
        {
          label: "AWS CLI describe command",
          value: `aws rds describe-db-instances --db-instance-identifier ${selectedInstance.dbInstanceIdentifier}${
            workspace.selectedRdsRegion ? ` --region ${workspace.selectedRdsRegion}` : ""
          }`,
        },
        {
          label: "Instance detail JSON",
          value: JSON.stringify(
            {
              region: workspace.selectedRdsRegion,
              instance: selectedInstance,
            },
            null,
            2,
          ),
        },
      ]
    : [];

  useEffect(() => {
    const nextInstanceId = workspace.selectedRdsInstanceId || "";
    if (nextInstanceId !== lastSelectedInstanceRef.current) {
      lastSelectedInstanceRef.current = nextInstanceId;
      setInspectorOpen(Boolean(nextInstanceId));
    }
  }, [workspace.selectedRdsInstanceId]);

  if (workspace.provider?.providerId && workspace.provider.providerId !== "aws") {
    return (
      <div className="p-6">
        <EmptyState
          icon={<Database />}
          title="RDS requires an AWS workspace"
          description="Open an AWS profile from Connect to list DB instances and endpoints (works on LocalStack and real AWS)."
        />
      </div>
    );
  }

  const tableEmptyState =
    workspace.rdsInstances.length === 0 ? (
      <EmptyState
        icon={<Database />}
        title="No instances"
        description={
          workspace.selectedRdsRegion
            ? `No RDS instances were returned for ${workspace.selectedRdsRegion}.`
            : "Select a region to list RDS instances."
        }
        className="border-0"
      />
    ) : (
      <EmptyState
        icon={<Database />}
        title="No matches"
        description="No RDS instances match the current filter."
        className="border-0"
      />
    );

  const inspectorContent = selectedInstance ? (
    <ResourceInspectorPanel>
      <ResourceInspectorHeader
        icon={Database}
        eyebrow="Instance"
        title={selectedInstance.dbInstanceIdentifier}
        onClose={() => setInspectorOpen(false)}
      />

      <DetailFieldList
        fields={[
          { label: "Status", value: selectedInstance.status || "Unknown" },
          {
            label: "Engine",
            value: selectedInstance.engine
              ? `${selectedInstance.engine}${selectedInstance.engineVersion ? ` ${selectedInstance.engineVersion}` : ""}`
              : "Unknown",
          },
          { label: "Instance class", value: selectedInstance.instanceClass || "Unknown" },
          { label: "Endpoint", value: formatEndpoint(selectedInstance) },
          {
            label: "Availability zone",
            value: selectedInstance.availabilityZone || "Unknown",
          },
          {
            label: "Allocated storage",
            value:
              selectedInstance.allocatedStorage != null
                ? `${selectedInstance.allocatedStorage} GB`
                : "Unknown",
          },
          {
            label: "Multi-AZ",
            value: selectedInstance.multiAz != null ? String(selectedInstance.multiAz) : "Unknown",
          },
          {
            label: "Storage encrypted",
            value:
              selectedInstance.storageEncrypted != null
                ? String(selectedInstance.storageEncrypted)
                : "Unknown",
          },
        ]}
        emptyText="No instance details are available."
      />

      <div>
        <div className={fieldLabel}>Copy actions</div>
        <div className="mt-2 space-y-3">
          {copySnippets.map((snippet) => (
              <div key={snippet.label} className={snippetCard}>
                <div className="flex items-center justify-between gap-2">
                  <span className={fieldLabel}>{snippet.label}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      copyToClipboard(snippet.value, `${snippet.label} copied`);
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
      </div>
    </ResourceInspectorPanel>
  ) : null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-[1.375rem] font-[750] tracking-[-0.015em]">RDS</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {countLabel(workspace.rdsInstances.length, "instance", "instances")} ·{" "}
          {workspace.selectedRdsRegion || "no region selected"}
        </p>
      </header>

      <section className={sectionCard}>
        <div>
          <h2 className="text-base font-bold">Instance Fleet</h2>
          <p className="text-sm text-muted-foreground">
            Regional DB instance inventory with engine, status, and endpoint detail.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
            <div className={fieldLabel}>Selected Region</div>
            <p className="truncate text-sm">
              {workspace.selectedRdsRegion || "No region selected"}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
            <div className={fieldLabel}>Selected Instance</div>
            <p className="truncate text-sm font-mono">
              {selectedInstance?.dbInstanceIdentifier || "No instance selected"}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
            <div className={fieldLabel}>Instances</div>
            <p className="truncate text-sm">
              {countLabel(workspace.rdsInstances.length, "instance", "instances")}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
            <div className={fieldLabel}>Endpoint</div>
            <p className="truncate text-sm">
              {workspace.awsEndpointUrl || "Default AWS endpoint"}
            </p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{statusMessage}</p>
      </section>

      <section className={sectionCard}>
        <div>
          <h2 className="text-base font-bold">Instance Inventory</h2>
          <p className="text-sm text-muted-foreground">
            Select a region, filter instances, then choose one for engine and endpoint detail.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="w-56">
            <div className={cn(fieldLabel, "mb-1")}>Region</div>
            <Select
              value={workspace.selectedRdsRegion ?? ""}
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
          <Button
            variant="outline"
            disabled={!workspace.selectedRdsRegion}
            onClick={onRefresh}
          >
            <RefreshCw />
            Refresh instances
          </Button>
          {onInvokeLifecycleAction && selectedInstance ? (
            <>
              <Button
                variant="outline"
                disabled={!startCapability.enabled}
                title={startCapability.enabled ? undefined : startCapability.reason}
                onClick={() => onInvokeLifecycleAction("start", selectedInstance.dbInstanceIdentifier)}
              >
                Start instance
              </Button>
              <Button
                variant="outline"
                disabled={!stopCapability.enabled}
                title={stopCapability.enabled ? undefined : stopCapability.reason}
                onClick={() => onInvokeLifecycleAction("stop", selectedInstance.dbInstanceIdentifier)}
              >
                Stop instance
              </Button>
              <Button
                variant="outline"
                disabled={!rebootCapability.enabled}
                title={rebootCapability.enabled ? undefined : rebootCapability.reason}
                onClick={() =>
                  onInvokeLifecycleAction("reboot", selectedInstance.dbInstanceIdentifier)
                }
              >
                Reboot instance
              </Button>
            </>
          ) : null}
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
          <div className="pb-2 text-xs text-muted-foreground">
            {filteredInstances.length}/{workspace.rdsInstances.length} shown
          </div>
        </div>

        <ResourceInventoryShell
          table={
            <ResourceTable
              columns={[
                { id: "identifier", label: "Identifier" },
                { id: "engine", label: "Engine" },
                { id: "status", label: "Status" },
                { id: "class", label: "Class" },
              ]}
              rows={filteredInstances}
              selectedKey={workspace.selectedRdsInstanceId}
              getRowKey={(instance) => instance.dbInstanceIdentifier}
              onRowClick={(instance) => {
                onSelectEntity(instance.dbInstanceIdentifier);
                setInspectorOpen(true);
              }}
              renderCell={(instance, columnId) => {
                if (columnId === "identifier") {
                  return (
                    <span className="font-mono text-sm">{instance.dbInstanceIdentifier}</span>
                  );
                }
                if (columnId === "engine") {
                  return instance.engine
                    ? `${instance.engine}${instance.engineVersion ? ` ${instance.engineVersion}` : ""}`
                    : "Unknown";
                }
                if (columnId === "status") {
                  return (
                    <StatusPill
                      status={instanceStatus(instance.status)}
                      label={instance.status || "Unknown"}
                    />
                  );
                }
                if (columnId === "class") {
                  return instance.instanceClass || "Unknown";
                }
                return null;
              }}
              emptyState={tableEmptyState}
            />
          }
          inspectorContent={inspectorContent}
          inspectorOpen={inspectorOpen}
          onInspectorOpenChange={setInspectorOpen}
          inspectorAriaLabel="RDS instance details"
        />
      </section>
    </div>
  );
}