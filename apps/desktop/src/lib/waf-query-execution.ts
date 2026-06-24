// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import type { AzureWafLogSchemaProfile } from "@/types/backend";

export type WafGroupByField =
  | "action"
  | "ruleName"
  | "clientIP"
  | "host"
  | "policyName"
  | "requestUri";

export type WafAggregateMode = "count" | "dcount";

export type WafQueryExecutionOptions = {
  groupByFields?: WafGroupByField[];
  aggregateMode?: WafAggregateMode;
  distinctColumn?: string;
  page?: number;
  pageSize?: number;
};

export type WafGroupByOption = {
  field: WafGroupByField;
  label: string;
  column: string;
};

const GROUP_BY_LABELS: Record<WafGroupByField, string> = {
  action: "Action",
  ruleName: "Rule",
  clientIP: "Client IP",
  host: "Host",
  policyName: "Policy",
  requestUri: "URI",
};

/** Logical WAF fields that can be used in a summarize group-by clause. */
export function wafGroupByOptions(schema: AzureWafLogSchemaProfile): WafGroupByOption[] {
  const columns = schema.columns;
  const entries: Array<[WafGroupByField, string | undefined]> = [
    ["action", columns.action],
    ["ruleName", columns.ruleName],
    ["clientIP", columns.clientIP],
    ["host", columns.host],
    ["policyName", columns.policyName],
    ["requestUri", columns.requestUri],
  ];
  return entries
    .filter(([, column]) => Boolean(column?.trim()))
    .map(([field, column]) => ({
      field,
      label: GROUP_BY_LABELS[field],
      column: column!.trim(),
    }));
}

function resolveGroupColumns(
  schema: AzureWafLogSchemaProfile,
  fields: WafGroupByField[],
): string[] {
  const lookup = new Map(wafGroupByOptions(schema).map((option) => [option.field, option.column]));
  return fields.map((field) => lookup.get(field)).filter((column): column is string => Boolean(column));
}

function defaultOrderColumn(schema: AzureWafLogSchemaProfile): string {
  return schema.columns.timeGenerated?.trim() || "TimeGenerated";
}

function buildSummarizeClause(
  groupColumns: string[],
  aggregateMode: WafAggregateMode,
  distinctColumn?: string,
): string {
  const byClause = groupColumns.join(", ");
  if (aggregateMode === "dcount" && distinctColumn?.trim()) {
    return `| summarize Count=dcount(${distinctColumn.trim()}) by ${byClause}`;
  }
  return `| summarize Count=count() by ${byClause}`;
}

function appendOrderClause(query: string, grouped: boolean, orderColumn: string): string {
  if (/\|\s*order\s+by\b/i.test(query)) {
    return query;
  }
  if (grouped) {
    return `${query}\n| order by Count desc`;
  }
  return `${query}\n| order by ${orderColumn} desc`;
}

function appendPageClause(query: string, page: number, pageSize: number, fetchSize: number): string {
  const safePage = Math.max(1, page);
  const safePageSize = Math.max(1, pageSize);
  const safeFetch = Math.max(1, fetchSize);
  const offset = (safePage - 1) * safePageSize;

  if (offset <= 0) {
    return `${query}\n| take ${safeFetch}`;
  }
  const upperBound = offset + safeFetch;
  return `${query}
| serialize
| extend RowNum=row_number()
| where RowNum > ${offset} and RowNum <= ${upperBound}
| project-away RowNum`;
}

/**
 * Applies group-by, ordering, and server-side pagination to a base KQL query.
 * Returns the KQL to send to Log Analytics and the row cap to pass as maxRows.
 */
export function buildExecutableWafQuery(
  baseQuery: string,
  schema: AzureWafLogSchemaProfile,
  options: WafQueryExecutionOptions = {},
): { query: string; maxRows: number; pageSize: number } {
  const trimmed = baseQuery.trim();
  if (!trimmed) {
    return { query: "", maxRows: 0, pageSize: 0 };
  }

  const pageSize = Math.max(1, options.pageSize ?? 100);
  const page = Math.max(1, options.page ?? 1);
  const fetchSize = pageSize + 1;
  const groupFields = options.groupByFields ?? [];
  const groupColumns = resolveGroupColumns(schema, groupFields);
  const orderColumn = defaultOrderColumn(schema);

  let query = trimmed;
  const grouped = groupColumns.length > 0;
  if (grouped) {
    query = `${query}\n${buildSummarizeClause(
      groupColumns,
      options.aggregateMode ?? "count",
      options.distinctColumn,
    )}`;
  }

  query = appendOrderClause(query, grouped, orderColumn);
  query = appendPageClause(query, page, pageSize, fetchSize);

  return { query, maxRows: fetchSize, pageSize };
}

/** Whether another page exists after trimming the probe row from a paged result. */
export function wafQueryHasNextPage(rowCount: number, pageSize: number): boolean {
  return rowCount > pageSize;
}

/** Trim the extra probe row used to detect further pages. */
export function trimWafQueryPageRows<T>(rows: T[], pageSize: number): T[] {
  if (rows.length <= pageSize) {
    return rows;
  }
  return rows.slice(0, pageSize);
}

export const WAF_PAGE_SIZE_OPTIONS = [25, 50, 100, 250, 500, 1000] as const;