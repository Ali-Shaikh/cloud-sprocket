// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { describe, expect, it } from "vitest";

import {
  buildExecutableKqlQuery,
  detectDuplicateTimespan,
  inferSummarizeOrderColumn,
  isAggregateKqlQuery,
  kqlQueryHasNextPage,
  normaliseLogAnalyticsQuery,
  trimKqlQueryPageRows,
  validateLogAnalyticsQuery,
} from "./log-query-execution";

const baseQuery = `AppEvents
| where Level == "Error"`;

const dependenciesPortalQuery = `| where timestamp > ago(24h)
| where cloud_RoleName has "frontend"
| where target has "erw-dev-admin"
   or data has "erw-dev-admin"
   or data has "/api/public/"
| summarize calls=count(), failures=countif(success == false), avgMs=avg(duration)
  by target, name, resultCode
| order by calls desc`;

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

  it("orders aggregate queries by the first summarize alias", () => {
    const aggregateQuery = `dependencies
| summarize calls=count() by target`;
    const built = buildExecutableKqlQuery(aggregateQuery, { page: 1, pageSize: 50 });
    expect(built.query).toContain("| order by calls desc");
    expect(built.query).not.toContain("TimeGenerated");
  });

  it("detects aggregate queries and summarize aliases", () => {
    expect(isAggregateKqlQuery(dependenciesPortalQuery)).toBe(true);
    expect(inferSummarizeOrderColumn(dependenciesPortalQuery)).toBe("calls");
  });

  it("prepends dependencies and maps legacy columns for portal-style queries", () => {
    const normalised = normaliseLogAnalyticsQuery(dependenciesPortalQuery);
    expect(normalised.query).toMatch(/^dependencies\n\|/);
    expect(normalised.query).toContain("TimeGenerated > ago(24h)");
    expect(normalised.query).toContain("avg(DurationMs)");
    expect(normalised.query).not.toContain("timestamp");
    expect(normalised.warnings.some((warning) => warning.includes('Prepended table "dependencies"'))).toBe(
      true,
    );
    expect(normalised.warnings.some((warning) => warning.includes("TimeGenerated"))).toBe(true);
    expect(normalised.warnings.some((warning) => warning.includes("DurationMs"))).toBe(true);
  });

  it("warns when a table cannot be inferred", () => {
    const normalised = normaliseLogAnalyticsQuery("| where Foo == 1");
    expect(normalised.query).toBe("| where Foo == 1");
    expect(normalised.warnings[0]).toContain("no table name");
  });

  it("blocks queries that cannot be inferred", () => {
    expect(validateLogAnalyticsQuery("| where Foo == 1")).toContain("no table name");
    expect(validateLogAnalyticsQuery("dependencies | take 5")).toBeNull();
  });

  it("warns when UI and query time filters overlap", () => {
    expect(
      detectDuplicateTimespan("dependencies | where TimeGenerated > ago(1h)", "P1D"),
    ).toContain("time filter");
  });
});