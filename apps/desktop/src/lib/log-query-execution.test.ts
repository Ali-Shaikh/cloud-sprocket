// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { describe, expect, it } from "vitest";

import {
  buildExecutableKqlQuery,
  kqlQueryHasNextPage,
  trimKqlQueryPageRows,
} from "./log-query-execution";

const baseQuery = `AppEvents
| where Level == "Error"`;

describe("log-query-execution", () => {
  it("appends order and take for the first page", () => {
    const built = buildExecutableKqlQuery(baseQuery, { page: 1, pageSize: 50 });
    expect(built.query).toContain("| order by TimeGenerated desc");
    expect(built.query).toContain("| take 51");
    expect(built.maxRows).toBe(51);
    expect(built.pageSize).toBe(50);
  });

  it("uses serialize pagination for later pages", () => {
    const built = buildExecutableKqlQuery(baseQuery, { page: 3, pageSize: 25 });
    expect(built.query).toContain("| serialize");
    expect(built.query).toContain("RowNum > 50 and RowNum <= 76");
    expect(built.maxRows).toBe(26);
  });

  it("detects and trims probe rows", () => {
    expect(kqlQueryHasNextPage(51, 50)).toBe(true);
    expect(trimKqlQueryPageRows(["a", "b", "c"], 2)).toEqual(["a", "b"]);
  });

  it("respects an existing order clause", () => {
    const orderedQuery = `${baseQuery}
| order by TimeGenerated asc`;
    const built = buildExecutableKqlQuery(orderedQuery, { page: 1, pageSize: 100 });
    expect(built.query.match(/\|\s*order\s+by\b/gi)?.length).toBe(1);
  });
});