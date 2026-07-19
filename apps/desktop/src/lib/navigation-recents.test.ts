// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { describe, expect, it } from "vitest";

import {
  deserialisePins,
  deserialiseRecents,
  mergeRecent,
  orderItemsByPins,
  serialisePins,
  serialiseRecents,
  togglePin,
} from "./navigation-recents";

describe("navigation recents and pins", () => {
  it("merges recents with newest first and dedupes", () => {
    let recents = mergeRecent([], { tabId: "s3", label: "S3" }, 1);
    recents = mergeRecent(recents, { tabId: "lambda", label: "Lambda" }, 2);
    recents = mergeRecent(recents, { tabId: "s3", label: "S3 buckets" }, 3);
    expect(recents.map((entry) => entry.tabId)).toEqual(["s3", "lambda"]);
    expect(recents[0]?.label).toBe("S3 buckets");
    expect(recents[0]?.at).toBe(3);
  });

  it("round-trips recents through JSON", () => {
    const recents = mergeRecent(
      [],
      {
        tabId: "lambda",
        label: "demo-fn",
        focus: { provider: "aws", tab: "lambda", resourceKey: "demo-fn" },
      },
      10,
    );
    const restored = deserialiseRecents(serialiseRecents(recents));
    expect(restored).toEqual(recents);
  });

  it("toggles pins and reorders items", () => {
    expect(togglePin([], "s3")).toEqual(["s3"]);
    expect(togglePin(["s3", "ec2"], "s3")).toEqual(["ec2"]);
    expect(togglePin(["ec2"], "lambda")).toEqual(["lambda", "ec2"]);

    const items = [
      { id: "overview", label: "Overview" },
      { id: "s3", label: "S3" },
      { id: "ec2", label: "EC2" },
      { id: "lambda", label: "Lambda" },
    ];
    expect(orderItemsByPins(items, ["lambda", "s3"]).map((item) => item.id)).toEqual([
      "lambda",
      "s3",
      "overview",
      "ec2",
    ]);
  });

  it("round-trips pins", () => {
    expect(deserialisePins(serialisePins(["s3", "ec2"]))).toEqual(["s3", "ec2"]);
    expect(deserialisePins("not-json")).toEqual([]);
  });
});
