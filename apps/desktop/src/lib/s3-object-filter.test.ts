// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { describe, expect, it } from "vitest";

import {
  filterObjectsByKeyQuery,
  s3EntryDisplayName,
  s3ObjectListSummary,
} from "./s3-object-filter";

describe("filterObjectsByKeyQuery", () => {
  const objects = [
    { key: "reports/weekly-summary.json" },
    { key: "logs/app.log" },
    { key: "images/logo.png" },
    { key: "archive/reports/old.json" },
  ];

  it("returns all objects when the query is blank", () => {
    expect(filterObjectsByKeyQuery(objects, "  ")).toEqual(objects);
  });

  it("matches keys containing the query anywhere, not only as a prefix", () => {
    expect(filterObjectsByKeyQuery(objects, "report").map((o) => o.key)).toEqual([
      "reports/weekly-summary.json",
      "archive/reports/old.json",
    ]);
  });

  it("is case-insensitive", () => {
    expect(filterObjectsByKeyQuery(objects, "LOGO").map((o) => o.key)).toEqual([
      "images/logo.png",
    ]);
  });
});

describe("s3ObjectListSummary", () => {
  it("describes filtered windows clearly", () => {
    expect(s3ObjectListSummary(500, 12, true)).toBe("12 of 500 loaded");
    expect(s3ObjectListSummary(3, 3, false)).toBe("3 objects");
    expect(s3ObjectListSummary(0, 0, false)).toBe("0 objects");
  });
});

describe("s3EntryDisplayName", () => {
  it("strips the current folder prefix for display", () => {
    expect(s3EntryDisplayName("reports/2026/file.json", "reports/")).toBe("2026/file.json");
    expect(s3EntryDisplayName("reports/", "")).toBe("reports");
  });
});
