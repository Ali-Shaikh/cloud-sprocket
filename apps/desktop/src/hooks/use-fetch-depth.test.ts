// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useFetchDepth } from "./use-fetch-depth";

describe("useFetchDepth", () => {
  it("stays loading until all overlapping fetches complete", () => {
    const { result } = renderHook(() => useFetchDepth());

    expect(result.current.loading).toBe(false);

    act(() => {
      result.current.begin();
    });
    expect(result.current.loading).toBe(true);

    act(() => {
      result.current.begin();
    });
    expect(result.current.loading).toBe(true);

    act(() => {
      result.current.end();
    });
    expect(result.current.loading).toBe(true);

    act(() => {
      result.current.end();
    });
    expect(result.current.loading).toBe(false);
  });
});