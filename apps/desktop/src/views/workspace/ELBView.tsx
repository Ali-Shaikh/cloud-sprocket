// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, Scale } from "lucide-react";

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
  AwsElbLoadBalancer,
  AwsElbTargetGroup,
  WorkspaceSnapshot,
} from "@/types/backend";

export type ElbWorkspaceSnapshot = WorkspaceSnapshot & {
  selectedElbRegion?: string;
  selectedElbLoadBalancerArn?: string;
  elbStatusMessage?: string;
  elbRegions: string[];
  elbLoadBalancers: AwsElbLoadBalancer[];
  elbTargetGroups: AwsElbTargetGroup[];
};

export type ELBViewProps = {
  workspace: ElbWorkspaceSnapshot;
  actionStatus: string;
  onRefresh: () => void;
  onSelectRegion: (region: string) => void;
  onSelectLoadBalancer: (loadBalancerArn: string) => void;
};

const fieldLabel =
  "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

const sectionCard = "space-y-4 rounded-lg border border-border bg-card p-[18px] shadow-sm";

function loadBalancerStatus(state?: string): Status {
  const normalised = state?.toLowerCase();
  if (normalised === "active") return "on";
  if (normalised === "provisioning") return "warning";
  if (normalised === "failed") return "error";
  return "off";
}

function schemeLabel(scheme?: string): string {
  if (scheme === "internet-facing") return "Internet-facing";
  if (scheme === "internal") return "Internal";
  return scheme || "—";
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export default function ELBView({
  workspace,
  actionStatus,
  onRefresh,
  onSelectRegion,
  onSelectLoadBalancer,
}: ELBViewProps) {
  const [loadBalancerFilter, setLoadBalancerFilter] = useState("");
  const [targetGroupFilter, setTargetGroupFilter] = useState("");
  const [inspectorOpen, setInspectorOpen] = useState(
    Boolean(workspace.selectedElbLoadBalancerArn),
  );
  const lastSelectedLoadBalancerRef = useRef(workspace.selectedElbLoadBalancerArn || "");

  const regions =
    workspace.elbRegions.length > 0
      ? workspace.elbRegions
      : workspace.rdsRegions.length > 0
        ? workspace.rdsRegions
        : workspace.ec2Regions;

  const selectedLoadBalancer =
    workspace.elbLoadBalancers.find(
      (loadBalancer) => loadBalancer.loadBalancerArn === workspace.selectedElbLoadBalancerArn,
    ) ?? workspace.elbLoadBalancers[0];

  const filteredLoadBalancers = useMemo(() => {
    const query = loadBalancerFilter.trim().toLowerCase();
    if (!query) {
      return workspace.elbLoadBalancers;
    }
    return workspace.elbLoadBalancers.filter((loadBalancer) =>
      [
        loadBalancer.loadBalancerName,
        loadBalancer.dnsName,
        loadBalancer.type,
        loadBalancer.scheme,
      ].some((value) => value?.toLowerCase().includes(query)),
    );
  }, [loadBalancerFilter, workspace.elbLoadBalancers]);

  const filteredTargetGroups = useMemo(() => {
    const query = targetGroupFilter.trim().toLowerCase();
    if (!query) {
      return workspace.elbTargetGroups;
    }
    return workspace.elbTargetGroups.filter((targetGroup) =>
      [
        targetGroup.targetGroupName,
        targetGroup.protocol,
        targetGroup.targetType,
        targetGroup.healthCheckPath,
      ].some((value) => value?.toLowerCase().includes(query)),
    );
  }, [targetGroupFilter, workspace.elbTargetGroups]);

  const statusMessage =
    actionStatus ||
    workspace.elbStatusMessage ||
    "Load balancer inventory is waiting for an open AWS workspace.";

  useEffect(() => {
    const nextArn = workspace.selectedElbLoadBalancerArn || "";
    if (nextArn !== lastSelectedLoadBalancerRef.current) {
      lastSelectedLoadBalancerRef.current = nextArn;
      setInspectorOpen(Boolean(nextArn));
    }
  }, [workspace.selectedElbLoadBalancerArn]);

  if (!workspace.provider || workspace.provider.providerId !== "aws") {
    return (
      <div className="p-6">
        <EmptyState
          icon={<Scale />}
          title="Load Balancers requires an AWS workspace"
          description="Open an AWS profile from Connect to list load balancers and target groups."
        />
      </div>
    );
  }

  const tableEmptyState =
    workspace.elbLoadBalancers.length === 0 ? (
      <EmptyState
        icon={<Scale />}
        title="No load balancers"
        description="No load balancers were returned for this AWS workspace."
        className="border-0"
      />
    ) : (
      <EmptyState
        icon={<Scale />}
        title="No matches"
        description="No load balancers match the current filter."
        className="border-0"
      />
    );

  const targetGroupsEmptyState = (
    <EmptyState
      icon={<Scale />}
      title="No target groups"
      description={
        selectedLoadBalancer
          ? `No target groups were returned for ${selectedLoadBalancer.loadBalancerName}.`
          : "Select a load balancer to browse target groups."
      }
      className="border-0"
    />
  );

  const inspectorContent = selectedLoadBalancer ? (
    <ResourceInspectorPanel>
      <ResourceInspectorHeader
        icon={Scale}
        eyebrow="Load balancer"
        title={selectedLoadBalancer.loadBalancerName}
        subtitle={selectedLoadBalancer.dnsName || selectedLoadBalancer.loadBalancerArn}
        onClose={() => setInspectorOpen(false)}
      />

      <DetailFieldList
        fields={[
          { label: "Name", value: selectedLoadBalancer.loadBalancerName },
          { label: "DNS name", value: selectedLoadBalancer.dnsName || "Not available" },
          { label: "Type", value: selectedLoadBalancer.type || "—" },
          {
            label: "Scheme",
            value: schemeLabel(selectedLoadBalancer.scheme),
          },
          {
            label: "State",
            value: selectedLoadBalancer.state || "Unknown",
          },
          { label: "VPC", value: selectedLoadBalancer.vpcId || "—" },
          { label: "Created", value: selectedLoadBalancer.createdTime || "—" },
        ]}
        emptyText="No load balancer details are available."
      />

      <div>
        <div className={fieldLabel}>Target group preview</div>
        <div className="mt-2 space-y-3">
          <Input
            placeholder="Filter target groups"
            value={targetGroupFilter}
            onChange={(event) => setTargetGroupFilter(event.target.value)}
          />
          <ResourceTable
            columns={[
              { id: "name", label: "Name" },
              { id: "protocol", label: "Protocol" },
              { id: "port", label: "Port" },
              { id: "targetType", label: "Target type" },
            ]}
            rows={filteredTargetGroups}
            getRowKey={(targetGroup) => targetGroup.targetGroupArn}
            renderCell={(targetGroup, columnId) => {
              if (columnId === "name") {
                return <span className="font-medium">{targetGroup.targetGroupName}</span>;
              }
              if (columnId === "protocol") {
                return targetGroup.protocol || "—";
              }
              if (columnId === "port") {
                return targetGroup.port ? String(targetGroup.port) : "—";
              }
              if (columnId === "targetType") {
                return targetGroup.targetType || "—";
              }
              return null;
            }}
            emptyState={targetGroupsEmptyState}
          />
        </div>
      </div>
    </ResourceInspectorPanel>
  ) : null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-[1.375rem] font-[750] tracking-[-0.015em]">Load Balancers</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {countLabel(workspace.elbLoadBalancers.length, "load balancer", "load balancers")} ·{" "}
          {workspace.selectedElbRegion || "no region selected"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{statusMessage}</p>
      </header>

      <section className={sectionCard}>
        <div>
          <h2 className="text-base font-bold">Load balancer inventory</h2>
          <p className="text-sm text-muted-foreground">
            Browse regional load balancers and preview target groups for the selected load balancer.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="w-56">
            <div className={cn(fieldLabel, "mb-1")}>Region</div>
            <Select
              value={workspace.selectedElbRegion ?? ""}
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
          <Button variant="outline" disabled={!workspace.selectedElbRegion} onClick={onRefresh}>
            <RefreshCw />
            Refresh inventory
          </Button>
          <div className="min-w-56 flex-1">
            <div className={cn(fieldLabel, "mb-1")}>Filter</div>
            <Input
              value={loadBalancerFilter}
              placeholder="Filter load balancers"
              onChange={(event) => setLoadBalancerFilter(event.target.value)}
            />
          </div>
          <div className="pb-2 text-xs text-muted-foreground">
            {filteredLoadBalancers.length}/{workspace.elbLoadBalancers.length} shown
          </div>
        </div>

        <ResourceInventoryShell
          table={
            <ResourceTable
              columns={[
                { id: "name", label: "Name" },
                { id: "type", label: "Type" },
                { id: "scheme", label: "Scheme" },
                { id: "state", label: "State" },
                { id: "dns", label: "DNS name", cellClassName: "font-mono text-xs" },
              ]}
              rows={filteredLoadBalancers}
              selectedKey={workspace.selectedElbLoadBalancerArn}
              getRowKey={(loadBalancer) => loadBalancer.loadBalancerArn}
              onRowClick={(loadBalancer) => {
                onSelectLoadBalancer(loadBalancer.loadBalancerArn);
                setInspectorOpen(true);
              }}
              renderCell={(loadBalancer, columnId) => {
                if (columnId === "name") {
                  return <span className="font-medium">{loadBalancer.loadBalancerName}</span>;
                }
                if (columnId === "type") {
                  return loadBalancer.type || "—";
                }
                if (columnId === "scheme") {
                  return schemeLabel(loadBalancer.scheme);
                }
                if (columnId === "state") {
                  return loadBalancer.state ? (
                    <StatusPill
                      status={loadBalancerStatus(loadBalancer.state)}
                      label={loadBalancer.state}
                    />
                  ) : (
                    "—"
                  );
                }
                if (columnId === "dns") {
                  return loadBalancer.dnsName || "—";
                }
                return null;
              }}
              emptyState={tableEmptyState}
            />
          }
          inspectorContent={inspectorContent}
          inspectorOpen={inspectorOpen}
          onInspectorOpenChange={setInspectorOpen}
          inspectorAriaLabel="Load balancer details"
        />
      </section>
    </div>
  );
}