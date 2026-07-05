// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, Database, RefreshCw } from "lucide-react";

import { cn } from "@/lib/utils";
import { notify } from "@/lib/notify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EmptyState } from "@/components/empty-state";
import {
  ResourceInspectorHeader,
  ResourceInspectorPanel,
  ResourceInventoryShell,
} from "@/components/inventory/resource-inspector";
import { ResourceTable } from "@/components/inventory/resource-table";
import { StatusPill } from "@/components/status-pill";
import type { Status } from "@/components/status-dot";
import { actionCapabilityState, actionDisabledReason } from "@/lib/action-capabilities";
import { DetailFieldList } from "./detail-fields";
import type { WorkspaceSnapshot } from "@/types/backend";

export type DynamoDBViewProps = {
  workspace: WorkspaceSnapshot;
  actionStatus: string;
  onRefresh: () => void;
  onSelectRegion: (region: string) => void;
  onSelectTable: (tableName: string) => void;
  onPutItem: (tableName: string, itemJson: string) => void;
  onDeleteItem: (tableName: string, keyJson: string) => void;
};

const fieldLabel =
  "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

const sectionCard = "space-y-4 rounded-lg border border-border bg-card p-[18px] shadow-sm";

const snippetCard = "rounded-lg border border-border bg-muted/40 p-3";

function tableStatus(status?: string): Status {
  const normalised = status?.toLowerCase();
  if (normalised === "active") {
    return "on";
  }
  if (normalised === "creating" || normalised === "updating") {
    return "warning";
  }
  if (normalised === "deleting") {
    return "error";
  }
  return "off";
}

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
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function copyToClipboard(value: string, label = "Copied to clipboard"): void {
  if (navigator.clipboard) {
    void navigator.clipboard.writeText(value).then(() => {
      notify("success", label);
    });
  }
}

/**
 * DynamoDB panel: regional table inventory, describe keys/GSIs, sample scan,
 * and write-gated put/delete on local endpoints.
 */
export default function DynamoDBView({
  workspace,
  actionStatus,
  onRefresh,
  onSelectRegion,
  onSelectTable,
  onPutItem,
  onDeleteItem,
}: DynamoDBViewProps) {
  const [filterText, setFilterText] = useState("");
  const [putDialogOpen, setPutDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemJson, setItemJson] = useState('{\n  "id": "item-001",\n  "payload": "hello"\n}');
  const [keyJson, setKeyJson] = useState('{\n  "id": "item-001"\n}');
  const [inspectorOpen, setInspectorOpen] = useState(Boolean(workspace.selectedDynamodbTableName));
  const lastSelectedTableRef = useRef(workspace.selectedDynamodbTableName || "");

  const regions =
    workspace.dynamodbRegions.length > 0
      ? workspace.dynamodbRegions
      : workspace.lambdaRegions.length > 0
        ? workspace.lambdaRegions
        : workspace.ec2Regions;

  const selectedTable = workspace.dynamodbTables.find(
    (table) => table.tableName === workspace.selectedDynamodbTableName,
  );

  const filteredTables = useMemo(() => {
    const query = filterText.trim().toLowerCase();
    if (!query) {
      return workspace.dynamodbTables;
    }
    return workspace.dynamodbTables.filter((table) =>
      [table.tableName, table.status, table.hashKey, table.rangeKey, table.billingMode]
        .some((value) => value?.toLowerCase().includes(query)),
    );
  }, [filterText, workspace.dynamodbTables]);

  const putCapability = actionCapabilityState(workspace, "dynamodb", "putItem");
  const deleteCapability = actionCapabilityState(workspace, "dynamodb", "deleteItem");
  const canPutItem = putCapability.enabled && Boolean(selectedTable?.tableName);
  const canDeleteItem = deleteCapability.enabled && Boolean(selectedTable?.tableName);
  const putDisabledReason = canPutItem
    ? undefined
    : actionDisabledReason(
        workspace,
        "dynamodb",
        "putItem",
        !selectedTable?.tableName ? "Select a table first." : undefined,
      );
  const deleteDisabledReason = canDeleteItem
    ? undefined
    : actionDisabledReason(
        workspace,
        "dynamodb",
        "deleteItem",
        !selectedTable?.tableName ? "Select a table first." : undefined,
      );

  const statusMessage =
    actionStatus ||
    workspace.dynamodbStatusMessage ||
    "DynamoDB inventory is waiting for an open AWS workspace.";

  const copySnippets = selectedTable
    ? [
        { label: "Table name", value: selectedTable.tableName },
        {
          label: "AWS CLI describe command",
          value: `aws dynamodb describe-table --table-name ${selectedTable.tableName}${
            workspace.selectedDynamodbRegion ? ` --region ${workspace.selectedDynamodbRegion}` : ""
          }`,
        },
        {
          label: "Table detail JSON",
          value: JSON.stringify(
            {
              region: workspace.selectedDynamodbRegion,
              table: selectedTable,
            },
            null,
            2,
          ),
        },
      ]
    : [];

  useEffect(() => {
    const nextTableName = workspace.selectedDynamodbTableName || "";
    if (nextTableName !== lastSelectedTableRef.current) {
      lastSelectedTableRef.current = nextTableName;
      setInspectorOpen(Boolean(nextTableName));
    }
  }, [workspace.selectedDynamodbTableName]);

  if (workspace.provider?.providerId && workspace.provider.providerId !== "aws") {
    return (
      <div className="p-6">
        <EmptyState
          icon={<Database />}
          title="DynamoDB requires an AWS workspace"
          description="Open an AWS profile from Connect to list tables and preview items (works on LocalStack and real AWS)."
        />
      </div>
    );
  }

  const tableEmptyState =
    workspace.dynamodbTables.length === 0 ? (
      <EmptyState
        icon={<Database />}
        title="No tables"
        description={
          workspace.selectedDynamodbRegion
            ? `No DynamoDB tables were returned for ${workspace.selectedDynamodbRegion}.`
            : "Select a region to list DynamoDB tables."
        }
        className="border-0"
      />
    ) : (
      <EmptyState
        icon={<Database />}
        title="No matches"
        description="No DynamoDB tables match the current filter."
        className="border-0"
      />
    );

  const inspectorContent = selectedTable ? (
    <ResourceInspectorPanel>
      <ResourceInspectorHeader
        icon={Database}
        eyebrow="Table"
        title={selectedTable.tableName}
        onClose={() => setInspectorOpen(false)}
      />

      <DetailFieldList
        fields={[
          { label: "Status", value: selectedTable.status || "Unknown" },
          { label: "Billing mode", value: selectedTable.billingMode || "Unknown" },
          { label: "Item count", value: String(selectedTable.itemCount ?? "Unknown") },
          { label: "Table size", value: formatBytes(selectedTable.tableSizeBytes) },
          { label: "Hash key", value: selectedTable.hashKey || "Unknown" },
          { label: "Range key", value: selectedTable.rangeKey || "None" },
        ]}
        emptyText="No table details are available."
      />

      {selectedTable.globalSecondaryIndexes &&
      selectedTable.globalSecondaryIndexes.length > 0 ? (
        <div>
          <div className={fieldLabel}>Global secondary indexes</div>
          <div className="space-y-2">
            {selectedTable.globalSecondaryIndexes.map((gsi) => (
              <div key={gsi.indexName} className={snippetCard}>
                <div className="text-sm font-semibold">{gsi.indexName}</div>
                <div className="text-xs text-muted-foreground">
                  {gsi.hashKey}
                  {gsi.rangeKey ? ` · ${gsi.rangeKey}` : ""}
                  {gsi.status ? ` · ${gsi.status}` : ""}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No global secondary indexes.</p>
      )}

      {selectedTable.sampleItems && selectedTable.sampleItems.length > 0 ? (
        <div>
          <div className={fieldLabel}>Sample items (read-only scan)</div>
          <div className="space-y-2">
            {selectedTable.sampleItems.map((item, index) => (
              <div key={`${selectedTable.tableName}-item-${index}`} className={snippetCard}>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">Item {index + 1}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-1 text-[10px]"
                    onClick={() => {
                      copyToClipboard(item, "Item copied");
                    }}
                  >
                    <Copy className="mr-1 h-3 w-3" />
                    Copy
                  </Button>
                </div>
                <pre className="max-h-32 overflow-auto whitespace-pre-wrap font-mono text-[10px]">
                  {item}
                </pre>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No sample items were returned for this table.
        </p>
      )}

      <div>
        <div className={fieldLabel}>Write actions</div>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!canPutItem}
            title={putDisabledReason}
            onClick={() => {
              setPutDialogOpen(true);
            }}
          >
            Put item
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!canDeleteItem}
            title={deleteDisabledReason}
            onClick={() => {
              setDeleteDialogOpen(true);
            }}
          >
            Delete item
          </Button>
        </div>
        {putDisabledReason || deleteDisabledReason ? (
          <p className="mt-2 text-xs text-muted-foreground">
            {putDisabledReason || deleteDisabledReason}
          </p>
        ) : null}
      </div>

      <div>
        <div className={fieldLabel}>Copy actions</div>
        {copySnippets.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Select a table to generate copy actions.
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
        <h1 className="text-[1.375rem] font-[750] tracking-[-0.015em]">DynamoDB</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {countLabel(workspace.dynamodbTables.length, "table", "tables")} ·{" "}
          {workspace.selectedDynamodbRegion || "no region selected"}
        </p>
      </header>

      <section className={sectionCard}>
        <div>
          <h2 className="text-base font-bold">Table Fleet</h2>
          <p className="text-sm text-muted-foreground">
            Regional table inventory with key schema, GSIs, and a read-only sample scan.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
            <div className={fieldLabel}>Selected Region</div>
            <p className="truncate text-sm">
              {workspace.selectedDynamodbRegion || "No region selected"}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
            <div className={fieldLabel}>Selected Table</div>
            <p className="truncate text-sm font-mono">
              {selectedTable?.tableName || "No table selected"}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
            <div className={fieldLabel}>Tables</div>
            <p className="truncate text-sm">
              {countLabel(workspace.dynamodbTables.length, "table", "tables")}
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
          <h2 className="text-base font-bold">Table Inventory</h2>
          <p className="text-sm text-muted-foreground">
            Select a region, filter tables, then choose one for schema details and sample items.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="w-56">
            <div className={cn(fieldLabel, "mb-1")}>Region</div>
            <Select
              value={workspace.selectedDynamodbRegion ?? ""}
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
            disabled={!workspace.selectedDynamodbRegion}
            onClick={onRefresh}
          >
            <RefreshCw />
            Refresh tables
          </Button>
          <div className="min-w-56 flex-1">
            <div className={cn(fieldLabel, "mb-1")}>Filter</div>
            <Input
              value={filterText}
              placeholder="Filter tables"
              onChange={(event) => {
                setFilterText(event.target.value);
              }}
            />
          </div>
          <div className="pb-2 text-xs text-muted-foreground">
            {filteredTables.length}/{workspace.dynamodbTables.length} shown
          </div>
        </div>

        <ResourceInventoryShell
          table={
            <ResourceTable
              columns={[
                { id: "name", label: "Name" },
                { id: "status", label: "Status" },
                { id: "items", label: "Items" },
                { id: "hashKey", label: "Hash key" },
                { id: "rangeKey", label: "Range key" },
              ]}
              rows={filteredTables}
              selectedKey={workspace.selectedDynamodbTableName}
              getRowKey={(table) => table.tableName}
              onRowClick={(table) => {
                onSelectTable(table.tableName);
                setInspectorOpen(true);
              }}
              renderCell={(table, columnId) => {
                if (columnId === "name") {
                  return <span className="font-mono text-sm">{table.tableName}</span>;
                }
                if (columnId === "status") {
                  return (
                    <StatusPill
                      status={tableStatus(table.status)}
                      label={table.status || "Unknown"}
                    />
                  );
                }
                if (columnId === "items") {
                  return table.itemCount ?? "Unknown";
                }
                if (columnId === "hashKey") {
                  return table.hashKey || "Unknown";
                }
                if (columnId === "rangeKey") {
                  return table.rangeKey || "None";
                }
                return null;
              }}
              emptyState={tableEmptyState}
            />
          }
          inspectorContent={inspectorContent}
          inspectorOpen={inspectorOpen}
          onInspectorOpenChange={setInspectorOpen}
          inspectorAriaLabel="DynamoDB table details"
        />
      </section>

      <AlertDialog open={putDialogOpen} onOpenChange={setPutDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Put item?</AlertDialogTitle>
            <AlertDialogDescription>
              Inserts or replaces an item in{" "}
              <span className="font-mono">{selectedTable?.tableName}</span>. JSON must be a plain
              object (not DynamoDB typed attributes).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={itemJson}
            rows={8}
            className="font-mono text-xs"
            onChange={(event) => {
              setItemJson(event.target.value);
            }}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (selectedTable?.tableName && itemJson.trim()) {
                  onPutItem(selectedTable.tableName, itemJson);
                }
                setPutDialogOpen(false);
              }}
            >
              Put item
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete item?</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently deletes an item from{" "}
              <span className="font-mono">{selectedTable?.tableName}</span>. Provide the primary
              key as a plain JSON object.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={keyJson}
            rows={5}
            className="font-mono text-xs"
            onChange={(event) => {
              setKeyJson(event.target.value);
            }}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (selectedTable?.tableName && keyJson.trim()) {
                  onDeleteItem(selectedTable.tableName, keyJson);
                }
                setDeleteDialogOpen(false);
              }}
            >
              Delete item
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}