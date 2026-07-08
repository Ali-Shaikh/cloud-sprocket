// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useEffect, useMemo, useRef, useState } from "react";
import { GitBranch, RefreshCw } from "lucide-react";

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

const fieldLabel =
  "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

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
  const [inspectorOpen, setInspectorOpen] = useState(Boolean(workspace.selectedEventBridgeBusName));
  const lastSelectedBusRef = useRef(workspace.selectedEventBridgeBusName || "");

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

  useEffect(() => {
    const nextBusName = workspace.selectedEventBridgeBusName || "";
    if (nextBusName !== lastSelectedBusRef.current) {
      lastSelectedBusRef.current = nextBusName;
      setInspectorOpen(Boolean(nextBusName));
    }
  }, [workspace.selectedEventBridgeBusName]);

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

  const tableEmptyState =
    workspace.eventBridgeBuses.length === 0 ? (
      <EmptyState
        icon={<GitBranch />}
        title="No event buses"
        description="Select a region to list EventBridge buses."
        className="border-0"
      />
    ) : (
      <EmptyState
        icon={<GitBranch />}
        title="No matches"
        description="No event buses match the current filter."
        className="border-0"
      />
    );

  const rulesEmptyState = (
    <EmptyState
      icon={<GitBranch />}
      title="No rules"
      description={
        selectedBus
          ? `No rules were returned for bus ${selectedBus.name}.`
          : "Select an event bus to list rules."
      }
      className="border-0"
    />
  );

  const inspectorContent = selectedBus ? (
    <ResourceInspectorPanel>
      <ResourceInspectorHeader
        icon={GitBranch}
        eyebrow="Event bus"
        title={selectedBus.name}
        subtitle={selectedBus.arn || "ARN unavailable"}
        onClose={() => setInspectorOpen(false)}
      />

      <DetailFieldList
        fields={[
          { label: "Bus", value: selectedBus.name },
          { label: "ARN", value: selectedBus.arn || "Not available" },
          { label: "Rules", value: String(workspace.eventBridgeRules.length) },
        ]}
        emptyText="No EventBridge selection details are available."
      />

      <div>
        <div className={fieldLabel}>Rules on {selectedBus.name}</div>
        <div className="mt-2 space-y-3">
          <Input
            placeholder="Filter rules"
            value={ruleFilter}
            onChange={(event) => setRuleFilter(event.target.value)}
          />
          <ResourceTable
            columns={[
              { id: "name", label: "Name" },
              { id: "state", label: "State" },
              { id: "schedule", label: "Schedule" },
              { id: "description", label: "Description" },
            ]}
            rows={filteredRules}
            getRowKey={(rule) => rule.name}
            renderCell={(rule, columnId) => {
              if (columnId === "name") {
                return <span className="font-medium">{rule.name}</span>;
              }
              if (columnId === "state") {
                return (
                  <StatusPill status={ruleStatus(rule.state)} label={rule.state || "Unknown"} />
                );
              }
              if (columnId === "schedule") {
                return rule.scheduleExpression || rule.eventPattern || "—";
              }
              if (columnId === "description") {
                return rule.description || "—";
              }
              return null;
            }}
            emptyState={rulesEmptyState}
          />
        </div>
      </div>
    </ResourceInspectorPanel>
  ) : null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-[1.375rem] font-[750] tracking-[-0.015em]">EventBridge</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {countLabel(workspace.eventBridgeBuses.length, "bus", "buses")} ·{" "}
          {workspace.selectedEventBridgeRegion || "no region selected"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{statusMessage}</p>
      </header>

      <section className={sectionCard}>
        <div>
          <h2 className="text-base font-bold">Event bus inventory</h2>
          <p className="text-sm text-muted-foreground">
            Browse regional event buses and inspect rules for the selected bus.
          </p>
        </div>

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
          <Button
            variant="outline"
            disabled={!workspace.selectedEventBridgeRegion}
            onClick={onRefresh}
          >
            <RefreshCw />
            Refresh inventory
          </Button>
        </div>

        <ResourceInventoryShell
          table={
            <ResourceTable
              columns={[
                { id: "name", label: "Bus" },
                { id: "arn", label: "ARN", cellClassName: "font-mono text-xs" },
              ]}
              rows={workspace.eventBridgeBuses}
              selectedKey={workspace.selectedEventBridgeBusName}
              getRowKey={(bus) => bus.name}
              onRowClick={(bus) => {
                onSelectBus(bus.name);
                setInspectorOpen(true);
              }}
              renderCell={(bus, columnId) => {
                if (columnId === "name") {
                  return <span className="font-medium">{bus.name}</span>;
                }
                if (columnId === "arn") {
                  return bus.arn || "—";
                }
                return null;
              }}
              emptyState={tableEmptyState}
            />
          }
          inspectorContent={inspectorContent}
          inspectorOpen={inspectorOpen}
          onInspectorOpenChange={setInspectorOpen}
          inspectorAriaLabel="EventBridge bus details"
        />
      </section>
    </div>
  );
}