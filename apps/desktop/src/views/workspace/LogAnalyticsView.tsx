// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, ChevronDown, ChevronRight, Clock, Loader2, Save, Trash2 } from "lucide-react";

import { KqlEditor } from "@/components/kql/KqlEditor";
import { KqlQueryRunControls } from "@/components/kql/KqlQueryRunControls";
import { LogQueryResultPanel } from "@/components/log-analytics/LogQueryResultPanel";
import {
  APPINSIGHTS_CURATED_CATEGORIES,
  APPINSIGHTS_CURATED_QUERIES,
  type AppInsightsCuratedCategory,
} from "@/lib/appinsights-curated-queries";
import { buildAzureLogAnalyticsPortalUrl } from "@/lib/azure-log-analytics-portal";
import {
  KQL_TIMESPAN_OPTIONS,
  timespanDurationFor,
  timespanLabelFor,
  timespanValueFor,
} from "@/lib/kql-timespan-options";
import {
  buildExecutableKqlQuery,
  detectDuplicateTimespan,
  KQL_PAGE_SIZE_OPTIONS,
  kqlQueryHasNextPage,
  normaliseLogAnalyticsQuery,
  trimKqlQueryPageRows,
  validateLogAnalyticsQuery,
} from "@/lib/log-query-execution";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  InventoryLoadingState,
  InventorySelectLoadingHint,
} from "@/components/inventory-loading-state";
import { azureInventoryLoadingLabel } from "@/lib/azure-inventory";
import { StatusPill } from "@/components/status-pill";
import type {
  AzureLogAnalyticsHistoryEntry,
  AzureLogAnalyticsSavedQuery,
  AzureLogAnalyticsTableInfo,
  AzureLogQueryResult,
  WorkspaceSnapshot,
} from "@/types/backend";

export type LogAnalyticsViewProps = {
  workspace: WorkspaceSnapshot;
  workspaceSelectionLoading?: boolean;
  inventoryLoading?: boolean;
  initialQuery?: string;
  initialTimespan?: string;
  onSelectWorkspace: (workspace: string) => void;
  onRunQuery: (
    workspace: string,
    query: string,
    timespan: string,
    maxRows?: number,
    historyQuery?: string,
  ) => Promise<AzureLogQueryResult>;
  onListHistory: (workspace: string) => Promise<AzureLogAnalyticsHistoryEntry[]>;
  onListSaved: (workspace: string) => Promise<AzureLogAnalyticsSavedQuery[]>;
  onSaveQuery: (
    workspace: string,
    name: string,
    query: string,
    timespan: string,
    id?: string,
  ) => Promise<AzureLogAnalyticsSavedQuery>;
  onDeleteSaved: (workspace: string, id: string) => Promise<void>;
  onListTables: (workspace: string, includeColumns: boolean) => Promise<AzureLogAnalyticsTableInfo[]>;
  onGetTableSchema: (workspace: string, tableName: string) => Promise<AzureLogAnalyticsTableInfo>;
};

const fieldLabel =
  "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";
const sectionCard = "space-y-4 rounded-lg border border-border bg-card p-[18px] shadow-sm";

const DEFAULT_QUERY = APPINSIGHTS_CURATED_QUERIES[5]?.query ?? "AppEvents\n| take 50";

type TableSchemaState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; columns: string[] }
  | { status: "error"; message: string };

function buildTableSnippet(tableName: string): string {
  return `${tableName}
| where TimeGenerated > ago(1h)
| take 50`;
}

export default function LogAnalyticsView({
  workspace,
  workspaceSelectionLoading = false,
  inventoryLoading = false,
  initialQuery,
  initialTimespan,
  onSelectWorkspace,
  onRunQuery,
  onListHistory,
  onListSaved,
  onSaveQuery,
  onDeleteSaved,
  onListTables,
  onGetTableSchema,
}: LogAnalyticsViewProps) {
  const workspaces = workspace.azureLogAnalyticsWorkspaces ?? [];
  const selected = workspace.selectedAzureLogWorkspace ?? workspaces[0]?.name ?? "";
  const selectedWorkspaceMeta = workspaces.find((item) => item.name === selected);
  const inventoryLoadingLabel = azureInventoryLoadingLabel(workspace, "loganalytics");
  const workspaceControlsBusy = inventoryLoading || workspaceSelectionLoading;
  const [query, setQuery] = useState(initialQuery ?? DEFAULT_QUERY);
  const [timespanValue, setTimespanValue] = useState<string>(
    initialTimespan != null ? timespanValueFor(initialTimespan) : KQL_TIMESPAN_OPTIONS[0].value,
  );
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AzureLogQueryResult | null>(null);
  const [pageSize, setPageSize] = useState<number>(KQL_PAGE_SIZE_OPTIONS[2]);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [history, setHistory] = useState<AzureLogAnalyticsHistoryEntry[]>([]);
  const [saved, setSaved] = useState<AzureLogAnalyticsSavedQuery[]>([]);
  const [tables, setTables] = useState<AzureLogAnalyticsTableInfo[]>([]);
  const [tableSchemas, setTableSchemas] = useState<Record<string, TableSchemaState>>({});
  const [expandedTables, setExpandedTables] = useState<Set<string>>(() => new Set());
  const [schemaOpen, setSchemaOpen] = useState(false);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaError, setSchemaError] = useState<string | undefined>();
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [queryWarnings, setQueryWarnings] = useState<string[]>([]);
  const runTokenRef = useRef(0);

  const portalUrl = useMemo(
    () =>
      buildAzureLogAnalyticsPortalUrl(
        workspace.profile?.profileId,
        selectedWorkspaceMeta,
        query,
        timespanDurationFor(timespanValue),
      ),
    [query, selectedWorkspaceMeta, timespanValue, workspace.profile?.profileId],
  );

  useEffect(() => {
    if (initialQuery) {
      setQuery(initialQuery);
    }
    if (initialTimespan != null) {
      setTimespanValue(timespanValueFor(initialTimespan));
    }
  }, [initialQuery, initialTimespan]);

  useEffect(() => {
    if (!selected) return;
    void onListHistory(selected).then(setHistory).catch(() => setHistory([]));
    void onListSaved(selected).then(setSaved).catch(() => setSaved([]));
  }, [selected, onListHistory, onListSaved]);

  const timeRangeLabel = useMemo(
    () => timespanLabelFor(timespanValue),
    [timespanValue],
  );

  const canRun = selected.trim() !== "" && query.trim() !== "" && !running;

  useEffect(() => {
    setPage(1);
    setHasNextPage(false);
    setQueryWarnings([]);
  }, [query, timespanValue, pageSize]);

  async function run(nextPage = page) {
    if (!selected.trim() || !query.trim() || running) return;

    const validationError = validateLogAnalyticsQuery(query);
    if (validationError) {
      setError(validationError);
      setResult(null);
      setHasNextPage(false);
      return;
    }

    const token = ++runTokenRef.current;
    setRunning(true);
    setError(null);
    try {
      const timespan = timespanDurationFor(timespanValue);
      const normalised = normaliseLogAnalyticsQuery(query);
      const duplicateTimespan = detectDuplicateTimespan(normalised.query, timespan);
      setQueryWarnings(
        duplicateTimespan
          ? [...normalised.warnings, duplicateTimespan]
          : normalised.warnings,
      );
      const built = buildExecutableKqlQuery(normalised.query, { page: nextPage, pageSize });
      const queryResult = await onRunQuery(
        selected,
        built.query,
        timespan,
        built.maxRows,
        query.trim(),
      );
      if (token !== runTokenRef.current) return;
      const trimmedRows = trimKqlQueryPageRows(queryResult.rows, built.pageSize);
      setResult({ ...queryResult, rows: trimmedRows });
      setHasNextPage(kqlQueryHasNextPage(queryResult.rows.length, built.pageSize));
      setPage(nextPage);
      void onListHistory(selected).then(setHistory).catch(() => undefined);
    } catch (caught) {
      if (token !== runTokenRef.current) return;
      setError(caught instanceof Error ? caught.message : String(caught));
      setResult(null);
      setHasNextPage(false);
    } finally {
      if (token === runTokenRef.current) {
        setRunning(false);
      }
    }
  }

  function cancelRun() {
    runTokenRef.current += 1;
    setRunning(false);
  }

  function changePage(nextPage: number) {
    if (nextPage < 1 || running || !query.trim()) {
      return;
    }
    void run(nextPage);
  }

  function loadCurated(entry: (typeof APPINSIGHTS_CURATED_QUERIES)[number]) {
    setQuery(entry.query);
    setTimespanValue(timespanValueFor(entry.timespan));
  }

  function loadHistoryEntry(entry: AzureLogAnalyticsHistoryEntry) {
    setQuery(entry.query);
    if (entry.timespan != null) {
      setTimespanValue(timespanValueFor(entry.timespan));
    }
  }

  function loadSavedEntry(entry: AzureLogAnalyticsSavedQuery) {
    setQuery(entry.query);
    if (entry.timespan != null) {
      setTimespanValue(timespanValueFor(entry.timespan));
    }
  }

  async function openSchemaBrowser() {
    setSchemaOpen(true);
    setSchemaLoading(true);
    setSchemaError(undefined);
    setTableSchemas({});
    setExpandedTables(new Set());
    try {
      const listed = await onListTables(selected, false);
      setTables(listed);
    } catch (error) {
      setTables([]);
      setSchemaError(error instanceof Error ? error.message : "Could not load workspace tables.");
    } finally {
      setSchemaLoading(false);
    }
  }

  async function toggleTableSchema(tableName: string) {
    setExpandedTables((current) => {
      const next = new Set(current);
      if (next.has(tableName)) {
        next.delete(tableName);
      } else {
        next.add(tableName);
      }
      return next;
    });

    const existing = tableSchemas[tableName];
    if (existing && existing.status !== "idle") {
      return;
    }

    setTableSchemas((current) => ({ ...current, [tableName]: { status: "loading" } }));
    try {
      const schema = await onGetTableSchema(selected, tableName);
      setTableSchemas((current) => ({
        ...current,
        [tableName]: { status: "ready", columns: schema.columns ?? [] },
      }));
    } catch (caught) {
      setTableSchemas((current) => ({
        ...current,
        [tableName]: {
          status: "error",
          message: caught instanceof Error ? caught.message : "Could not load columns.",
        },
      }));
    }
  }

  async function confirmSaveQuery() {
    const name = saveName.trim();
    if (!name) return;
    const timespan = timespanDurationFor(timespanValue);
    await onSaveQuery(selected, name, query, timespan);
    setSaveDialogOpen(false);
    setSaveName("");
    const refreshed = await onListSaved(selected);
    setSaved(refreshed);
  }

  async function deleteSaved(id: string) {
    await onDeleteSaved(selected, id);
    const refreshed = await onListSaved(selected);
    setSaved(refreshed);
  }

  function openPortal() {
    if (!portalUrl) {
      return;
    }
    window.open(portalUrl, "_blank", "noopener,noreferrer");
  }

  const curatedByCategory = useMemo(() => {
    const grouped = new Map<AppInsightsCuratedCategory, typeof APPINSIGHTS_CURATED_QUERIES>();
    for (const entry of APPINSIGHTS_CURATED_QUERIES) {
      const bucket = grouped.get(entry.category) ?? [];
      bucket.push(entry);
      grouped.set(entry.category, bucket);
    }
    return grouped;
  }, []);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-[1.375rem] font-[750] tracking-[-0.015em]">Log Analytics</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {workspace.profile?.displayName || "Subscription"} · KQL query
        </p>
      </header>

      {inventoryLoading ? (
        <InventoryLoadingState variant="banner" label={inventoryLoadingLabel} />
      ) : null}
      <section className={cn(sectionCard, inventoryLoading ? "opacity-60" : undefined)}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-72">
            <div className={cn(fieldLabel, "mb-1")}>Workspace</div>
            <Select
              value={selected}
              disabled={workspaceControlsBusy}
              onValueChange={(value) => {
                if (value) onSelectWorkspace(value);
              }}
            >
              <SelectTrigger aria-label="Select Log Analytics workspace">
                {inventoryLoading && workspaces.length === 0 ? (
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
                    Loading workspaces...
                  </span>
                ) : (
                  <SelectValue placeholder="Select workspace" />
                )}
              </SelectTrigger>
              <SelectContent>
                {workspaces.map((ws) => (
                  <SelectItem key={ws.customerId || ws.name} value={ws.name}>
                    {ws.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <InventorySelectLoadingHint
              loading={inventoryLoading && workspaces.length === 0}
              label={inventoryLoadingLabel}
            />
            <InventorySelectLoadingHint
              loading={workspaceSelectionLoading}
              label="Switching workspace..."
            />
          </div>
          <div className="w-48">
            <div className={cn(fieldLabel, "mb-1")}>Time range</div>
            <Select value={timespanValue} onValueChange={setTimespanValue}>
              <SelectTrigger aria-label="Select query time range">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KQL_TIMESPAN_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" disabled={!selected}>
                <Clock />
                History
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-72 w-80 overflow-y-auto">
              <DropdownMenuLabel>Recent queries</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {history.length === 0 ? (
                <DropdownMenuItem disabled>No history yet</DropdownMenuItem>
              ) : (
                history.map((entry, index) => (
                  <DropdownMenuItem
                    key={`${entry.ranAt}-${index}`}
                    onClick={() => loadHistoryEntry(entry)}
                  >
                    <span className="line-clamp-2 font-mono text-xs">{entry.query}</span>
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" disabled={!selected}>
                <Save />
                Saved
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-72 w-80 overflow-y-auto">
              <DropdownMenuLabel>Saved queries (local)</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {saved.length === 0 ? (
                <DropdownMenuItem disabled>No saved queries</DropdownMenuItem>
              ) : (
                saved.map((entry) => (
                  <DropdownMenuItem
                    key={entry.id}
                    className="flex items-start justify-between gap-2"
                    onClick={() => loadSavedEntry(entry)}
                  >
                    <span className="line-clamp-2">
                      <span className="font-medium">{entry.name}</span>
                      <span className="mt-0.5 block font-mono text-xs text-muted-foreground">
                        {entry.query}
                      </span>
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 shrink-0"
                      aria-label={`Delete saved query ${entry.name}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        void deleteSaved(entry.id);
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" disabled={!query.trim()} onClick={() => setSaveDialogOpen(true)}>
            <Save />
            Save query
          </Button>
          <Button variant="outline" disabled={!selected} onClick={() => void openSchemaBrowser()}>
            <BookOpen />
            Schema
          </Button>
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className={fieldLabel}>KQL query</div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                    Curated
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="max-w-md">
                  <DropdownMenuLabel>App Insights queries</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {Array.from(curatedByCategory.entries()).map(([category, entries]) => (
                    <div key={category}>
                      <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {APPINSIGHTS_CURATED_CATEGORIES[category]}
                      </DropdownMenuLabel>
                      {entries.map((entry) => (
                        <DropdownMenuItem key={entry.id} onClick={() => loadCurated(entry)}>
                          <span>
                            <span className="font-medium">{entry.label}</span>
                            <span className="mt-0.5 block text-xs text-muted-foreground">
                              {entry.description}
                            </span>
                          </span>
                        </DropdownMenuItem>
                      ))}
                    </div>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <KqlQueryRunControls
              running={running}
              canRun={canRun}
              pageSize={pageSize}
              onRun={() => void run(1)}
              onCancel={cancelRun}
              onPageSizeChange={setPageSize}
              onOpenInPortal={portalUrl ? openPortal : undefined}
              openInPortalDisabled={!portalUrl}
            />
          </div>
          <KqlEditor value={query} onChange={setQuery} onRun={() => void run(1)} disabled={running} />
          {queryWarnings.length > 0 ? (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
              {queryWarnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">{workspace.azureLogAnalyticsStatusMessage}</p>
          <StatusPill status="warning" label="Local KQL is a subset" />
        </div>
      </section>

      <LogQueryResultPanel
        result={result}
        error={error}
        timeRangeLabel={timeRangeLabel}
        pagination={
          result
            ? {
                page,
                pageSize,
                hasNextPage,
                onPageChange: changePage,
                disabled: running,
              }
            : undefined
        }
      />

      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save query</DialogTitle>
            <DialogDescription>
              Stored locally for this workspace. Cloud sync is planned for a later release.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={saveName}
            onChange={(event) => setSaveName(event.target.value)}
            placeholder="Query name"
            aria-label="Saved query name"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void confirmSaveQuery()} disabled={!saveName.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={schemaOpen} onOpenChange={setSchemaOpen}>
        <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Schema browser</DialogTitle>
            <DialogDescription>
              Tables in workspace {selected}. Expand a table to load columns, or insert a starter snippet.
            </DialogDescription>
          </DialogHeader>
          {schemaLoading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading tables...
            </p>
          ) : schemaError ? (
            <p className="text-sm text-destructive">{schemaError}</p>
          ) : tables.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tables returned for this workspace.</p>
          ) : (
            <ul className="space-y-3">
              {tables.map((table) => {
                const expanded = expandedTables.has(table.name);
                const schemaState = tableSchemas[table.name] ?? { status: "idle" as const };
                return (
                  <li key={table.name} className="rounded-lg border border-border px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 font-mono text-sm font-semibold hover:underline"
                        onClick={() => void toggleTableSchema(table.name)}
                      >
                        {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                        {table.name}
                      </button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setQuery(buildTableSnippet(table.name));
                          setSchemaOpen(false);
                        }}
                      >
                        Insert snippet
                      </Button>
                    </div>
                    {expanded ? (
                      <div className="mt-2 border-t border-border/60 pt-2">
                        {schemaState.status === "loading" ? (
                          <p className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Loader2 className="size-3 animate-spin" />
                            Loading columns...
                          </p>
                        ) : schemaState.status === "error" ? (
                          <p className="text-xs text-destructive">{schemaState.message}</p>
                        ) : schemaState.status === "ready" && schemaState.columns.length > 0 ? (
                          <p className="text-xs text-muted-foreground">
                            {schemaState.columns.slice(0, 24).join(", ")}
                            {schemaState.columns.length > 24 ? "…" : ""}
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground">No columns returned.</p>
                        )}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}