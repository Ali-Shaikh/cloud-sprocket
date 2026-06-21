// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useMemo, useState } from "react";
import { Copy, Database, RefreshCw } from "lucide-react";

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
}: RDSViewProps) {
  const [filterText, setFilterText] = useState("");

  const regions =
    workspace.rdsRegions.length > 0
      ? workspace.rdsRegions
      : workspace.dynamodbRegions.length > 0
        ? workspace.dynamodbRegions
        : workspace.lambdaRegions.length > 0
          ? workspace.lambdaRegions
          : workspace.ec2Regions;

  const selectedInstance =
    workspace.rdsInstances.find(
      (instance) => instance.dbInstanceIdentifier === workspace.selectedRdsInstanceId,
    ) ?? workspace.rdsInstances[0];

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

        <div className="overflow-hidden rounded-lg border border-border">
          {workspace.rdsInstances.length === 0 ? (
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
          ) : filteredInstances.length === 0 ? (
            <EmptyState
              icon={<Database />}
              title="No matches"
              description="No RDS instances match the current filter."
              className="border-0"
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Identifier</TableHead>
                  <TableHead>Engine</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Class</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInstances.map((instance) => {
                  const active =
                    instance.dbInstanceIdentifier === selectedInstance?.dbInstanceIdentifier;
                  return (
                    <TableRow
                      key={instance.dbInstanceIdentifier}
                      data-state={active ? "selected" : undefined}
                      className="cursor-pointer"
                      onClick={() => {
                        onSelectEntity(instance.dbInstanceIdentifier);
                      }}
                    >
                      <TableCell className="font-mono text-sm">
                        {instance.dbInstanceIdentifier}
                      </TableCell>
                      <TableCell>
                        {instance.engine
                          ? `${instance.engine}${instance.engineVersion ? ` ${instance.engineVersion}` : ""}`
                          : "Unknown"}
                      </TableCell>
                      <TableCell>
                        <StatusPill
                          status={instanceStatus(instance.status)}
                          label={instance.status || "Unknown"}
                        />
                      </TableCell>
                      <TableCell>{instance.instanceClass || "Unknown"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={sectionCard}>
          <div>
            <h2 className="text-base font-bold">Instance Detail</h2>
            <p className="text-sm text-muted-foreground">
              {selectedInstance?.dbInstanceIdentifier || "Select an instance for engine and endpoint detail."}
            </p>
          </div>
          {selectedInstance ? (
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
          ) : (
            <p className="text-sm text-muted-foreground">No RDS instance selected.</p>
          )}
        </section>

        <section className={sectionCard}>
          <div>
            <h2 className="text-base font-bold">Copy Actions</h2>
            <p className="text-sm text-muted-foreground">
              Generated locally from the selected region and instance. No snippet is stored.
            </p>
          </div>
          {copySnippets.length === 0 ? (
            <p className="text-sm text-muted-foreground">Select an instance to generate copy actions.</p>
          ) : (
            <div className="space-y-3">
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
          )}
        </section>
      </div>
    </div>
  );
}