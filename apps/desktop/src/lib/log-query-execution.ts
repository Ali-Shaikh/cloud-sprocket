// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

export type KqlQueryExecutionOptions = {
  page?: number;
  pageSize?: number;
  /** Column used for default `order by` when the query has no existing order clause. */
  orderColumn?: string;
  /** When true, skip appending a default order clause. */
  skipOrder?: boolean;
};

export const KQL_PAGE_SIZE_OPTIONS = [25, 50, 100, 250, 500, 1000] as const;

/** Strip project/summarize/order clauses so a new summarize can run on raw columns. */
export function stripAggregateIncompatibleClauses(query: string): string {
  const match = query.match(/\n\|\s*(project|summarize|order\s+by)\b/i);
  if (!match || match.index == null) {
    return query.trim();
  }
  return query.slice(0, match.index).trim();
}

function appendOrderClause(query: string, orderColumn: string): string {
  if (/\|\s*order\s+by\b/i.test(query)) {
    return query;
  }
  return `${query}\n| order by ${orderColumn} desc`;
}

export function appendPageClause(
  query: string,
  page: number,
  pageSize: number,
  fetchSize: number,
): string {
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
 * Applies ordering and server-side pagination to a base KQL query.
 * Returns the KQL to send to Log Analytics and the row cap to pass as maxRows.
 */
export function buildExecutableKqlQuery(
  baseQuery: string,
  options: KqlQueryExecutionOptions = {},
): { query: string; maxRows: number; pageSize: number } {
  const trimmed = baseQuery.trim();
  if (!trimmed) {
    return { query: "", maxRows: 0, pageSize: 0 };
  }

  const pageSize = Math.max(1, options.pageSize ?? 100);
  const page = Math.max(1, options.page ?? 1);
  const fetchSize = pageSize + 1;

  let query = trimmed;
  if (!options.skipOrder) {
    const orderColumn = options.orderColumn?.trim() || "TimeGenerated";
    query = appendOrderClause(query, orderColumn);
  }

  query = appendPageClause(query, page, pageSize, fetchSize);

  return { query, maxRows: fetchSize, pageSize };
}

/** Whether another page exists after trimming the probe row from a paged result. */
export function kqlQueryHasNextPage(rowCount: number, pageSize: number): boolean {
  return rowCount > pageSize;
}

/** Trim the extra probe row used to detect further pages. */
export function trimKqlQueryPageRows<T>(rows: T[], pageSize: number): T[] {
  if (rows.length <= pageSize) {
    return rows;
  }
  return rows.slice(0, pageSize);
}