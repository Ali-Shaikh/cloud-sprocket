// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Clock, Loader2, Play, Save, Square, Trash2 } from "lucide-react";

import { KqlEditor } from "@/components/kql/KqlEditor";
import { LogQueryResultPanel } from "@/components/log-analytics/LogQueryResultPanel";
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
  initialQuery?: string;
  initialTimespan?: string;
  onSelectWorkspace: (workspace: string) => void;
  onRunQuery: (
    workspace: string,
    query: string,
    timespan: string,
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
};

const fieldLabel =
  "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";
const sectionCard = "space-y-4 rounded-lg border border-border bg-card p-[18px] shadow-sm";

const SAMPLE_QUERY = "AppEvents\n| take 50";

const TIMESPAN_OPTIONS = [
  { label: "All time", value: "all", timespan: "" },
  { label: "Last 30 minutes", value: "PT30M", timespan: "PT30M" },
  { label: "Last hour", value: "PT1H", timespan: "PT1H" },
  { label: "Last 24 hours", value: "P1D", timespan: "P1D" },
  { label: "Last 7 days", value: "P7D", timespan: "P7D" },
  { label: "Last 30 days", value: "P30D", timespan: "P30D" },
] as const;

function timespanValueFor(timespan: string): string {
  const match = TIMESPAN_OPTIONS.find((option) => option.timespan === timespan);
  return match?.value ?? TIMESPAN_OPTIONS[0].value;
}

export default function LogAnalyticsView({
  workspace,
  workspaceSelectionLoading = false,
  initialQuery,
  initialTimespan,
  onSelectWorkspace,
  onRunQuery,
  onListHistory,
  onListSaved,
  onSaveQuery,
  onDeleteSaved,
  onListTables,
}: LogAnalyticsViewProps) {
  const workspaces = workspace.azureLogAnalyticsWorkspaces ?? [];
  const selected = workspace.selectedAzureLogWorkspace ?? workspaces[0]?.name ?? "";
  const [query, setQuery] = useState(initialQuery ?? SAMPLE_QUERY);
  const [timespanValue, setTimespanValue] = useState<string>(
    initialTimespan != null ? timespanValueFor(initialTimespan) : TIMESPAN_OPTIONS[0].value,
  );
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AzureLogQueryResult | null>(null);
  const [history, setHistory] = useState<AzureLogAnalyticsHistoryEntry[]>([]);
  const [saved, setSaved] = useState<AzureLogAnalyticsSavedQuery[]>([]);
  const [tables, setTables] = useState<AzureLogAnalyticsTableInfo[]>([]);
  const [schemaOpen, setSchemaOpen] = useState(false);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaError, setSchemaError] = useState<string | undefined>();
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const runTokenRef = useRef(0);

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
    () => TIMESPAN_OPTIONS.find((option) => option.value === timespanValue)?.label ?? "All time",
    [timespanValue],
  );

  const canRun = selected.trim() !== "" && query.trim() !== "" && !running;

  async function run() {
    if (!canRun) return;
    const token = ++runTokenRef.current;
    setRunning(true);
    setError(null);
    try {
      const timespan =
        TIMESPAN_OPTIONS.find((option) => option.value === timespanValue)?.timespan ?? "";
      const queryResult = await onRunQuery(selected, query, timespan);
      if (token !== runTokenRef.current) return;
      setResult(queryResult);
      void onListHistory(selected).then(setHistory).catch(() => undefined);
    } catch (caught) {
      if (token !== runTokenRef.current) return;
      setError(caught instanceof Error ? caught.message : String(caught));
      setResult(null);
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
    try {
      // Table names only: column getschema per table can run hundreds of az queries.
      const listed = await onListTables(selected, false);
      setTables(listed);
    } catch (error) {
      setTables([]);
      setSchemaError(error instanceof Error ? error.message : "Could not load workspace tables.");
    } finally {
      setSchemaLoading(false);
    }
  }

  async function confirmSaveQuery() {
    const name = saveName.trim();
    if (!name) return;
    const timespan =
      TIMESPAN_OPTIONS.find((option) => option.value === timespanValue)?.timespan ?? "";
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

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-[1.375rem] font-[750] tracking-[-0.015em]">Log Analytics</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {workspace.profile?.displayName || "Subscription"} · KQL query
        </p>
      </header>

      <section className={sectionCard}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-72">
            <div className={cn(fieldLabel, "mb-1")}>Workspace</div>
            <Select
              value={selected}
              disabled={workspaceSelectionLoading}
              onValueChange={(value) => {
                if (value) onSelectWorkspace(value);
              }}
            >
              <SelectTrigger aria-label="Select Log Analytics workspace">
                <SelectValue placeholder="Select workspace" />
              </SelectTrigger>
              <SelectContent>
                {workspaces.map((ws) => (
                  <SelectItem key={ws.customerId || ws.name} value={ws.name}>
                    {ws.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {workspaceSelectionLoading ? (
              <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground" role="status">
                <Loader2 className="size-3.5 animate-spin" />
                Switching workspace...
              </p>
            ) : null}
          </div>
          <div className="w-48">
            <div className={cn(fieldLabel, "mb-1")}>Time range</div>
            <Select value={timespanValue} onValueChange={setTimespanValue}>
              <SelectTrigger aria-label="Select query time range">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMESPAN_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => void run()} disabled={!canRun}>
            {running ? <Loader2 className="animate-spin" /> : <Play />}
            {running ? "Running…" : "Run query"}
          </Button>
          {running ? (
            <Button variant="outline" onClick={cancelRun}>
              <Square />
              Cancel
            </Button>
          ) : null}
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

        <div>
          <div className={cn(fieldLabel, "mb-1")}>KQL query</div>
          <KqlEditor value={query} onChange={setQuery} onRun={() => void run()} disabled={running} />
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">{workspace.azureLogAnalyticsStatusMessage}</p>
          <StatusPill status="warning" label="Local KQL is a subset" />
        </div>
      </section>

      <LogQueryResultPanel result={result} error={error} timeRangeLabel={timeRangeLabel} />

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
              Tables in workspace {selected}. Click a table name to insert it into the editor.
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
              {tables.map((table) => (
                <li key={table.name} className="rounded-lg border border-border px-3 py-2">
                  <button
                    type="button"
                    className="font-mono text-sm font-semibold hover:underline"
                    onClick={() => {
                      setQuery((current) => (current.trim() ? `${current}\n${table.name}` : table.name));
                      setSchemaOpen(false);
                    }}
                  >
                    {table.name}
                  </button>
                  {table.columns && table.columns.length > 0 ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {table.columns.slice(0, 12).join(", ")}
                      {table.columns.length > 12 ? "…" : ""}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}