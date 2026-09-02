// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useEffect, useRef, useState } from "react";
import { Database } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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
import { InventoryLoadingState } from "@/components/inventory-loading-state";
import { azureInventoryLoadingLabel } from "@/lib/azure-inventory";
import { actionCapabilityState, actionDisabledReason } from "@/lib/action-capabilities";
import { EmptyState } from "@/components/empty-state";
import { Textarea } from "@/components/ui/textarea";
import type { AzureCosmosQueryResult, WorkspaceSnapshot } from "@/types/backend";

export type AzureCosmosViewProps = {
  workspace: WorkspaceSnapshot;
  inventoryLoading?: boolean;
  onSelectAccount: (account: string) => void;
  onSelectDatabase: (database: string) => void;
  onSelectContainer: (container: string) => void;
  onDeleteItem: (itemId: string, partitionKey: string, resourceGroup?: string) => void;
  onRunQuery: (query: string) => Promise<AzureCosmosQueryResult>;
};

export const DEFAULT_COSMOS_SQL_QUERY = "SELECT * FROM c";

const fieldLabel =
  "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";
const sectionCard = "space-y-4 rounded-lg border border-border bg-card p-[18px] shadow-sm";

/** Extract a single-level partition key value from document JSON (e.g. /customerId). */
export function partitionKeyValueFromItem(
  item: { id: string; json: string },
  partitionKeyPath?: string,
): string {
  const path = (partitionKeyPath || "/id").replace(/^\//, "").trim();
  if (!path || path === "id") {
    return item.id;
  }
  try {
    const doc = JSON.parse(item.json) as Record<string, unknown>;
    const value = doc[path];
    if (value !== undefined && value !== null) {
      return String(value);
    }
  } catch {
    // fall through
  }
  return item.id;
}

export default function AzureCosmosView({
  workspace,
  inventoryLoading = false,
  onSelectAccount,
  onSelectDatabase,
  onSelectContainer,
  onDeleteItem,
  onRunQuery,
}: AzureCosmosViewProps) {
  const accounts = workspace.azureCosmosAccounts ?? [];
  const databases = workspace.azureCosmosDatabases ?? [];
  const containers = workspace.azureCosmosContainers ?? [];
  const items = workspace.azureCosmosItems ?? [];
  const account = workspace.selectedAzureCosmosAccount ?? accounts[0]?.name ?? "";
  const database = workspace.selectedAzureCosmosDatabase ?? "";
  const container = workspace.selectedAzureCosmosContainer ?? "";
  const selectedContainer = containers.find((item) => item.name === container);
  const resourceGroup = accounts.find((item) => item.name === account)?.resourceGroup;

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; partitionKey: string } | null>(
    null,
  );
  const [queryText, setQueryText] = useState(DEFAULT_COSMOS_SQL_QUERY);
  const [queryResult, setQueryResult] = useState<AzureCosmosQueryResult | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [queryRunning, setQueryRunning] = useState(false);
  const queryGeneration = useRef(0);

  useEffect(() => {
    queryGeneration.current += 1;
    setQueryResult(null);
    setQueryError(null);
    setQueryRunning(false);
  }, [account, database, container]);

  const canQuery = Boolean(account && database && container);
  const canRunQuery = canQuery && queryText.trim().length > 0 && !queryRunning;

  const runQuery = async () => {
    if (!canQuery || queryRunning || !queryText.trim()) {
      return;
    }
    const generation = queryGeneration.current;
    setQueryRunning(true);
    setQueryError(null);
    try {
      const result = await onRunQuery(queryText);
      if (generation !== queryGeneration.current) {
        return;
      }
      setQueryResult(result);
    } catch (error) {
      if (generation !== queryGeneration.current) {
        return;
      }
      setQueryResult(null);
      setQueryError(error instanceof Error ? error.message : String(error));
    } finally {
      if (generation === queryGeneration.current) {
        setQueryRunning(false);
      }
    }
  };

  const deleteCapability = actionCapabilityState(workspace, "cosmos", "deleteItem", "azure");
  const canDelete =
    deleteCapability.enabled && Boolean(account && database && container);
  const deleteDisabledReason = canDelete
    ? undefined
    : actionDisabledReason(
        workspace,
        "cosmos",
        "deleteItem",
        !account || !database || !container
          ? "Select an account, database, and container first."
          : undefined,
        "azure",
      );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-[1.375rem] font-[750] tracking-[-0.015em]">Cosmos DB</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {workspace.profile?.displayName || "Subscription"} · SQL API browse and query
        </p>
      </header>

      {inventoryLoading ? (
        <InventoryLoadingState
          variant="banner"
          label={azureInventoryLoadingLabel(workspace, "cosmos")}
        />
      ) : null}

      <section className={cn(sectionCard, inventoryLoading ? "opacity-60" : undefined)}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-60">
            <div className={cn(fieldLabel, "mb-1")}>Account</div>
            <Select value={account} onValueChange={(value) => value && onSelectAccount(value)}>
              <SelectTrigger aria-label="Select cosmos account">
                <SelectValue placeholder="Select account" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((item) => (
                  <SelectItem key={item.name} value={item.name}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-60">
            <div className={cn(fieldLabel, "mb-1")}>Database</div>
            <Select value={database} onValueChange={(value) => value && onSelectDatabase(value)}>
              <SelectTrigger aria-label="Select cosmos database">
                <SelectValue placeholder="Select database" />
              </SelectTrigger>
              <SelectContent>
                {databases.map((item) => (
                  <SelectItem key={item.name} value={item.name}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{workspace.azureCosmosStatusMessage}</p>
      </section>

      <section className={sectionCard}>
        <h2 className="text-base font-bold">Containers</h2>
        <div className="overflow-hidden rounded-lg border border-border">
          {containers.length === 0 ? (
            <EmptyState
              icon={<Database />}
              title="No containers"
              description="Select a database with containers to browse."
              className="border-0"
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Partition key</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {containers.map((item) => (
                  <TableRow
                    key={item.name}
                    data-state={item.name === container ? "selected" : undefined}
                    className="cursor-pointer"
                    onClick={() => onSelectContainer(item.name)}
                  >
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell className="font-mono text-xs">{item.partitionKey || "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </section>

      <section className={sectionCard}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">Sample items{container ? ` · ${container}` : ""}</h2>
          {items.length > 0 ? (
            <span className="text-xs text-muted-foreground">{items.length} document(s)</span>
          ) : null}
        </div>
        {items.length === 0 ? (
          <EmptyState
            icon={<Database />}
            title="No items"
            description="Select a container to sample its documents."
            className="border-0"
          />
        ) : (
          <div className="space-y-2">
            {items.map((item, index) => {
              const itemId = item.id || `(item ${index + 1})`;
              const partitionKey = partitionKeyValueFromItem(item, selectedContainer?.partitionKey);
              return (
                <details key={item.id || index} className="rounded-lg border border-border bg-muted/40">
                  <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 font-mono text-xs text-foreground">
                    <span>{itemId}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 shrink-0"
                      disabled={!canDelete || !item.id}
                      title={deleteDisabledReason}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        if (!item.id) {
                          return;
                        }
                        setDeleteTarget({ id: item.id, partitionKey });
                      }}
                    >
                      Delete
                    </Button>
                  </summary>
                  <pre className="max-h-64 overflow-auto border-t border-border px-3 py-2 font-mono text-xs text-foreground">
                    {item.json}
                  </pre>
                </details>
              );
            })}
          </div>
        )}
        {deleteDisabledReason ? (
          <p className="text-xs text-muted-foreground">{deleteDisabledReason}</p>
        ) : null}
      </section>

      <section className={sectionCard}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-bold">SQL query</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Read-only SQL API against the selected container. Results capped at 50
              documents. Ctrl+Enter to run.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            disabled={!canRunQuery}
            title={
              canQuery
                ? undefined
                : "Select an account, database, and container first."
            }
            onClick={() => {
              void runQuery();
            }}
          >
            {queryRunning ? "Running..." : "Run query"}
          </Button>
        </div>
        <Textarea
          aria-label="Cosmos SQL query"
          className="min-h-28 font-mono text-xs"
          value={queryText}
          onChange={(event) => setQueryText(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              void runQuery();
            }
          }}
          spellCheck={false}
        />
        {queryError ? <p className="text-sm text-destructive">{queryError}</p> : null}
        {queryResult ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">{queryResult.summary}</p>
            {queryResult.truncated ? (
              <p className="text-xs text-muted-foreground">
                Results were capped. Narrow the WHERE clause to inspect a smaller set.
              </p>
            ) : null}
            {queryResult.items.length === 0 ? (
              <EmptyState
                icon={<Database />}
                title="No documents"
                description="The query returned no items."
                className="border-0"
              />
            ) : (
              queryResult.items.map((item, index) => (
                <details key={item.id || index} className="rounded-lg border border-border bg-muted/40">
                  <summary className="cursor-pointer px-3 py-2 font-mono text-xs text-foreground">
                    {item.id || `(item ${index + 1})`}
                  </summary>
                  <pre className="max-h-64 overflow-auto border-t border-border px-3 py-2 font-mono text-xs text-foreground">
                    {item.json}
                  </pre>
                </details>
              ))
            )}
          </div>
        ) : null}
      </section>

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Cosmos item?</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently deletes document{" "}
              <span className="font-mono">{deleteTarget?.id}</span> from{" "}
              <span className="font-mono">
                {account}/{database}/{container}
              </span>
              .
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteTarget) {
                  onDeleteItem(deleteTarget.id, deleteTarget.partitionKey, resourceGroup);
                }
                setDeleteTarget(null);
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
