// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { describe, expect, it } from "vitest";

import { s3BucketEmptyCopy, s3ObjectEmptyCopy } from "./s3-empty-copy";

describe("s3 empty-state copy", () => {
  it("says the bucket list failed instead of saying the account is empty", () => {
    expect(s3BucketEmptyCopy(0, "Could not list S3 buckets.\nDetail: access denied").title).toBe(
      "Could not list buckets",
    );
  });

  it("says the account is empty only after a successful list", () => {
    expect(
      s3BucketEmptyCopy(0, "No buckets are currently available for this AWS workspace.").title,
    ).toBe("No buckets discovered");
  });

  it("says the object list failed even when a cached bucket warning comes first", () => {
    expect(
      s3ObjectEmptyCopy({
        loadedCount: 0,
        searchActive: false,
        status:
          "Could not refresh the live list. Showing 1 cached bucket(s).\nCould not list objects in alpha.",
        searchDescription: "unused",
      }).title,
    ).toBe("Could not list objects");
  });

  it("says the folder is empty when the object list succeeded", () => {
    expect(
      s3ObjectEmptyCopy({
        loadedCount: 0,
        searchActive: false,
        status: "This folder is empty in alpha.",
        searchDescription: "unused",
      }).title,
    ).toBe("Empty folder");
  });

  it("keeps the name filter explanation when objects are loaded", () => {
    expect(
      s3ObjectEmptyCopy({
        loadedCount: 2,
        searchActive: true,
        status: "Could not list objects in alpha.",
        searchDescription: "No loaded names contain “report”.",
      }),
    ).toEqual({
      title: "No matching names",
      description: "No loaded names contain “report”.",
    });
  });
});
