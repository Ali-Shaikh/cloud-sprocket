// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { describe, expect, it } from "vitest";

import { nextTrapIndex } from "./focus-trap";

describe("nextTrapIndex", () => {
  it("returns -1 when there are no focusable elements", () => {
    expect(nextTrapIndex(0, 0, false)).toBe(-1);
    expect(nextTrapIndex(0, -1, true)).toBe(-1);
  });

  it("wraps forward from the last item to the first", () => {
    expect(nextTrapIndex(3, 2, false)).toBe(0);
  });

  it("wraps backward from the first item to the last", () => {
    expect(nextTrapIndex(3, 0, true)).toBe(2);
  });

  it("moves one step within the middle of the list", () => {
    expect(nextTrapIndex(4, 1, false)).toBe(2);
    expect(nextTrapIndex(4, 2, true)).toBe(1);
  });

  it("picks an end when focus is outside the trap", () => {
    expect(nextTrapIndex(3, -1, false)).toBe(0);
    expect(nextTrapIndex(3, -1, true)).toBe(2);
  });
});
