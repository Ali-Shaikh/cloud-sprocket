// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import type { ReactNode } from "react";

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
};

/**
 * Shared inventory table shell: bordered card, column headers, row selection state,
 * and an empty-state slot. Storage tabs (S3 objects, Azure blobs) share this layout.
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
}: ResourceTableProps<TRow>) {
  if (rows.length === 0) {
    return <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">{emptyState}</div>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
      <Table className={cn("w-full", tableClassName)}>
        <TableHeader>
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
          {rows.map((row) => {
            const rowKey = getRowKey(row);
            const active = rowKey === selectedKey;
            return (
              <TableRow
                key={rowKey}
                data-state={active ? "selected" : undefined}
                className={cn(onRowClick ? "cursor-pointer" : undefined, rowClassName)}
                onClick={
                  onRowClick
                    ? () => {
                        onRowClick(row);
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
          })}
        </TableBody>
      </Table>
    </div>
  );
}