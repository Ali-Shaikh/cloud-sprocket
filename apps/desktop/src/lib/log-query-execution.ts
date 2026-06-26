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

export type KqlQueryNormalisation = {
  query: string;
  warnings: string[];
};

export const KQL_PAGE_SIZE_OPTIONS = [25, 50, 100, 250, 500, 1000] as const;

type TableInferenceRule = {
  table: string;
  patterns: RegExp[];
  minMatches: number;
};

/** Common App Insights / Log Analytics tables inferred from column references. */
const TABLE_INFERENCE_RULES: TableInferenceRule[] = [
  {
    table: "dependencies",
    patterns: [
      /\btarget\b/i,
      /\bresultcode\b/i,
      /\bdependencytype\b/i,
      /\bdurationms\b/i,
      /\bduration\b/i,
      /\bcloud_rolename\b/i,
      /\boperation_name\b/i,
    ],
    minMatches: 2,
  },
  {
    table: "requests",
    patterns: [/\burl\b/i, /\bresultcode\b/i, /\boperation_name\b/i, /\bcloud_rolename\b/i],
    minMatches: 2,
  },
  {
    table: "exceptions",
    patterns: [/\bproblemid\b/i, /\boutermessage\b/i, /\binnermostmessage\b/i, /\btype\b/i],
    minMatches: 2,
  },
  {
    table: "AzureDiagnostics",
    patterns: [/\bcategory\b/i, /\bresourceprovider\b/i, /\boperationname_s\b/i],
    minMatches: 2,
  },
  {
    table: "AppServiceHTTPLogs",
    patterns: [/\bhttpstatus\b/i, /\bcsuri\b/i, /\bcshost\b/i, /\btimetaken\b/i],
    minMatches: 2,
  },
];

/** Legacy portal column aliases mapped to workspace table names. */
const COLUMN_ALIASES: Record<string, Record<string, string>> = {
  dependencies: {
    timestamp: "TimeGenerated",
    duration: "DurationMs",
  },
  requests: {
    timestamp: "TimeGenerated",
    duration: "DurationMs",
  },
  exceptions: {
    timestamp: "TimeGenerated",
  },
};

/** Strip project/summarize/order clauses so a new summarize can run on raw columns. */
export function stripAggregateIncompatibleClauses(query: string): string {
  const match = query.match(/\n\|\s*(project|summarize|order\s+by)\b/i);
  if (!match || match.index == null) {
    return query.trim();
  }
  return query.slice(0, match.index).trim();
}

function countPatternMatches(query: string, patterns: RegExp[]): number {
  return patterns.reduce((count, pattern) => (pattern.test(query) ? count + 1 : count), 0);
}

function inferKqlTable(query: string): string | null {
  let best: { table: string; score: number } | null = null;
  for (const rule of TABLE_INFERENCE_RULES) {
    const score = countPatternMatches(query, rule.patterns);
    if (score < rule.minMatches) {
      continue;
    }
    if (!best || score > best.score) {
      best = { table: rule.table, score };
    }
  }
  return best?.table ?? null;
}

function firstTableName(query: string): string | null {
  const firstLine = query.trim().split(/\r?\n/, 1)[0]?.trim() ?? "";
  if (!firstLine || firstLine.startsWith("|")) {
    return null;
  }
  const match = firstLine.match(/^([A-Za-z_][\w]*)$/);
  return match?.[1] ?? null;
}

function normaliseColumnAliases(query: string, table: string | null): { query: string; warnings: string[] } {
  const aliases = table ? COLUMN_ALIASES[table] : undefined;
  if (!aliases) {
    return { query, warnings: [] };
  }

  let nextQuery = query;
  const warnings: string[] = [];
  for (const [alias, column] of Object.entries(aliases)) {
    const pattern = new RegExp(`\\b${alias}\\b`, "gi");
    if (!pattern.test(nextQuery)) {
      continue;
    }
    nextQuery = nextQuery.replace(pattern, column);
    warnings.push(`Mapped column "${alias}" to "${column}" for the ${table} table.`);
  }
  return { query: nextQuery, warnings };
}

function ensureTablePrefix(query: string): { query: string; warnings: string[] } {
  const trimmed = query.trim();
  if (!trimmed.startsWith("|")) {
    return { query: trimmed, warnings: [] };
  }

  const inferred = inferKqlTable(trimmed);
  if (!inferred) {
    return {
      query: trimmed,
      warnings: [
        'Query starts with "|" but has no table name. Add a table on the first line (e.g. dependencies).',
      ],
    };
  }

  return {
    query: `${inferred}\n${trimmed}`,
    warnings: [`Prepended table "${inferred}" inferred from column references.`],
  };
}

/**
 * Normalises portal-style KQL for Log Analytics execution: infers a missing table
 * prefix and maps common legacy column aliases to workspace schema names.
 */
/** Hard validation error when a query cannot be executed as written. */
export function validateLogAnalyticsQuery(query: string): string | null {
  const trimmed = query.trim();
  if (!trimmed) {
    return "A KQL query is required.";
  }
  if (trimmed.startsWith("|") && !inferKqlTable(trimmed)) {
    return 'Query starts with "|" but has no table name. Add a table on the first line (e.g. dependencies).';
  }
  return null;
}

/** Warn when both the UI time picker and an in-query time filter are active. */
export function detectDuplicateTimespan(query: string, timespan: string): string | null {
  if (!timespan.trim()) {
    return null;
  }
  if (/\bago\s*\(/i.test(query) || /\bTimeGenerated\s*>/i.test(query) || /\btimestamp\s*>/i.test(query)) {
    return "Query contains a time filter and a UI time range is also set. Consider using one or the other.";
  }
  return null;
}

export function normaliseLogAnalyticsQuery(query: string): KqlQueryNormalisation {
  const withTable = ensureTablePrefix(query);
  const table = firstTableName(withTable.query) ?? inferKqlTable(withTable.query);
  const withColumns = normaliseColumnAliases(withTable.query, table);
  return {
    query: withColumns.query,
    warnings: [...withTable.warnings, ...withColumns.warnings],
  };
}

export function isAggregateKqlQuery(query: string): boolean {
  return /\|\s*summarize\b/i.test(query);
}

/** First summarize alias (e.g. calls=count()) used as a default order column. */
export function inferSummarizeOrderColumn(query: string): string {
  const summarizeMatch = query.match(/\|\s*summarize\b([\s\S]*?)(?:\n\||$)/i);
  if (!summarizeMatch) {
    return "count_";
  }
  const aliasMatch = summarizeMatch[1]?.match(/\b([A-Za-z_][\w]*)\s*=/);
  return aliasMatch?.[1] ?? "count_";
}

function defaultOrderColumn(query: string, explicit?: string): string {
  const trimmed = explicit?.trim();
  if (trimmed) {
    return trimmed;
  }
  if (isAggregateKqlQuery(query)) {
    return inferSummarizeOrderColumn(query);
  }
  return "TimeGenerated";
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
    const orderColumn = defaultOrderColumn(query, options.orderColumn);
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