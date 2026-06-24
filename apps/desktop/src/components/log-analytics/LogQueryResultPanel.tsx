// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Copy,
  Download,
  Table2,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { notify } from "@/lib/notify";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { EmptyState } from "@/components/empty-state";
import type { AzureLogQueryResult, AzureWafLogColumnMap } from "@/types/backend";
import { decodeWafRow, isTuningCandidate } from "@/lib/waf-decode";
import {
  downloadTextFile,
  formatCellValue,
  populatedRowFields,
  projectRow,
  resultToCsv,
  resultToJson,
  rowToRecordPopulated,
  sortRows,
  visibleColumns,
} from "./log-query-utils";

export type LogQueryPagination = {
  page: number;
  pageSize: number;
  hasNextPage: boolean;
  onPageChange: (page: number) => void;
  disabled?: boolean;
};

export type LogQueryResultPanelProps = {
  result: AzureLogQueryResult | null;
  error?: string | null;
  timeRangeLabel?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  wafColumnMap?: AzureWafLogColumnMap;
  pagination?: LogQueryPagination;
};

type SortDirection = "asc" | "desc" | null;

/** Virtualize only large result sets; small tables stay DOM-simple for tests and detail panels. */
const VIRTUALIZE_ROW_THRESHOLD = 200;

function columnGridTemplate(columnCount: number): string {
  return `repeat(${Math.max(columnCount, 1)}, minmax(8rem, 1fr))`;
}

const virtualCellClass = (wrapCells: boolean) =>
  cn(
    "px-3 py-2 align-middle font-mono text-xs",
    wrapCells ? "whitespace-pre-wrap break-all" : "truncate",
  );

const fieldLabel =
  "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

function copyToClipboard(value: string, label = "Copied to clipboard"): void {
  if (!navigator.clipboard) {
    return;
  }
  void navigator.clipboard.writeText(value).then(
    () => notify("success", label),
    () => notify("error", "Could not copy to clipboard"),
  );
}

function sortIcon(column: string, activeColumn: string | null, direction: SortDirection) {
  if (activeColumn !== column || !direction) {
    return <ArrowUpDown className="ml-1 inline size-3 opacity-40" />;
  }
  return direction === "asc" ? (
    <ArrowUp className="ml-1 inline size-3" />
  ) : (
    <ArrowDown className="ml-1 inline size-3" />
  );
}

function wafDefaultVisibleColumns(
  columns: string[],
  columnMap: AzureWafLogColumnMap,
): Set<string> {
  const visible = new Set<string>();
  Object.values(columnMap).forEach((name) => {
    if (name && columns.includes(name)) {
      visible.add(name);
    }
  });
  [
    "TimeGenerated",
    "Category",
    "Resource",
    "ResourceGroup",
    "clientPort_s",
    "socketIP_s",
    "onbehalfServiceId_s",
  ].forEach((name) => {
    if (columns.includes(name)) {
      visible.add(name);
    }
  });
  return visible;
}

function WafSummaryCard({ decoded }: { decoded: ReturnType<typeof decodeWafRow> }) {
  const facts: Array<{ label: string; value: string; mono?: boolean }> = [
    { label: "Time", value: decoded.timeGenerated ?? "" },
    { label: "Action", value: decoded.action ?? "", mono: true },
    { label: "Rule", value: decoded.ruleName ?? "", mono: true },
    { label: "Client IP", value: decoded.clientIP ?? "", mono: true },
    { label: "Host", value: decoded.host ?? "" },
    { label: "URI", value: decoded.requestUri ?? "", mono: true },
    { label: "Policy", value: decoded.policyName ?? "", mono: true },
    { label: "Mode", value: decoded.policyMode ?? "", mono: true },
    { label: "Tracking ref", value: decoded.trackingReference ?? "", mono: true },
  ].filter((fact) => fact.value.trim() !== "" && fact.value.toLowerCase() !== "none");

  return (
    <div className="space-y-3">
      {facts.length > 0 ? (
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {facts.map((fact) => (
            <div key={fact.label}>
              <dt className={fieldLabel}>{fact.label}</dt>
              <dd
                className={cn(
                  "mt-1 text-sm break-all",
                  fact.mono ? "font-mono text-xs" : "",
                )}
              >
                {fact.value}
                {fact.label === "Action" && isTuningCandidate(decoded.action) ? (
                  <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">
                    Tuning candidate
                  </span>
                ) : null}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {decoded.detailsMessage ? (
        <div>
          <div className={fieldLabel}>Message</div>
          <p className="mt-1 font-mono text-xs whitespace-pre-wrap break-all">
            {decoded.detailsMessage}
          </p>
        </div>
      ) : null}
      {decoded.matches.length > 0 ? (
        <div className="overflow-auto rounded border border-border">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-left">
                <th className="px-2 py-1 font-semibold">Match variable</th>
                <th className="px-2 py-1 font-semibold">Value</th>
              </tr>
            </thead>
            <tbody>
              {decoded.matches.map((match, index) => (
                <tr key={index} className="border-b border-border/60 last:border-0">
                  <td className="px-2 py-1 font-mono">{match.matchVariableName}</td>
                  <td className="px-2 py-1 font-mono whitespace-pre-wrap break-all">
                    {match.matchVariableValue}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function LogQueryRowDetailPanel({
  columns,
  row,
  rowIndex,
  rowCount,
  wafColumnMap,
  onClose,
  onSelectRowIndex,
}: {
  columns: string[];
  row: string[];
  rowIndex: number;
  rowCount: number;
  wafColumnMap?: AzureWafLogColumnMap;
  onClose: () => void;
  onSelectRowIndex: (index: number) => void;
}) {
  const [fieldFilter, setFieldFilter] = useState("");
  const [detailTab, setDetailTab] = useState("summary");

  const populated = useMemo(() => populatedRowFields(columns, row), [columns, row]);
  const rowJson = useMemo(
    () => JSON.stringify(rowToRecordPopulated(columns, row), null, 2),
    [columns, row],
  );
  const decodedWaf = wafColumnMap ? decodeWafRow(columns, row, wafColumnMap) : null;

  const filteredFields = useMemo(() => {
    const query = fieldFilter.trim().toLowerCase();
    if (!query) {
      return populated;
    }
    return populated.filter(
      ({ column, value }) =>
        column.toLowerCase().includes(query) || value.toLowerCase().includes(query),
    );
  }, [fieldFilter, populated]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        onSelectRowIndex(Math.min(rowIndex + 1, rowCount - 1));
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        onSelectRowIndex(Math.max(rowIndex - 1, 0));
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, onSelectRowIndex, rowCount, rowIndex]);

  return (
    <div
      className="border-t border-border bg-muted/20"
      data-slot="log-query-row-detail"
      aria-label="Query result row details"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">
            Row {rowIndex + 1} of {rowCount}
          </span>
          <span className="text-xs text-muted-foreground">
            {populated.length} populated field{populated.length === 1 ? "" : "s"} of{" "}
            {columns.length}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            aria-label="Previous row"
            disabled={rowIndex <= 0}
            onClick={() => onSelectRowIndex(rowIndex - 1)}
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            aria-label="Next row"
            disabled={rowIndex >= rowCount - 1}
            onClick={() => onSelectRowIndex(rowIndex + 1)}
          >
            <ChevronRight />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => copyToClipboard(rowJson, "Row copied as JSON")}
          >
            <Copy />
            Copy JSON
          </Button>
          <Button variant="ghost" size="icon" className="size-8" aria-label="Close row detail" onClick={onClose}>
            <X />
          </Button>
        </div>
      </div>

      <Tabs value={detailTab} onValueChange={setDetailTab} className="gap-0">
        <div className="border-b border-border px-4 py-2">
          <TabsList>
            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="json">JSON</TabsTrigger>
            <TabsTrigger value="fields">
              Fields ({populated.length})
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="summary" className="mt-0 max-h-72 overflow-y-auto px-4 py-3">
          {decodedWaf ? (
            <WafSummaryCard decoded={decodedWaf} />
          ) : populated.length > 0 ? (
            <dl className="grid gap-3 sm:grid-cols-2">
              {populated.slice(0, 12).map(({ column, value }) => (
                <div key={column}>
                  <dt className={fieldLabel}>{column}</dt>
                  <dd className="mt-1 font-mono text-xs whitespace-pre-wrap break-all">{value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">No populated fields in this row.</p>
          )}
          {decodedWaf && populated.length > 12 ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Open the Fields tab for the full list of populated columns.
            </p>
          ) : null}
        </TabsContent>

        <TabsContent value="json" className="mt-0 max-h-72 overflow-y-auto px-4 py-3">
          <pre className="rounded-lg border border-border bg-card p-3 font-mono text-xs whitespace-pre-wrap break-all">
            {rowJson}
          </pre>
        </TabsContent>

        <TabsContent value="fields" className="mt-0 space-y-3 px-4 py-3">
          <Input
            value={fieldFilter}
            onChange={(event) => setFieldFilter(event.target.value)}
            placeholder="Filter fields…"
            aria-label="Filter populated fields"
            className="max-w-sm"
          />
          <div className="max-h-64 overflow-y-auto rounded-lg border border-border">
            {filteredFields.length > 0 ? (
              <dl className="divide-y divide-border">
                {filteredFields.map(({ column, value }) => {
                  const formatted = formatCellValue(value);
                  return (
                    <div key={column} className="grid gap-1 px-3 py-2 sm:grid-cols-[minmax(140px,220px)_1fr]">
                      <dt className="font-mono text-[11px] font-semibold text-muted-foreground break-all">
                        {column}
                      </dt>
                      <dd className="min-w-0">
                        {formatted.kind === "json" ? (
                          <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all font-mono text-xs">
                            {formatted.display}
                          </pre>
                        ) : (
                          <span className="font-mono text-xs whitespace-pre-wrap break-all">
                            {formatted.display}
                          </span>
                        )}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            ) : (
              <p className="px-3 py-4 text-sm text-muted-foreground">
                {populated.length === 0
                  ? "No populated fields in this row."
                  : "No fields match your filter."}
              </p>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function LogQueryResultPanel({
  result,
  error = null,
  timeRangeLabel = "All time",
  emptyTitle = "No results yet",
  emptyDescription = "Run a KQL query to see results here.",
  wafColumnMap,
  pagination,
}: LogQueryResultPanelProps) {
  const [wrapCells, setWrapCells] = useState(false);
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(() => new Set());
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);

  const columns = result?.columns ?? [];
  const rows = result?.rows ?? [];

  useEffect(() => {
    setSortColumn(null);
    setSortDirection(null);
    setSelectedRowIndex(null);
    const nextColumns = result?.columns ?? [];
    if (!result || nextColumns.length === 0) {
      setHiddenColumns(new Set());
      return;
    }
    if (wafColumnMap) {
      const visible = wafDefaultVisibleColumns(nextColumns, wafColumnMap);
      setHiddenColumns(new Set(nextColumns.filter((column) => !visible.has(column))));
      return;
    }
    setHiddenColumns(new Set());
  }, [result, wafColumnMap]);

  const shownColumns = useMemo(
    () => visibleColumns(columns, hiddenColumns),
    [columns, hiddenColumns],
  );

  const displayRows = useMemo(
    () => sortRows(columns, rows, sortColumn, sortDirection),
    [columns, rows, sortColumn, sortDirection],
  );

  const shouldVirtualize = displayRows.length > VIRTUALIZE_ROW_THRESHOLD;
  const columnTemplate = useMemo(
    () => columnGridTemplate(shownColumns.length),
    [shownColumns.length],
  );
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: shouldVirtualize ? displayRows.length : 0,
    getScrollElement: () => tableScrollRef.current,
    estimateSize: () => 40,
    overscan: 10,
  });

  const selectedRow = useMemo(() => {
    if (selectedRowIndex == null || selectedRowIndex < 0 || selectedRowIndex >= displayRows.length) {
      return null;
    }
    return displayRows[selectedRowIndex];
  }, [displayRows, selectedRowIndex]);

  const toggleSort = useCallback((column: string) => {
    if (sortColumn !== column) {
      setSortColumn(column);
      setSortDirection("asc");
      return;
    }
    if (sortDirection === "asc") {
      setSortDirection("desc");
      return;
    }
    if (sortDirection === "desc") {
      setSortColumn(null);
      setSortDirection(null);
      return;
    }
    setSortDirection("asc");
  }, [sortColumn, sortDirection]);

  const openRow = useCallback((rowIndex: number) => {
    setSelectedRowIndex((current) => (current === rowIndex ? null : rowIndex));
  }, []);

  const toggleColumnVisibility = useCallback((column: string, visible: boolean) => {
    setHiddenColumns((current) => {
      const next = new Set(current);
      if (visible) {
        next.delete(column);
      } else {
        next.add(column);
      }
      return next;
    });
  }, []);

  const hasResult = result != null;
  const hasRows = rows.length > 0;
  const hasColumns = columns.length > 0;
  const detailOpen = selectedRow != null && selectedRowIndex != null;

  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-[18px] shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold">Results</h2>
          {hasResult ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {rows.length} row{rows.length === 1 ? "" : "s"} · {columns.length} column
              {columns.length === 1 ? "" : "s"}
              {shownColumns.length < columns.length
                ? ` · ${shownColumns.length} visible`
                : ""}
              {typeof result.durationMs === "number" ? ` · ${result.durationMs} ms` : ""}
              {timeRangeLabel ? ` · ${timeRangeLabel}` : ""}
              {result.truncated ? " · results capped" : ""}
            </p>
          ) : null}
          {result?.truncated ? (
            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
              Results were capped at the configured row limit. Narrow the time range or refine the
              query to see more.
            </p>
          ) : null}
          {error ? <p className="mt-1 text-sm text-destructive">{error}</p> : null}
          {hasResult && !error && !hasRows ? (
            <p className="mt-1 text-sm text-muted-foreground">
              The query ran successfully but returned no rows.
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {pagination ? (
            <div className="flex items-center gap-2 rounded-lg border border-border px-2 py-1">
              <span className="text-xs tabular-nums text-muted-foreground">
                Page {pagination.page}
                {pagination.hasNextPage ? "+" : ""}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="size-7"
                aria-label="Previous page"
                disabled={pagination.disabled || pagination.page <= 1}
                onClick={() => pagination.onPageChange(pagination.page - 1)}
              >
                <ChevronLeft />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="size-7"
                aria-label="Next page"
                disabled={pagination.disabled || !pagination.hasNextPage}
                onClick={() => pagination.onPageChange(pagination.page + 1)}
              >
                <ChevronRight />
              </Button>
            </div>
          ) : null}
          {hasRows && hasColumns ? (
            <>
            <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5">
              <Switch
                id="log-query-wrap"
                checked={wrapCells}
                onCheckedChange={setWrapCells}
                aria-label="Wrap text in table cells"
              />
              <label htmlFor="log-query-wrap" className="text-xs font-medium">
                Wrap text
              </label>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Columns3 />
                  Columns
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto">
                {columns.map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column}
                    checked={!hiddenColumns.has(column)}
                    onCheckedChange={(checked) => toggleColumnVisibility(column, Boolean(checked))}
                  >
                    {column}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                copyToClipboard(resultToJson(shownColumns, displayRows.map((row) => projectRow(row, columns, shownColumns))), "Results copied as JSON")
              }
            >
              <Copy />
              Copy as JSON
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                downloadTextFile(
                  "log-analytics-results.json",
                  resultToJson(shownColumns, displayRows.map((row) => projectRow(row, columns, shownColumns))),
                  "application/json",
                )
              }
            >
              <Download />
              Download JSON
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                downloadTextFile(
                  "log-analytics-results.csv",
                  resultToCsv(shownColumns, displayRows.map((row) => projectRow(row, columns, shownColumns))),
                  "text/csv;charset=utf-8",
                )
              }
            >
              <Download />
              Download CSV
            </Button>
            </>
          ) : null}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <div
          ref={tableScrollRef}
          className={cn(
            "overflow-auto",
            detailOpen ? "max-h-[min(45vh,420px)]" : "max-h-[min(70vh,640px)]",
          )}
        >
          {hasRows && shownColumns.length > 0 ? (
            <div className="min-w-full">
              <div
                className="sticky top-0 z-10 grid border-b border-border bg-card"
                style={{ gridTemplateColumns: columnTemplate }}
                role="row"
              >
                {shownColumns.map((column) => (
                  <div
                    key={column}
                    className="h-10 whitespace-nowrap bg-card px-3 text-left align-middle text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                    role="columnheader"
                  >
                    <button
                      type="button"
                      className="inline-flex items-center font-semibold hover:text-foreground"
                      onClick={() => toggleSort(column)}
                    >
                      {column}
                      {sortIcon(column, sortColumn, sortDirection)}
                    </button>
                  </div>
                ))}
              </div>
              {shouldVirtualize ? (
                <div
                  role="rowgroup"
                  style={{
                    height: `${rowVirtualizer.getTotalSize()}px`,
                    position: "relative",
                  }}
                >
                  {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const rowIndex = virtualRow.index;
                    const row = displayRows[rowIndex];
                    return (
                      <div
                        key={virtualRow.key}
                        role="row"
                        className={cn(
                          "absolute left-0 grid w-full cursor-pointer border-b border-border transition-colors hover:bg-muted/50",
                          selectedRowIndex === rowIndex && "bg-primary/10 hover:bg-primary/10",
                        )}
                        style={{
                          gridTemplateColumns: columnTemplate,
                          transform: `translateY(${virtualRow.start}px)`,
                        }}
                        onClick={() => openRow(rowIndex)}
                        aria-selected={selectedRowIndex === rowIndex}
                      >
                        {projectRow(row, columns, shownColumns).map((cell, cellIndex) => (
                          <div
                            key={`${rowIndex}-${cellIndex}`}
                            role="cell"
                            title={cell}
                            className={virtualCellClass(wrapCells)}
                          >
                            {cell}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div role="rowgroup">
                  {displayRows.map((row, rowIndex) => (
                    <div
                      key={rowIndex}
                      role="row"
                      className={cn(
                        "grid w-full cursor-pointer border-b border-border transition-colors hover:bg-muted/50",
                        selectedRowIndex === rowIndex && "bg-primary/10 hover:bg-primary/10",
                      )}
                      style={{ gridTemplateColumns: columnTemplate }}
                      onClick={() => openRow(rowIndex)}
                      aria-selected={selectedRowIndex === rowIndex}
                    >
                      {projectRow(row, columns, shownColumns).map((cell, cellIndex) => (
                        <div
                          key={`${rowIndex}-${cellIndex}`}
                          role="cell"
                          title={cell}
                          className={virtualCellClass(wrapCells)}
                        >
                          {cell}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <EmptyState
              icon={<Table2 />}
              title={hasResult && !hasRows ? "No rows" : emptyTitle}
              description={
                hasResult && !hasRows
                  ? "The query ran but returned no rows."
                  : emptyDescription
              }
              className="border-0"
            />
          )}
        </div>

        {detailOpen && selectedRow && selectedRowIndex != null ? (
          <LogQueryRowDetailPanel
            columns={columns}
            row={selectedRow}
            rowIndex={selectedRowIndex}
            rowCount={displayRows.length}
            wafColumnMap={wafColumnMap}
            onClose={() => setSelectedRowIndex(null)}
            onSelectRowIndex={setSelectedRowIndex}
          />
        ) : null}
      </div>

      {hasRows ? (
        <p className="text-xs text-muted-foreground">
          Click a row to inspect it below. Use Up/Down arrows to move between rows; Esc to close.
        </p>
      ) : null}
    </section>
  );
}

export { LogQueryResultPanel };