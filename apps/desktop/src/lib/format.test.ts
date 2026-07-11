// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { describe, expect, it } from "vitest";

import { formatTimestamp } from "./format";

describe("formatTimestamp", () => {
  it.each([
    ["2026-04-14T09:12:00Z", "14 Apr 2026, 09:12"],
    ["2026-04-14T13:12:00+04:00", "14 Apr 2026, 09:12"],
  ])("formats %s in British UTC form", (input, expected) => {
    expect(formatTimestamp(input)).toBe(expected);
  });

  it.each(["not-a-date", ""])("returns invalid input unchanged", (input) => {
    expect(formatTimestamp(input)).toBe(input);
  });
});
