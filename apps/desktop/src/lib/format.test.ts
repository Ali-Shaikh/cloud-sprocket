// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { describe, expect, it } from "vitest";

import { formatEpochMillis, formatEpochSeconds, formatTimestamp } from "./format";

describe("formatTimestamp", () => {
  it.each([
    ["2026-04-14T09:12:00Z", "14 Apr 2026, 09:12 UTC"],
    ["2026-04-14T13:12:00+04:00", "14 Apr 2026, 09:12 UTC"],
  ])("formats %s in British UTC form", (input, expected) => {
    expect(formatTimestamp(input)).toBe(expected);
  });

  it.each(["not-a-date", ""])("returns invalid input unchanged", (input) => {
    expect(formatTimestamp(input)).toBe(input);
  });
});

describe("formatEpochSeconds", () => {
  it("formats SQS-style epoch seconds", () => {
    expect(formatEpochSeconds(1_776_157_920)).toBe("14 Apr 2026, 09:12 UTC");
  });

  it.each([undefined, 0, -1, Number.NaN])("returns Unknown for %s", (input) => {
    expect(formatEpochSeconds(input)).toBe("Unknown");
  });
});

describe("formatEpochMillis", () => {
  it("formats CloudWatch-style epoch millis", () => {
    expect(formatEpochMillis(1_776_157_920_000)).toBe("14 Apr 2026, 09:12 UTC");
  });

  it.each([undefined, 0, -1, Number.NaN])("returns Unknown for %s", (input) => {
    expect(formatEpochMillis(input)).toBe("Unknown");
  });
});
