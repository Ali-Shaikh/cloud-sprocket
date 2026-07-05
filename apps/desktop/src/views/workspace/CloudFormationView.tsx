// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useMemo, useState } from "react";
import { Layers, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { StatusPill } from "@/components/status-pill";
import type { Status } from "@/components/status-dot";
import { DetailFieldList } from "./detail-fields";
import type { AwsCloudFormationStack, AwsCloudFormationStackEvent, WorkspaceSnapshot } from "@/types/backend";

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

const fieldLabel = "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";
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

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-6">
      <div>
        <h1 className="text-[1.375rem] font-[750]">CloudFormation</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {countLabel(workspace.cloudFormationStacks.length, "stack", "stacks")} ·{" "}
          {workspace.selectedCloudFormationRegion || "no region selected"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{statusMessage}</p>
      </div>

      <div className={sectionCard}>
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
          <Button variant="outline" disabled={!workspace.selectedCloudFormationRegion} onClick={onRefresh}>
            <RefreshCw />
            Refresh inventory
          </Button>
        </div>
        <Input
          placeholder="Filter stacks"
          value={stackFilter}
          onChange={(event) => setStackFilter(event.target.value)}
        />
        {workspace.cloudFormationStacks.length === 0 ? (
          <EmptyState
            icon={<Layers />}
            title="No stacks"
            description="Select a region to list CloudFormation stacks."
            className="border-0"
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Stack</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredStacks.map((stack) => (
                <TableRow
                  key={stack.stackId}
                  className={cn(
                    "cursor-pointer",
                    stack.stackName === workspace.selectedCloudFormationStackName && "bg-muted/50",
                  )}
                  onClick={() => onSelectStack(stack.stackName)}
                >
                  <TableCell>{stack.stackName}</TableCell>
                  <TableCell>
                    <StatusPill status={resourceStatus(stack.stackStatus)} label={stack.stackStatus || "Unknown"} />
                  </TableCell>
                  <TableCell>{stack.creationTime || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {selectedStack ? (
        <div className={sectionCard}>
          <h2 className="text-sm font-semibold">Recent stack events</h2>
          {workspace.cloudFormationStackEvents.length === 0 ? (
            <EmptyState
              icon={<Layers />}
              title="No stack events"
              description={`No recent events for ${selectedStack.stackName}.`}
              className="border-0"
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Logical ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Type</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workspace.cloudFormationStackEvents.map((event) => (
                  <TableRow key={event.eventId}>
                    <TableCell>{event.timestamp || "—"}</TableCell>
                    <TableCell>{event.logicalResourceId || "—"}</TableCell>
                    <TableCell>{event.resourceStatus || "—"}</TableCell>
                    <TableCell>{event.resourceType || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <DetailFieldList
            fields={[
              { label: "Stack", value: selectedStack.stackName },
              { label: "Status", value: selectedStack.stackStatus || "Unknown" },
            ]}
            emptyText="No CloudFormation selection details are available."
          />
        </div>
      ) : null}
    </div>
  );
}