// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { describe, expect, it } from "vitest";

import {
  canGoBack,
  canGoForward,
  createNavigationHistory,
  goBackNavigationHistory,
  goForwardNavigationHistory,
  pushNavigationHistory,
} from "./navigation-history";

describe("navigation history", () => {
  it("pushes and drops forward entries", () => {
    let state = createNavigationHistory({ tabId: "overview", label: "Overview" });
    state = pushNavigationHistory(state, { tabId: "s3", label: "S3" });
    state = pushNavigationHistory(state, { tabId: "lambda", label: "Lambda" });
    expect(state.entries.map((entry) => entry.tabId)).toEqual(["overview", "s3", "lambda"]);
    expect(state.index).toBe(2);

    const back = goBackNavigationHistory(state);
    expect(back.location?.tabId).toBe("s3");
    state = back.state;

    state = pushNavigationHistory(state, { tabId: "ec2", label: "EC2" });
    expect(state.entries.map((entry) => entry.tabId)).toEqual(["overview", "s3", "ec2"]);
    expect(canGoForward(state)).toBe(false);
  });

  it("skips no-op pushes of the same location", () => {
    let state = createNavigationHistory({ tabId: "s3" });
    state = pushNavigationHistory(state, { tabId: "s3" });
    expect(state.entries).toHaveLength(1);
  });

  it("walks back and forward", () => {
    let state = createNavigationHistory({ tabId: "a" });
    state = pushNavigationHistory(state, { tabId: "b" });
    state = pushNavigationHistory(state, { tabId: "c" });
    expect(canGoBack(state)).toBe(true);

    const back = goBackNavigationHistory(state);
    state = back.state;
    expect(back.location?.tabId).toBe("b");
    expect(canGoForward(state)).toBe(true);

    const forward = goForwardNavigationHistory(state);
    expect(forward.location?.tabId).toBe("c");
  });

  it("respects max length", () => {
    let state = createNavigationHistory({ tabId: "0" });
    for (let i = 1; i <= 5; i += 1) {
      state = pushNavigationHistory(state, { tabId: String(i) }, 3);
    }
    expect(state.entries.map((entry) => entry.tabId)).toEqual(["3", "4", "5"]);
    expect(state.index).toBe(2);
  });
});
