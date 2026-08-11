// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useRef, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type ResourceTableColumn = {
  id: string;
  label: string;
  headerClassName?: string;
  cellClassName?: string;
};

export type ResourceTableProps<TRow> = {
  columns: ResourceTableColumn[];
  rows: TRow[];
  getRowKey: (row: TRow) => string;
  selectedKey?: string;
  onRowClick?: (row: TRow) => void;
  renderCell: (row: TRow, columnId: string) => ReactNode;
  getCellTitle?: (row: TRow, columnId: string) => string | undefined;
  renderTrailingCell?: (row: TRow) => ReactNode;
  emptyState: ReactNode;
  tableClassName?: string;
  rowClassName?: string;
  /** Scroll viewport height when virtualising large lists. */
  maxHeightClassName?: string;
};

const VIRTUALIZE_THRESHOLD = 60;
const ROW_HEIGHT_PX = 44;

/**
 * Shared inventory table shell: bordered card, column headers, row selection state,
 * and an empty-state slot. Large row sets virtualise for responsiveness.
 */
export function ResourceTable<TRow>({
  columns,
  rows,
  getRowKey,
  selectedKey,
  onRowClick,
  renderCell,
  getCellTitle,
  renderTrailingCell,
  emptyState,
  tableClassName,
  rowClassName,
  maxHeightClassName = "max-h-[28rem]",
}: ResourceTableProps<TRow>) {
  const parentRef = useRef<HTMLDivElement>(null);
  const shouldVirtualize = rows.length > VIRTUALIZE_THRESHOLD;
  const rowVirtualizer = useVirtualizer({
    count: shouldVirtualize ? rows.length : 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT_PX,
    overscan: 12,
  });

  if (rows.length === 0) {
    return (
      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        {emptyState}
      </div>
    );
  }

  const colCount = columns.length + (renderTrailingCell ? 1 : 0);

  const renderRow = (row: TRow) => {
    const rowKey = getRowKey(row);
    const active = rowKey === selectedKey;
    return (
      <TableRow
        key={rowKey}
        data-state={active ? "selected" : undefined}
        aria-selected={onRowClick ? active : undefined}
        tabIndex={onRowClick ? 0 : undefined}
        className={cn(
          onRowClick
            ? "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            : undefined,
          rowClassName,
        )}
        onClick={
          onRowClick
            ? () => {
                onRowClick(row);
              }
            : undefined
        }
        onKeyDown={
          onRowClick
            ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onRowClick(row);
                }
              }
            : undefined
        }
      >
        {columns.map((column) => (
          <TableCell
            key={column.id}
            className={column.cellClassName}
            title={getCellTitle?.(row, column.id)}
          >
            {renderCell(row, column.id)}
          </TableCell>
        ))}
        {renderTrailingCell ? <TableCell>{renderTrailingCell(row)}</TableCell> : null}
      </TableRow>
    );
  };

  if (!shouldVirtualize) {
    return (
      <div className={cn("overflow-x-auto rounded-lg border border-border bg-card shadow-sm", maxHeightClassName, "overflow-y-auto")}>
        <Table className={cn("w-full", tableClassName)}>
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow>
              {columns.map((column) => (
                <TableHead key={column.id} className={column.headerClassName}>
                  {column.label}
                </TableHead>
              ))}
              {renderTrailingCell ? <TableHead className="w-20" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>{rows.map((row) => renderRow(row))}</TableBody>
        </Table>
      </div>
    );
  }

  const virtualItems = rowVirtualizer.getVirtualItems();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom =
    virtualItems.length > 0
      ? rowVirtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end
      : 0;

  return (
    <div
      ref={parentRef}
      className={cn(
        "overflow-auto rounded-lg border border-border bg-card shadow-sm",
        maxHeightClassName,
      )}
    >
      <Table className={cn("w-full", tableClassName)}>
        <TableHeader className="sticky top-0 z-10 bg-card">
          <TableRow>
            {columns.map((column) => (
              <TableHead key={column.id} className={column.headerClassName}>
                {column.label}
              </TableHead>
            ))}
            {renderTrailingCell ? <TableHead className="w-20" /> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {paddingTop > 0 ? (
            <tr aria-hidden>
              <td colSpan={colCount} style={{ height: paddingTop, padding: 0, border: 0 }} />
            </tr>
          ) : null}
          {virtualItems.map((virtualRow) => renderRow(rows[virtualRow.index]))}
          {paddingBottom > 0 ? (
            <tr aria-hidden>
              <td colSpan={colCount} style={{ height: paddingBottom, padding: 0, border: 0 }} />
            </tr>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}
