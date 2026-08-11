// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { describe, expect, it } from "vitest";

import { applyDeferredNavCount } from "./use-app-shell-navigation";

describe("applyDeferredNavCount", () => {
  const base = { id: "azure-storage", label: "Storage", count: 0 };

  it("keeps the count when inventory is already loaded", () => {
    expect(
      applyDeferredNavCount({ ...base, count: 3 }, { loaded: true, active: false, loading: false }),
    ).toEqual({ ...base, count: 3 });
  });

  it("shows a refresh affordance instead of 0 when not loaded", () => {
    expect(
      applyDeferredNavCount(base, { loaded: false, active: false, loading: false }),
    ).toEqual({
      ...base,
      count: undefined,
      countLoading: false,
      countRefreshable: true,
    });
  });

  it("shows a spinner when the active tab is loading deferred inventory", () => {
    expect(
      applyDeferredNavCount(base, { loaded: false, active: true, loading: true }),
    ).toEqual({
      ...base,
      count: undefined,
      countLoading: true,
      countRefreshable: false,
    });
  });
});
