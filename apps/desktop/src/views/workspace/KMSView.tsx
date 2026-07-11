// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useEffect, useMemo, useRef, useState } from "react";
import { KeyRound, RefreshCw } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatTimestamp } from "@/lib/format";
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
import type { AwsKmsAlias, AwsKmsKey, WorkspaceSnapshot } from "@/types/backend";

export type KmsWorkspaceSnapshot = WorkspaceSnapshot & {
  selectedKmsRegion?: string;
  selectedKmsKeyId?: string;
  kmsStatusMessage?: string;
  kmsRegions: string[];
  kmsKeys: AwsKmsKey[];
  kmsAliases: AwsKmsAlias[];
};

export type KMSViewProps = {
  workspace: KmsWorkspaceSnapshot;
  actionStatus: string;
  onRefresh: () => void;
  onSelectRegion: (region: string) => void;
  onSelectKey: (keyId: string) => void;
};

const fieldLabel =
  "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

const sectionCard = "space-y-4 rounded-lg border border-border bg-card p-[18px] shadow-sm";

function keyStatus(state?: string): Status {
  const normalised = state?.toLowerCase();
  if (normalised === "enabled") return "on";
  if (normalised === "pendingdeletion" || normalised === "pendingimport") return "warning";
  if (normalised === "disabled") return "off";
  if (normalised === "unavailable" || normalised === "failed") return "error";
  return "off";
}

function keyUsageLabel(usage?: string): string {
  if (usage === "ENCRYPT_DECRYPT") return "Encrypt and decrypt";
  if (usage === "SIGN_VERIFY") return "Sign and verify";
  return usage || "—";
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function formatBoolean(value: boolean | undefined): string {
  if (value === undefined) {
    return "—";
  }
  return value ? "Yes" : "No";
}

export default function KMSView({
  workspace,
  actionStatus,
  onRefresh,
  onSelectRegion,
  onSelectKey,
}: KMSViewProps) {
  const [keyFilter, setKeyFilter] = useState("");
  const [aliasFilter, setAliasFilter] = useState("");
  const [inspectorOpen, setInspectorOpen] = useState(Boolean(workspace.selectedKmsKeyId));
  const lastSelectedKeyRef = useRef(workspace.selectedKmsKeyId || "");

  const regions =
    workspace.kmsRegions.length > 0
      ? workspace.kmsRegions
      : workspace.elbRegions.length > 0
        ? workspace.elbRegions
        : workspace.rdsRegions.length > 0
          ? workspace.rdsRegions
          : workspace.ec2Regions;

  const selectedKey =
    workspace.kmsKeys.find((key) => key.keyId === workspace.selectedKmsKeyId) ??
    workspace.kmsKeys[0];

  const filteredKeys = useMemo(() => {
    const query = keyFilter.trim().toLowerCase();
    if (!query) {
      return workspace.kmsKeys;
    }
    return workspace.kmsKeys.filter((key) =>
      [key.keyId, key.arn, key.description, key.keyState, key.keyUsage].some((value) =>
        value?.toLowerCase().includes(query),
      ),
    );
  }, [keyFilter, workspace.kmsKeys]);

  const selectedKeyAliases = useMemo(() => {
    if (!selectedKey) {
      return [];
    }
    return workspace.kmsAliases.filter((alias) => alias.targetKeyId === selectedKey.keyId);
  }, [selectedKey, workspace.kmsAliases]);

  const filteredAliases = useMemo(() => {
    const query = aliasFilter.trim().toLowerCase();
    if (!query) {
      return selectedKeyAliases;
    }
    return selectedKeyAliases.filter((alias) =>
      [alias.aliasName, alias.aliasArn, alias.targetKeyId].some((value) =>
        value?.toLowerCase().includes(query),
      ),
    );
  }, [aliasFilter, selectedKeyAliases]);

  const statusMessage =
    actionStatus ||
    workspace.kmsStatusMessage ||
    "KMS inventory is waiting for an open AWS workspace.";

  useEffect(() => {
    const nextKeyId = workspace.selectedKmsKeyId || "";
    if (nextKeyId !== lastSelectedKeyRef.current) {
      lastSelectedKeyRef.current = nextKeyId;
      setInspectorOpen(Boolean(nextKeyId));
    }
  }, [workspace.selectedKmsKeyId]);

  if (!workspace.provider || workspace.provider.providerId !== "aws") {
    return (
      <div className="p-6">
        <EmptyState
          icon={<KeyRound />}
          title="KMS requires an AWS workspace"
          description="Open an AWS profile from Connect to list encryption keys and aliases."
        />
      </div>
    );
  }

  const tableEmptyState =
    workspace.kmsKeys.length === 0 ? (
      <EmptyState
        icon={<KeyRound />}
        title="No KMS keys"
        description="No KMS keys were returned for this AWS workspace."
        className="border-0"
      />
    ) : (
      <EmptyState
        icon={<KeyRound />}
        title="No matches"
        description="No KMS keys match the current filter."
        className="border-0"
      />
    );

  const aliasesEmptyState = (
    <EmptyState
      icon={<KeyRound />}
      title="No aliases"
      description={
        selectedKey
          ? `No aliases were returned for ${selectedKey.keyId}.`
          : "Select a key to browse aliases."
      }
      className="border-0"
    />
  );

  const inspectorContent = selectedKey ? (
    <ResourceInspectorPanel>
      <ResourceInspectorHeader
        icon={KeyRound}
        eyebrow="KMS key"
        title={selectedKey.description || selectedKey.keyId}
        subtitle={selectedKey.arn || selectedKey.keyId}
        onClose={() => setInspectorOpen(false)}
      />

      <DetailFieldList
        fields={[
          { label: "Key ID", value: selectedKey.keyId },
          { label: "ARN", value: selectedKey.arn || "Not available" },
          { label: "Description", value: selectedKey.description || "—" },
          { label: "Usage", value: keyUsageLabel(selectedKey.keyUsage) },
          {
            label: "State",
            value: selectedKey.keyState || "Unknown",
          },
          { label: "Spec", value: selectedKey.keySpec || "—" },
          { label: "Origin", value: selectedKey.origin || "—" },
          { label: "Enabled", value: formatBoolean(selectedKey.enabled) },
          { label: "Multi-region", value: formatBoolean(selectedKey.multiRegion) },
          {
            label: "Created",
            value: selectedKey.creationDate ? formatTimestamp(selectedKey.creationDate) : "Unknown",
            title: selectedKey.creationDate,
          },
          {
            label: "Scheduled deletion",
            value: selectedKey.deletionDate ? formatTimestamp(selectedKey.deletionDate) : "Unknown",
            title: selectedKey.deletionDate,
          },
        ]}
        emptyText="No key metadata is available."
      />

      <div>
        <div className={fieldLabel}>Alias preview</div>
        <div className="mt-2 space-y-3">
          <Input
            placeholder="Filter aliases"
            value={aliasFilter}
            onChange={(event) => setAliasFilter(event.target.value)}
          />
          <ResourceTable
            columns={[
              { id: "name", label: "Alias" },
              { id: "target", label: "Target key", cellClassName: "font-mono text-xs" },
            ]}
            rows={filteredAliases}
            getRowKey={(alias) => alias.aliasArn || alias.aliasName}
            renderCell={(alias, columnId) => {
              if (columnId === "name") {
                return <span className="font-medium">{alias.aliasName}</span>;
              }
              if (columnId === "target") {
                return alias.targetKeyId || "—";
              }
              return null;
            }}
            emptyState={aliasesEmptyState}
          />
        </div>
      </div>
    </ResourceInspectorPanel>
  ) : null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-[1.375rem] font-[750] tracking-[-0.015em]">KMS</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {countLabel(workspace.kmsKeys.length, "key", "keys")} ·{" "}
          {workspace.selectedKmsRegion || "no region selected"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{statusMessage}</p>
      </header>

      <section className={sectionCard}>
        <div>
          <h2 className="text-base font-bold">Key inventory</h2>
          <p className="text-sm text-muted-foreground">
            Browse regional KMS keys and preview aliases and metadata for the selected key.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="w-56">
            <div className={cn(fieldLabel, "mb-1")}>Region</div>
            <Select
              value={workspace.selectedKmsRegion ?? ""}
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
          <Button variant="outline" disabled={!workspace.selectedKmsRegion} onClick={onRefresh}>
            <RefreshCw />
            Refresh inventory
          </Button>
          <div className="min-w-56 flex-1">
            <div className={cn(fieldLabel, "mb-1")}>Filter</div>
            <Input
              value={keyFilter}
              placeholder="Filter KMS keys"
              onChange={(event) => setKeyFilter(event.target.value)}
            />
          </div>
          <div className="pb-2 text-xs text-muted-foreground">
            {filteredKeys.length}/{workspace.kmsKeys.length} shown
          </div>
        </div>

        <ResourceInventoryShell
          table={
            <ResourceTable
              columns={[
                { id: "keyId", label: "Key ID", cellClassName: "font-mono text-xs" },
                { id: "usage", label: "Usage" },
                { id: "state", label: "State" },
                { id: "description", label: "Description" },
              ]}
              rows={filteredKeys}
              selectedKey={workspace.selectedKmsKeyId}
              getRowKey={(key) => key.keyId}
              onRowClick={(key) => {
                onSelectKey(key.keyId);
                setInspectorOpen(true);
              }}
              renderCell={(key, columnId) => {
                if (columnId === "keyId") {
                  return <span className="font-medium">{key.keyId}</span>;
                }
                if (columnId === "usage") {
                  return keyUsageLabel(key.keyUsage);
                }
                if (columnId === "state") {
                  return key.keyState ? (
                    <StatusPill status={keyStatus(key.keyState)} label={key.keyState} />
                  ) : (
                    "—"
                  );
                }
                if (columnId === "description") {
                  return key.description || "—";
                }
                return null;
              }}
              emptyState={tableEmptyState}
            />
          }
          inspectorContent={inspectorContent}
          inspectorOpen={inspectorOpen}
          onInspectorOpenChange={setInspectorOpen}
          inspectorAriaLabel="KMS key details"
        />
      </section>
    </div>
  );
}
