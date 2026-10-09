// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { describe, expect, it } from "vitest";

import {
  GCP_CREATE_HINTS,
  gcpFilterEmpty,
  gcpObjectEmptyCopy,
  gcpProjectEmpty,
  gcpTableEmptyCopy,
} from "./gcp-empty-copy";

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

describe("gcpTableEmptyCopy", () => {
  it("says the list failed when the project returned no rows", () => {
    expect(
      gcpTableEmptyCopy({
        resourceLabel: "buckets",
        createHint: "Create one.",
        rowCount: 0,
        listFailed: true,
      }).title,
    ).toBe("Could not list buckets");
  });

  it("says the project is empty only after a successful list", () => {
    expect(
      gcpTableEmptyCopy({
        resourceLabel: "buckets",
        createHint: "Create one.",
        rowCount: 0,
        listFailed: false,
      }),
    ).toEqual({
      title: "No buckets in this project",
      description: "Create one.",
    });
  });

  it("keeps a filter explanation when rows exist but none match", () => {
    expect(
      gcpTableEmptyCopy({
        resourceLabel: "instances",
        createHint: "Create one.",
        rowCount: 2,
        listFailed: true,
      }).title,
    ).toBe("No instances match the filter");
  });
});

describe("gcpObjectEmptyCopy", () => {
  it("says the object list failed even when the bucket warning comes first", () => {
    expect(
      gcpObjectEmptyCopy(
        0,
        "Could not refresh the live list. Showing 1 cached Cloud Storage bucket(s).\nCould not list objects in alpha.",
      ).title,
    ).toBe("Could not list objects");
  });

  it("says the folder is empty when the object list succeeded", () => {
    expect(gcpObjectEmptyCopy(0, "This folder is empty in alpha.").title).toBe("This folder is empty");
  });

  it("says nothing matched when objects are loaded", () => {
    expect(gcpObjectEmptyCopy(2, "Could not list objects in alpha.").title).toBe(
      "No objects match the filter",
    );
  });
});
