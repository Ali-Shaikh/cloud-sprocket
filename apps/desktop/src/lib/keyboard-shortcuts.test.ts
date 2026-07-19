// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { describe, expect, it } from "vitest";

import { cycleTabId } from "./keyboard-shortcuts";

describe("cycleTabId", () => {
  it("cycles forward and wraps", () => {
    expect(cycleTabId(["a", "b", "c"], "b", 1)).toBe("c");
    expect(cycleTabId(["a", "b", "c"], "c", 1)).toBe("a");
  });

  it("cycles backward and wraps", () => {
    expect(cycleTabId(["a", "b", "c"], "a", -1)).toBe("c");
  });

  it("handles empty and unknown active ids", () => {
    expect(cycleTabId([], "a", 1)).toBeNull();
    expect(cycleTabId(["a", "b"], "missing", 1)).toBe("a");
    expect(cycleTabId(["a", "b"], "missing", -1)).toBe("b");
  });
});
