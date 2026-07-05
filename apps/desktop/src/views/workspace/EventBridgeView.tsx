// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useMemo, useState } from "react";
import { GitBranch, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { StatusPill } from "@/components/status-pill";
import type { Status } from "@/components/status-dot";
import { DetailFieldList } from "./detail-fields";
import type { AwsEventBridgeBus, AwsEventBridgeRule, WorkspaceSnapshot } from "@/types/backend";

export type EventBridgeWorkspaceSnapshot = WorkspaceSnapshot & {
  selectedEventBridgeRegion?: string;
  selectedEventBridgeBusName?: string;
  eventBridgeStatusMessage?: string;
  eventBridgeRegions: string[];
  eventBridgeBuses: AwsEventBridgeBus[];
  eventBridgeRules: AwsEventBridgeRule[];
};

export type EventBridgeViewProps = {
  workspace: EventBridgeWorkspaceSnapshot;
  actionStatus: string;
  onRefresh: () => void;
  onSelectRegion: (region: string) => void;
  onSelectBus: (busName: string) => void;
};

const fieldLabel = "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";
const sectionCard = "space-y-4 rounded-lg border border-border bg-card p-[18px] shadow-sm";

function ruleStatus(state?: string): Status {
  const normalised = state?.toUpperCase();
  if (normalised === "ENABLED") return "on";
  if (normalised === "DISABLED") return "off";
  return "warning";
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export default function EventBridgeView({
  workspace,
  actionStatus,
  onRefresh,
  onSelectRegion,
  onSelectBus,
}: EventBridgeViewProps) {
  const [ruleFilter, setRuleFilter] = useState("");
  const regions =
    workspace.eventBridgeRegions.length > 0
      ? workspace.eventBridgeRegions
      : workspace.eksRegions.length > 0
        ? workspace.eksRegions
        : workspace.ec2Regions;
  const selectedBus =
    workspace.eventBridgeBuses.find((bus) => bus.name === workspace.selectedEventBridgeBusName) ??
    workspace.eventBridgeBuses[0];
  const filteredRules = useMemo(() => {
    const query = ruleFilter.trim().toLowerCase();
    if (!query) return workspace.eventBridgeRules;
    return workspace.eventBridgeRules.filter((rule) =>
      [rule.name, rule.description, rule.scheduleExpression, rule.eventPattern].some((value) =>
        value?.toLowerCase().includes(query),
      ),
    );
  }, [ruleFilter, workspace.eventBridgeRules]);
  const statusMessage =
    actionStatus ||
    workspace.eventBridgeStatusMessage ||
    "EventBridge inventory is waiting for an open AWS workspace.";

  if (!workspace.provider || workspace.provider.providerId !== "aws") {
    return (
      <div className="p-6">
        <EmptyState
          icon={<GitBranch />}
          title="EventBridge requires an AWS workspace"
          description="Open an AWS profile from Connect to list event buses and rules."
        />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-6">
      <div>
        <h1 className="text-[1.375rem] font-[750]">EventBridge</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {countLabel(workspace.eventBridgeBuses.length, "bus", "buses")} ·{" "}
          {workspace.selectedEventBridgeRegion || "no region selected"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{statusMessage}</p>
      </div>

      <div className={sectionCard}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-56">
            <div className={cn(fieldLabel, "mb-1")}>Region</div>
            <Select
              value={workspace.selectedEventBridgeRegion ?? ""}
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
          <Button variant="outline" disabled={!workspace.selectedEventBridgeRegion} onClick={onRefresh}>
            <RefreshCw />
            Refresh inventory
          </Button>
        </div>
        {workspace.eventBridgeBuses.length === 0 ? (
          <EmptyState
            icon={<GitBranch />}
            title="No event buses"
            description="Select a region to list EventBridge buses."
            className="border-0"
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bus</TableHead>
                <TableHead>ARN</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workspace.eventBridgeBuses.map((bus) => (
                <TableRow
                  key={bus.name}
                  className={cn(
                    "cursor-pointer",
                    bus.name === workspace.selectedEventBridgeBusName && "bg-muted/50",
                  )}
                  onClick={() => onSelectBus(bus.name)}
                >
                  <TableCell>{bus.name}</TableCell>
                  <TableCell className="font-mono text-xs">{bus.arn || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {selectedBus ? (
        <div className={sectionCard}>
          <h2 className="text-sm font-semibold">Rules on {selectedBus.name}</h2>
          <Input
            placeholder="Filter rules"
            value={ruleFilter}
            onChange={(event) => setRuleFilter(event.target.value)}
          />
          {workspace.eventBridgeRules.length === 0 ? (
            <EmptyState
              icon={<GitBranch />}
              title="No rules"
              description={`No rules were returned for bus ${selectedBus.name}.`}
              className="border-0"
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Schedule</TableHead>
                  <TableHead>Description</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRules.map((rule) => (
                  <TableRow key={rule.name}>
                    <TableCell>{rule.name}</TableCell>
                    <TableCell>
                      <StatusPill status={ruleStatus(rule.state)} label={rule.state || "Unknown"} />
                    </TableCell>
                    <TableCell>{rule.scheduleExpression || rule.eventPattern || "—"}</TableCell>
                    <TableCell>{rule.description || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <DetailFieldList
            fields={[
              { label: "Bus", value: selectedBus.name },
              { label: "ARN", value: selectedBus.arn || "Not available" },
            ]}
            emptyText="No EventBridge selection details are available."
          />
        </div>
      ) : null}
    </div>
  );
}