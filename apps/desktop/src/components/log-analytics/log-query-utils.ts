// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import type { AzureLogQueryResult } from "@/types/backend";

/** Escape a single CSV cell per RFC 4180-style quoting rules. */
export function csvEscapeCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function resultToCsv(columns: string[], rows: string[][]): string {
  const header = columns.map(csvEscapeCell).join(",");
  const body = rows.map((row) => row.map(csvEscapeCell).join(",")).join("\n");
  return body ? `${header}\n${body}` : header;
}

export function rowToRecord(columns: string[], row: string[]): Record<string, string> {
  const record: Record<string, string> = {};
  columns.forEach((column, index) => {
    record[column] = row[index] ?? "";
  });
  return record;
}

const EMPTY_CELL_VALUES = new Set(["", "none", "null", "n/a", "na", "-"]);

/** True when a Log Analytics cell carries no useful value (None, empty, etc.). */
export function isPopulatedCellValue(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }
  return !EMPTY_CELL_VALUES.has(trimmed.toLowerCase());
}

export type PopulatedField = {
  column: string;
  value: string;
};

export function populatedRowFields(columns: string[], row: string[]): PopulatedField[] {
  const fields: PopulatedField[] = [];
  columns.forEach((column, index) => {
    const value = row[index] ?? "";
    if (isPopulatedCellValue(value)) {
      fields.push({ column, value });
    }
  });
  return fields;
}

export function rowToRecordPopulated(columns: string[], row: string[]): Record<string, string> {
  const record: Record<string, string> = {};
  populatedRowFields(columns, row).forEach(({ column, value }) => {
    record[column] = value;
  });
  return record;
}

export function resultToJson(columns: string[], rows: string[][]): string {
  const records = rows.map((row) => rowToRecord(columns, row));
  return JSON.stringify(records, null, 2);
}

export type FormattedCell = {
  kind: "json" | "text";
  display: string;
};

/** Pretty-print JSON-looking cell values; fall back to raw text. */
export function formatCellValue(value: string): FormattedCell {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      return { kind: "json", display: JSON.stringify(JSON.parse(trimmed), null, 2) };
    } catch {
      // Not valid JSON; show raw text below.
    }
  }
  return { kind: "text", display: value };
}

export function downloadTextFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function sortRows(
  columns: string[],
  rows: string[][],
  sortColumn: string | null,
  sortDirection: "asc" | "desc" | null,
): string[][] {
  if (!sortColumn || !sortDirection) {
    return rows;
  }
  const columnIndex = columns.indexOf(sortColumn);
  if (columnIndex < 0) {
    return rows;
  }
  const sorted = [...rows];
  sorted.sort((left, right) => {
    const leftValue = left[columnIndex] ?? "";
    const rightValue = right[columnIndex] ?? "";
    const comparison = leftValue.localeCompare(rightValue, undefined, {
      numeric: true,
      sensitivity: "base",
    });
    return sortDirection === "asc" ? comparison : -comparison;
  });
  return sorted;
}

export function visibleColumns(
  columns: string[],
  hidden: ReadonlySet<string>,
): string[] {
  return columns.filter((column) => !hidden.has(column));
}

export function projectRow(row: string[], columns: string[], visible: string[]): string[] {
  return visible.map((column) => {
    const index = columns.indexOf(column);
    return index >= 0 ? (row[index] ?? "") : "";
  });
}

export function summariseResult(result: AzureLogQueryResult | null): {
  rowCount: number;
  columnCount: number;
} {
  return {
    rowCount: result?.rows.length ?? 0,
    columnCount: result?.columns.length ?? 0,
  };
}