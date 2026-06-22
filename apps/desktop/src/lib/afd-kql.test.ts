// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { describe, expect, it } from "vitest";

import {
  baseAfdAccessTable,
  buildAfdTrackingReferenceSearchQuery,
  buildAfdTopHostsQuery,
} from "./afd-kql";

describe("afd-kql", () => {
  it("filters AzureDiagnostics access logs by category", () => {
    expect(baseAfdAccessTable("azureDiagnostics", "AzureDiagnostics")).toContain(
      'Category == "FrontDoorAccessLog"',
    );
  });

  it("builds host breakdown for resource-specific logs", () => {
    const query = buildAfdTopHostsQuery("resourceSpecific", "AFDAccessLogs");
    expect(query).toContain("AFDAccessLogs");
    expect(query).toContain("HttpHost");
  });

  it("searches by tracking reference", () => {
    const query = buildAfdTrackingReferenceSearchQuery(
      "azureDiagnostics",
      "AzureDiagnostics",
      "abc123",
    );
    expect(query).toContain('trackingReference_s == "abc123"');
  });
});