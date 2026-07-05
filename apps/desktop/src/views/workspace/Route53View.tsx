// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useEffect, useMemo, useRef, useState } from "react";
import { Globe, RefreshCw } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/empty-state";
import {
  ResourceInspectorHeader,
  ResourceInspectorPanel,
  ResourceInventoryShell,
} from "@/components/inventory/resource-inspector";
import { ResourceTable } from "@/components/inventory/resource-table";
import { DetailFieldList } from "./detail-fields";
import type {
  AwsRoute53HostedZone,
  AwsRoute53ResourceRecordSet,
  WorkspaceSnapshot,
} from "@/types/backend";

export type Route53WorkspaceSnapshot = WorkspaceSnapshot & {
  selectedRoute53HostedZoneId?: string;
  route53StatusMessage?: string;
  route53HostedZones: AwsRoute53HostedZone[];
  route53ResourceRecordSets: AwsRoute53ResourceRecordSet[];
};

export type Route53ViewProps = {
  workspace: Route53WorkspaceSnapshot;
  actionStatus: string;
  onRefresh: () => void;
  onSelectHostedZone: (hostedZoneId: string) => void;
};

const fieldLabel =
  "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

const sectionCard = "space-y-4 rounded-lg border border-border bg-card p-[18px] shadow-sm";

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function recordPreview(record: AwsRoute53ResourceRecordSet): string {
  if (record.aliasTarget) {
    return record.aliasTarget;
  }
  if (record.values && record.values.length > 0) {
    return record.values.join(", ");
  }
  return "—";
}

export default function Route53View({
  workspace,
  actionStatus,
  onRefresh,
  onSelectHostedZone,
}: Route53ViewProps) {
  const [zoneFilter, setZoneFilter] = useState("");
  const [recordFilter, setRecordFilter] = useState("");
  const [inspectorOpen, setInspectorOpen] = useState(Boolean(workspace.selectedRoute53HostedZoneId));
  const lastSelectedZoneRef = useRef(workspace.selectedRoute53HostedZoneId || "");

  const selectedZone =
    workspace.route53HostedZones.find(
      (zone) => zone.hostedZoneId === workspace.selectedRoute53HostedZoneId,
    ) ?? workspace.route53HostedZones[0];

  const filteredZones = useMemo(() => {
    const query = zoneFilter.trim().toLowerCase();
    if (!query) {
      return workspace.route53HostedZones;
    }
    return workspace.route53HostedZones.filter((zone) =>
      [zone.name, zone.hostedZoneId, zone.comment].some((value) =>
        value?.toLowerCase().includes(query),
      ),
    );
  }, [zoneFilter, workspace.route53HostedZones]);

  const filteredRecords = useMemo(() => {
    const query = recordFilter.trim().toLowerCase();
    if (!query) {
      return workspace.route53ResourceRecordSets;
    }
    return workspace.route53ResourceRecordSets.filter((record) =>
      [record.name, record.type, recordPreview(record)].some((value) =>
        value?.toLowerCase().includes(query),
      ),
    );
  }, [recordFilter, workspace.route53ResourceRecordSets]);

  const statusMessage =
    actionStatus ||
    workspace.route53StatusMessage ||
    "Route 53 inventory is waiting for an open AWS workspace.";

  useEffect(() => {
    const nextZoneId = workspace.selectedRoute53HostedZoneId || "";
    if (nextZoneId !== lastSelectedZoneRef.current) {
      lastSelectedZoneRef.current = nextZoneId;
      setInspectorOpen(Boolean(nextZoneId));
    }
  }, [workspace.selectedRoute53HostedZoneId]);

  if (!workspace.provider || workspace.provider.providerId !== "aws") {
    return (
      <div className="p-6">
        <EmptyState
          icon={<Globe />}
          title="Route 53 requires an AWS workspace"
          description="Open an AWS profile from Connect to list hosted zones and record previews."
        />
      </div>
    );
  }

  const tableEmptyState =
    workspace.route53HostedZones.length === 0 ? (
      <EmptyState
        icon={<Globe />}
        title="No hosted zones"
        description="No Route 53 hosted zones were returned for this AWS workspace."
        className="border-0"
      />
    ) : (
      <EmptyState
        icon={<Globe />}
        title="No matches"
        description="No hosted zones match the current filter."
        className="border-0"
      />
    );

  const recordsEmptyState = (
    <EmptyState
      icon={<Globe />}
      title="No records"
      description={
        selectedZone
          ? `No record previews were returned for ${selectedZone.name}.`
          : "Select a hosted zone to preview DNS records."
      }
      className="border-0"
    />
  );

  const inspectorContent = selectedZone ? (
    <ResourceInspectorPanel>
      <ResourceInspectorHeader
        icon={Globe}
        eyebrow="Hosted zone"
        title={selectedZone.name}
        subtitle={selectedZone.hostedZoneId}
        onClose={() => setInspectorOpen(false)}
      />

      <DetailFieldList
        fields={[
          { label: "Zone", value: selectedZone.name },
          { label: "Zone ID", value: selectedZone.hostedZoneId },
          {
            label: "Visibility",
            value: selectedZone.privateZone ? "Private" : "Public",
          },
          { label: "Record count", value: String(selectedZone.recordCount ?? 0) },
          { label: "Comment", value: selectedZone.comment || "No comment" },
        ]}
        emptyText="No hosted zone details are available."
      />

      <div>
        <div className={fieldLabel}>Record preview</div>
        <div className="mt-2 space-y-3">
          <Input
            placeholder="Filter records"
            value={recordFilter}
            onChange={(event) => setRecordFilter(event.target.value)}
          />
          <ResourceTable
            columns={[
              { id: "name", label: "Name" },
              { id: "type", label: "Type" },
              { id: "ttl", label: "TTL" },
              { id: "value", label: "Value", cellClassName: "max-w-md truncate font-mono text-xs" },
            ]}
            rows={filteredRecords}
            getRowKey={(record) =>
              `${record.name}:${record.type ?? ""}:${record.setIdentifier ?? ""}`
            }
            renderCell={(record, columnId) => {
              if (columnId === "name") {
                return <span className="font-medium">{record.name}</span>;
              }
              if (columnId === "type") {
                return record.type || "—";
              }
              if (columnId === "ttl") {
                return record.ttl ? String(record.ttl) : "—";
              }
              if (columnId === "value") {
                return recordPreview(record);
              }
              return null;
            }}
            emptyState={recordsEmptyState}
          />
        </div>
      </div>
    </ResourceInspectorPanel>
  ) : null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-[1.375rem] font-[750] tracking-[-0.015em]">Route 53</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {countLabel(workspace.route53HostedZones.length, "hosted zone", "hosted zones")} · Global
          DNS
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{statusMessage}</p>
      </header>

      <section className={sectionCard}>
        <div>
          <h2 className="text-base font-bold">Hosted zone inventory</h2>
          <p className="text-sm text-muted-foreground">
            Browse account-wide hosted zones and preview DNS records for the selected zone.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <Button variant="outline" onClick={onRefresh}>
            <RefreshCw />
            Refresh inventory
          </Button>
          <div className="min-w-56 flex-1">
            <div className={cn(fieldLabel, "mb-1")}>Filter</div>
            <Input
              value={zoneFilter}
              placeholder="Filter hosted zones"
              onChange={(event) => setZoneFilter(event.target.value)}
            />
          </div>
          <div className="pb-2 text-xs text-muted-foreground">
            {filteredZones.length}/{workspace.route53HostedZones.length} shown
          </div>
        </div>

        <ResourceInventoryShell
          table={
            <ResourceTable
              columns={[
                { id: "name", label: "Zone" },
                { id: "records", label: "Records" },
                { id: "visibility", label: "Visibility" },
                { id: "zoneId", label: "Zone ID", cellClassName: "font-mono text-xs" },
              ]}
              rows={filteredZones}
              selectedKey={workspace.selectedRoute53HostedZoneId}
              getRowKey={(zone) => zone.hostedZoneId}
              onRowClick={(zone) => {
                onSelectHostedZone(zone.hostedZoneId);
                setInspectorOpen(true);
              }}
              renderCell={(zone, columnId) => {
                if (columnId === "name") {
                  return <span className="font-medium">{zone.name}</span>;
                }
                if (columnId === "records") {
                  return String(zone.recordCount ?? 0);
                }
                if (columnId === "visibility") {
                  return zone.privateZone ? "Private" : "Public";
                }
                if (columnId === "zoneId") {
                  return zone.hostedZoneId;
                }
                return null;
              }}
              emptyState={tableEmptyState}
            />
          }
          inspectorContent={inspectorContent}
          inspectorOpen={inspectorOpen}
          onInspectorOpenChange={setInspectorOpen}
          inspectorAriaLabel="Route 53 hosted zone details"
        />
      </section>
    </div>
  );
}