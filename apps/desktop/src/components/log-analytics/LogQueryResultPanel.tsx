import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Columns3,
  Copy,
  Download,
  Table2,
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

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import type { AzureLogQueryResult } from "@/types/backend";
import {
  downloadTextFile,
  formatCellValue,
  projectRow,
  resultToCsv,
  resultToJson,
  rowToRecord,
  sortRows,
  visibleColumns,
} from "./log-query-utils";

export type LogQueryResultPanelProps = {
  result: AzureLogQueryResult | null;
  error?: string | null;
  timeRangeLabel?: string;
  emptyTitle?: string;
  emptyDescription?: string;
};

type SortDirection = "asc" | "desc" | null;

function copyToClipboard(value: string, label = "Copied to clipboard"): void {
  if (!navigator.clipboard) {
    return;
  }
  void navigator.clipboard.writeText(value).then(() => {
    notify("success", label);
  });
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

function LogQueryRowDrawer({
  open,
  columns,
  row,
  rowIndex,
  rowCount,
  onOpenChange,
  onSelectRowIndex,
}: {
  open: boolean;
  columns: string[];
  row: string[] | null;
  rowIndex: number;
  rowCount: number;
  onOpenChange: (open: boolean) => void;
  onSelectRowIndex: (index: number) => void;
}) {
  useEffect(() => {
    if (!open) {
      return;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onOpenChange(false);
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
  }, [open, onOpenChange, onSelectRowIndex, rowCount, rowIndex]);

  if (!row) {
    return null;
  }

  const rowJson = JSON.stringify(rowToRecord(columns, row), null, 2);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        aria-label="Query result row details"
        className="w-full gap-0 overflow-y-auto p-0 sm:max-w-lg"
      >
        <SheetHeader className="border-b border-border px-6 py-4">
          <SheetTitle>Row {rowIndex + 1} of {rowCount}</SheetTitle>
          <SheetDescription>
            Full values for every column. Use Up/Down to move between rows; Esc to close.
          </SheetDescription>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => copyToClipboard(rowJson, "Row copied as JSON")}
            >
              <Copy />
              Copy row as JSON
            </Button>
          </div>
        </SheetHeader>
        <div className="space-y-3 px-6 py-4">
          {columns.map((column, columnIndex) => {
            const value = row[columnIndex] ?? "";
            const formatted = formatCellValue(value);
            return (
              <div
                key={`${column}-${columnIndex}`}
                className="rounded-lg border border-border bg-muted/30 px-3 py-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {column}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 shrink-0"
                    aria-label={`Copy ${column}`}
                    onClick={() => copyToClipboard(value, `${column} copied`)}
                  >
                    <Copy className="size-3.5" />
                  </Button>
                </div>
                {formatted.kind === "json" ? (
                  <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all font-mono text-xs text-foreground">
                    {formatted.display}
                  </pre>
                ) : formatted.display ? (
                  <p className="mt-2 whitespace-pre-wrap break-all font-mono text-xs text-foreground">
                    {formatted.display}
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">(empty)</p>
                )}
              </div>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function LogQueryResultPanel({
  result,
  error = null,
  timeRangeLabel = "All time",
  emptyTitle = "No results yet",
  emptyDescription = "Run a KQL query to see results here.",
}: LogQueryResultPanelProps) {
  const [wrapCells, setWrapCells] = useState(false);
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(() => new Set());
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const columns = result?.columns ?? [];
  const rows = result?.rows ?? [];

  useEffect(() => {
    setHiddenColumns(new Set());
    setSortColumn(null);
    setSortDirection(null);
    setSelectedRowIndex(null);
    setDrawerOpen(false);
  }, [result]);

  const shownColumns = useMemo(
    () => visibleColumns(columns, hiddenColumns),
    [columns, hiddenColumns],
  );

  const displayRows = useMemo(
    () => sortRows(columns, rows, sortColumn, sortDirection),
    [columns, rows, sortColumn, sortDirection],
  );

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
    setSelectedRowIndex(rowIndex);
    setDrawerOpen(true);
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

  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-[18px] shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold">Results</h2>
          {hasResult ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {rows.length} row{rows.length === 1 ? "" : "s"} · {columns.length} column
              {columns.length === 1 ? "" : "s"}
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

        {hasRows && hasColumns ? (
          <div className="flex flex-wrap items-center gap-2">
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
          </div>
        ) : null}
      </div>

      <div className="max-h-[min(70vh,640px)] overflow-auto rounded-lg border border-border">
        {hasRows && shownColumns.length > 0 ? (
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow>
                {shownColumns.map((column) => (
                  <TableHead key={column} className="whitespace-nowrap bg-card">
                    <button
                      type="button"
                      className="inline-flex items-center font-semibold hover:text-foreground"
                      onClick={() => toggleSort(column)}
                    >
                      {column}
                      {sortIcon(column, sortColumn, sortDirection)}
                    </button>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayRows.map((row, rowIndex) => (
                <TableRow
                  key={rowIndex}
                  className={cn(
                    "cursor-pointer hover:bg-muted/50",
                    selectedRowIndex === rowIndex && drawerOpen && "bg-muted/60",
                  )}
                  onClick={() => openRow(rowIndex)}
                >
                  {projectRow(row, columns, shownColumns).map((cell, cellIndex) => (
                    <TableCell
                      key={`${rowIndex}-${cellIndex}`}
                      title={cell}
                      className={cn(
                        "max-w-[320px] font-mono text-xs",
                        wrapCells
                          ? "whitespace-pre-wrap break-all"
                          : "truncate",
                      )}
                    >
                      {cell}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
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

      <LogQueryRowDrawer
        open={drawerOpen}
        columns={columns}
        row={selectedRow}
        rowIndex={selectedRowIndex ?? 0}
        rowCount={displayRows.length}
        onOpenChange={setDrawerOpen}
        onSelectRowIndex={(index) => {
          setSelectedRowIndex(index);
          setDrawerOpen(true);
        }}
      />
    </section>
  );
}

export { LogQueryResultPanel };