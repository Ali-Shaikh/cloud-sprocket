// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useEffect, useMemo, useRef, useState } from "react";
import { Layers, RefreshCw } from "lucide-react";

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
  AwsCloudFormationStack,
  AwsCloudFormationStackEvent,
  WorkspaceSnapshot,
} from "@/types/backend";

export type CloudFormationWorkspaceSnapshot = WorkspaceSnapshot & {
  selectedCloudFormationRegion?: string;
  selectedCloudFormationStackName?: string;
  cloudFormationStatusMessage?: string;
  cloudFormationRegions: string[];
  cloudFormationStacks: AwsCloudFormationStack[];
  cloudFormationStackEvents: AwsCloudFormationStackEvent[];
};

export type CloudFormationViewProps = {
  workspace: CloudFormationWorkspaceSnapshot;
  actionStatus: string;
  onRefresh: () => void;
  onSelectRegion: (region: string) => void;
  onSelectStack: (stackName: string) => void;
};

const fieldLabel =
  "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

const sectionCard = "space-y-4 rounded-lg border border-border bg-card p-[18px] shadow-sm";

function resourceStatus(status?: string): Status {
  const normalised = status?.toUpperCase();
  if (normalised?.includes("DELETE")) return "off";
  if (normalised?.includes("COMPLETE") && !normalised.includes("ROLLBACK")) return "on";
  if (normalised?.includes("IN_PROGRESS")) return "warning";
  if (normalised?.includes("FAILED") || normalised?.includes("ROLLBACK")) return "error";
  return "off";
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export default function CloudFormationView({
  workspace,
  actionStatus,
  onRefresh,
  onSelectRegion,
  onSelectStack,
}: CloudFormationViewProps) {
  const [stackFilter, setStackFilter] = useState("");
  const [inspectorOpen, setInspectorOpen] = useState(
    Boolean(workspace.selectedCloudFormationStackName),
  );
  const lastSelectedStackRef = useRef(workspace.selectedCloudFormationStackName || "");

  const regions =
    workspace.cloudFormationRegions.length > 0
      ? workspace.cloudFormationRegions
      : workspace.eksRegions.length > 0
        ? workspace.eksRegions
        : workspace.ec2Regions;

  const selectedStack =
    workspace.cloudFormationStacks.find(
      (stack) => stack.stackName === workspace.selectedCloudFormationStackName,
    ) ?? workspace.cloudFormationStacks[0];

  const filteredStacks = useMemo(() => {
    const query = stackFilter.trim().toLowerCase();
    if (!query) return workspace.cloudFormationStacks;
    return workspace.cloudFormationStacks.filter((stack) =>
      [stack.stackName, stack.stackId, stack.stackStatus].some((value) =>
        value?.toLowerCase().includes(query),
      ),
    );
  }, [stackFilter, workspace.cloudFormationStacks]);

  const statusMessage =
    actionStatus ||
    workspace.cloudFormationStatusMessage ||
    "CloudFormation inventory is waiting for an open AWS workspace.";

  useEffect(() => {
    const nextStackName = workspace.selectedCloudFormationStackName || "";
    if (nextStackName !== lastSelectedStackRef.current) {
      lastSelectedStackRef.current = nextStackName;
      setInspectorOpen(Boolean(nextStackName));
    }
  }, [workspace.selectedCloudFormationStackName]);

  if (!workspace.provider || workspace.provider.providerId !== "aws") {
    return (
      <div className="p-6">
        <EmptyState
          icon={<Layers />}
          title="CloudFormation requires an AWS workspace"
          description="Open an AWS profile from Connect to list stacks and recent stack events."
        />
      </div>
    );
  }

  const tableEmptyState =
    workspace.cloudFormationStacks.length === 0 ? (
      <EmptyState
        icon={<Layers />}
        title="No stacks"
        description="Select a region to list CloudFormation stacks."
        className="border-0"
      />
    ) : (
      <EmptyState
        icon={<Layers />}
        title="No matches"
        description="No stacks match the current filter."
        className="border-0"
      />
    );

  const eventsEmptyState = (
    <EmptyState
      icon={<Layers />}
      title="No stack events"
      description={
        selectedStack
          ? `No recent events for ${selectedStack.stackName}.`
          : "Select a stack to preview recent events."
      }
      className="border-0"
    />
  );

  const inspectorContent = selectedStack ? (
    <ResourceInspectorPanel>
      <ResourceInspectorHeader
        icon={Layers}
        eyebrow="Stack"
        title={selectedStack.stackName}
        subtitle={selectedStack.stackStatus || "Unknown status"}
        onClose={() => setInspectorOpen(false)}
      />

      <DetailFieldList
        fields={[
          { label: "Stack", value: selectedStack.stackName },
          { label: "Stack ID", value: selectedStack.stackId || "Not available" },
          { label: "Status", value: selectedStack.stackStatus || "Unknown" },
          { label: "Created", value: selectedStack.creationTime || "—" },
        ]}
        emptyText="No CloudFormation selection details are available."
      />

      <div>
        <div className={fieldLabel}>Recent stack events</div>
        <div className="mt-2">
          <ResourceTable
            columns={[
              { id: "timestamp", label: "Timestamp" },
              { id: "logicalId", label: "Logical ID" },
              { id: "status", label: "Status" },
              { id: "type", label: "Type" },
            ]}
            rows={workspace.cloudFormationStackEvents}
            getRowKey={(event) => event.eventId}
            renderCell={(event, columnId) => {
              if (columnId === "timestamp") {
                return event.timestamp || "—";
              }
              if (columnId === "logicalId") {
                return event.logicalResourceId || "—";
              }
              if (columnId === "status") {
                return event.resourceStatus || "—";
              }
              if (columnId === "type") {
                return event.resourceType || "—";
              }
              return null;
            }}
            emptyState={eventsEmptyState}
          />
        </div>
      </div>
    </ResourceInspectorPanel>
  ) : null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-[1.375rem] font-[750] tracking-[-0.015em]">CloudFormation</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {countLabel(workspace.cloudFormationStacks.length, "stack", "stacks")} ·{" "}
          {workspace.selectedCloudFormationRegion || "no region selected"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{statusMessage}</p>
      </header>

      <section className={sectionCard}>
        <div>
          <h2 className="text-base font-bold">Stack inventory</h2>
          <p className="text-sm text-muted-foreground">
            Browse regional stacks and inspect recent events for the selected stack.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="w-56">
            <div className={cn(fieldLabel, "mb-1")}>Region</div>
            <Select
              value={workspace.selectedCloudFormationRegion ?? ""}
              onValueChange={(value) => value && onSelectRegion(value)}
            >
              <SelectTrigger>
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
            disabled={!workspace.selectedCloudFormationRegion}
            onClick={onRefresh}
          >
            <RefreshCw />
            Refresh inventory
          </Button>
          <div className="min-w-56 flex-1">
            <div className={cn(fieldLabel, "mb-1")}>Filter</div>
            <Input
              placeholder="Filter stacks"
              value={stackFilter}
              onChange={(event) => setStackFilter(event.target.value)}
            />
          </div>
          <div className="pb-2 text-xs text-muted-foreground">
            {filteredStacks.length}/{workspace.cloudFormationStacks.length} shown
          </div>
        </div>

        <ResourceInventoryShell
          table={
            <ResourceTable
              columns={[
                { id: "name", label: "Stack" },
                { id: "status", label: "Status" },
                { id: "created", label: "Created" },
              ]}
              rows={filteredStacks}
              selectedKey={workspace.selectedCloudFormationStackName}
              getRowKey={(stack) => stack.stackName}
              onRowClick={(stack) => {
                onSelectStack(stack.stackName);
                setInspectorOpen(true);
              }}
              renderCell={(stack, columnId) => {
                if (columnId === "name") {
                  return <span className="font-medium">{stack.stackName}</span>;
                }
                if (columnId === "status") {
                  return (
                    <StatusPill
                      status={resourceStatus(stack.stackStatus)}
                      label={stack.stackStatus || "Unknown"}
                    />
                  );
                }
                if (columnId === "created") {
                  return stack.creationTime || "—";
                }
                return null;
              }}
              emptyState={tableEmptyState}
            />
          }
          inspectorContent={inspectorContent}
          inspectorOpen={inspectorOpen}
          onInspectorOpenChange={setInspectorOpen}
          inspectorAriaLabel="CloudFormation stack details"
        />
      </section>
    </div>
  );
}