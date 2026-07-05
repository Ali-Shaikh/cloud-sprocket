// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, RefreshCw, ScrollText } from "lucide-react";

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
import {
  ResourceInspectorHeader,
  ResourceInspectorPanel,
  ResourceInventoryShell,
} from "@/components/inventory/resource-inspector";
import { ResourceTable } from "@/components/inventory/resource-table";
import { DetailFieldList } from "./detail-fields";
import type { WorkspaceSnapshot } from "@/types/backend";

export interface AwsLogGroup {
  logGroupName: string;
  arn?: string;
  storedBytes?: number;
  retentionInDays?: number;
  creationTime?: number;
  recentEvents?: string[];
}

export type LogsWorkspaceSnapshot = WorkspaceSnapshot & {
  selectedLogsRegion?: string;
  selectedLogGroupName?: string;
  logsStatusMessage?: string;
  logsRegions: string[];
  logGroups: AwsLogGroup[];
};

export type LogsViewProps = {
  workspace: LogsWorkspaceSnapshot;
  actionStatus: string;
  onRefresh: () => void;
  onSelectRegion: (region: string) => void;
  onSelectEntity: (logGroupName: string) => void;
  onCreateLogGroup?: (logGroupName: string) => void;
  onPutLogEvents?: (logGroupName: string, message: string) => void;
};

const fieldLabel =
  "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

const sectionCard = "space-y-4 rounded-lg border border-border bg-card p-[18px] shadow-sm";

const snippetCard = "rounded-lg border border-border bg-muted/40 p-3";

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) {
    return "Unknown";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatCreationTime(epochMillis?: number): string {
  if (!epochMillis || epochMillis <= 0) {
    return "Unknown";
  }
  return new Date(epochMillis).toISOString();
}

function copyToClipboard(value: string, label = "Copied to clipboard"): void {
  if (navigator.clipboard) {
    void navigator.clipboard.writeText(value).then(() => {
      notify("success", label);
    });
  }
}

/**
 * v0.6 CloudWatch Logs panel: regional log group inventory and recent event tail.
 */
export default function LogsView({
  workspace,
  actionStatus,
  onRefresh,
  onSelectRegion,
  onSelectEntity,
  onCreateLogGroup,
  onPutLogEvents,
}: LogsViewProps) {
  const [filterText, setFilterText] = useState("");
  const [inspectorOpen, setInspectorOpen] = useState(Boolean(workspace.selectedLogGroupName));
  const lastSelectedLogGroupRef = useRef(workspace.selectedLogGroupName || "");
  const [newLogGroupName, setNewLogGroupName] = useState("/aws/test/group");
  const createCapability = actionCapabilityState(workspace, "logs", "createLogGroup");
  const putCapability = actionCapabilityState(workspace, "logs", "putLogEvents");

  const regions =
    workspace.logsRegions.length > 0
      ? workspace.logsRegions
      : workspace.dynamodbRegions.length > 0
        ? workspace.dynamodbRegions
        : workspace.lambdaRegions.length > 0
          ? workspace.lambdaRegions
          : workspace.ec2Regions;

  const selectedLogGroup = workspace.logGroups.find(
    (group) => group.logGroupName === workspace.selectedLogGroupName,
  );

  const filteredLogGroups = useMemo(() => {
    const query = filterText.trim().toLowerCase();
    if (!query) {
      return workspace.logGroups;
    }
    return workspace.logGroups.filter((group) =>
      [group.logGroupName, group.arn].some((value) => value?.toLowerCase().includes(query)),
    );
  }, [filterText, workspace.logGroups]);

  const statusMessage =
    actionStatus ||
    workspace.logsStatusMessage ||
    "CloudWatch Logs inventory is waiting for an open AWS workspace.";

  const copySnippets = selectedLogGroup
    ? [
        { label: "Log group name", value: selectedLogGroup.logGroupName },
        {
          label: "AWS CLI tail command",
          value: `aws logs tail ${selectedLogGroup.logGroupName} --since 1h${
            workspace.selectedLogsRegion ? ` --region ${workspace.selectedLogsRegion}` : ""
          }`,
        },
        {
          label: "Log group detail JSON",
          value: JSON.stringify(
            {
              region: workspace.selectedLogsRegion,
              logGroup: selectedLogGroup,
            },
            null,
            2,
          ),
        },
      ]
    : [];

  useEffect(() => {
    const nextLogGroupName = workspace.selectedLogGroupName || "";
    if (nextLogGroupName !== lastSelectedLogGroupRef.current) {
      lastSelectedLogGroupRef.current = nextLogGroupName;
      setInspectorOpen(Boolean(nextLogGroupName));
    }
  }, [workspace.selectedLogGroupName]);

  if (workspace.provider?.providerId && workspace.provider.providerId !== "aws") {
    return (
      <div className="p-6">
        <EmptyState
          icon={<ScrollText />}
          title="CloudWatch Logs requires an AWS workspace"
          description="Open an AWS profile from Connect to list log groups and tail recent events (works on LocalStack and real AWS)."
        />
      </div>
    );
  }

  const tableEmptyState =
    workspace.logGroups.length === 0 ? (
      <EmptyState
        icon={<ScrollText />}
        title="No log groups"
        description={
          workspace.selectedLogsRegion
            ? `No log groups were returned for ${workspace.selectedLogsRegion}.`
            : "Select a region to list CloudWatch log groups."
        }
        className="border-0"
      />
    ) : (
      <EmptyState
        icon={<ScrollText />}
        title="No matches"
        description="No log groups match the current filter."
        className="border-0"
      />
    );

  const inspectorContent = selectedLogGroup ? (
    <ResourceInspectorPanel>
      <ResourceInspectorHeader
        icon={ScrollText}
        eyebrow="Log group"
        title={selectedLogGroup.logGroupName}
        onClose={() => setInspectorOpen(false)}
      />

      <DetailFieldList
        fields={[
          { label: "ARN", value: selectedLogGroup.arn || "Unknown" },
          { label: "Stored bytes", value: formatBytes(selectedLogGroup.storedBytes) },
          {
            label: "Retention",
            value:
              selectedLogGroup.retentionInDays != null
                ? `${selectedLogGroup.retentionInDays} days`
                : "Never expire",
          },
          {
            label: "Created",
            value: formatCreationTime(selectedLogGroup.creationTime),
          },
        ]}
        emptyText="No log group details are available."
      />

      {selectedLogGroup.recentEvents && selectedLogGroup.recentEvents.length > 0 ? (
        <div>
          <div className={fieldLabel}>Recent events (read-only tail)</div>
          <div
            className={cn(
              snippetCard,
              "mt-2 max-h-48 overflow-auto whitespace-pre-wrap font-mono text-[11px]",
            )}
          >
            {selectedLogGroup.recentEvents.join("\n")}
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="mt-2 h-7 px-2 text-[10px]"
            onClick={() => {
              copyToClipboard(
                selectedLogGroup.recentEvents?.join("\n") ?? "",
                "Recent events copied",
              );
            }}
          >
            <Copy className="mr-1 h-3 w-3" />
            Copy events
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No recent log events were returned for this log group.
        </p>
      )}

      <div>
        <div className={fieldLabel}>Copy actions</div>
        {copySnippets.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Select a log group to generate copy actions.
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
      </div>
    </ResourceInspectorPanel>
  ) : null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-[1.375rem] font-[750] tracking-[-0.015em]">CloudWatch Logs</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {countLabel(workspace.logGroups.length, "log group", "log groups")} ·{" "}
          {workspace.selectedLogsRegion || "no region selected"}
        </p>
      </header>

      <section className={sectionCard}>
        <div>
          <h2 className="text-base font-bold">Log Group Fleet</h2>
          <p className="text-sm text-muted-foreground">
            Regional log group inventory with retention, size, and a bounded recent event tail.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
            <div className={fieldLabel}>Selected Region</div>
            <p className="truncate text-sm">
              {workspace.selectedLogsRegion || "No region selected"}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
            <div className={fieldLabel}>Selected Log Group</div>
            <p className="truncate text-sm font-mono">
              {selectedLogGroup?.logGroupName || "No log group selected"}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
            <div className={fieldLabel}>Log Groups</div>
            <p className="truncate text-sm">
              {countLabel(workspace.logGroups.length, "log group", "log groups")}
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
          <h2 className="text-base font-bold">Log Group Inventory</h2>
          <p className="text-sm text-muted-foreground">
            Select a region, filter log groups, then choose one for metadata and recent events.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="w-56">
            <div className={cn(fieldLabel, "mb-1")}>Region</div>
            <Select
              value={workspace.selectedLogsRegion ?? ""}
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
            disabled={!workspace.selectedLogsRegion}
            onClick={onRefresh}
          >
            <RefreshCw />
            Refresh log groups
          </Button>
          {onCreateLogGroup ? (
            <Button
              variant="outline"
              disabled={!createCapability.enabled}
              title={createCapability.enabled ? undefined : createCapability.reason}
              onClick={() => onCreateLogGroup(newLogGroupName.trim() || "/aws/test/group")}
            >
              Create log group
            </Button>
          ) : null}
          {onPutLogEvents && selectedLogGroup ? (
            <Button
              variant="outline"
              disabled={!putCapability.enabled}
              title={putCapability.enabled ? undefined : putCapability.reason}
              onClick={() =>
                onPutLogEvents(
                  selectedLogGroup.logGroupName,
                  `CloudSprocket test event at ${new Date().toISOString()}`,
                )
              }
            >
              Inject test event
            </Button>
          ) : null}
          <div className="min-w-56 flex-1">
            <div className={cn(fieldLabel, "mb-1")}>Filter</div>
            <Input
              value={filterText}
              placeholder="Filter log groups"
              onChange={(event) => {
                setFilterText(event.target.value);
              }}
            />
          </div>
          <div className="pb-2 text-xs text-muted-foreground">
            {filteredLogGroups.length}/{workspace.logGroups.length} shown
          </div>
        </div>

        <ResourceInventoryShell
          table={
            <ResourceTable
              columns={[
                { id: "name", label: "Name" },
                { id: "stored", label: "Stored" },
                { id: "retention", label: "Retention" },
              ]}
              rows={filteredLogGroups}
              selectedKey={workspace.selectedLogGroupName}
              getRowKey={(group) => group.logGroupName}
              onRowClick={(group) => {
                onSelectEntity(group.logGroupName);
                setInspectorOpen(true);
              }}
              renderCell={(group, columnId) => {
                if (columnId === "name") {
                  return <span className="font-mono text-sm">{group.logGroupName}</span>;
                }
                if (columnId === "stored") {
                  return formatBytes(group.storedBytes);
                }
                if (columnId === "retention") {
                  return group.retentionInDays != null
                    ? `${group.retentionInDays} days`
                    : "Never expire";
                }
                return null;
              }}
              emptyState={tableEmptyState}
            />
          }
          inspectorContent={inspectorContent}
          inspectorOpen={inspectorOpen}
          onInspectorOpenChange={setInspectorOpen}
          inspectorAriaLabel="CloudWatch log group details"
        />
      </section>
    </div>
  );
}