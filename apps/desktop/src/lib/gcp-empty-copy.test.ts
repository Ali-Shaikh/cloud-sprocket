// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { describe, expect, it } from "vitest";

import { GCP_CREATE_HINTS, gcpFilterEmpty, gcpProjectEmpty } from "./gcp-empty-copy";

describe("gcp empty-state copy", () => {
  it("builds project-empty and filter-empty messages", () => {
    expect(gcpProjectEmpty("buckets", GCP_CREATE_HINTS.buckets)).toEqual({
      title: "No buckets in this project",
      description: GCP_CREATE_HINTS.buckets,
    });
    expect(gcpFilterEmpty("instances")).toEqual({
      title: "No instances match the filter",
      description: "Clear the filter to see the full inventory.",
    });
  });
});
