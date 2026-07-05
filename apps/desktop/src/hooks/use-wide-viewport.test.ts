// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useWideViewport, WIDE_VIEWPORT_MIN_PX } from "./use-wide-viewport";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useWideViewport", () => {
  it("initialises from matchMedia and updates on breakpoint change", () => {
    let changeHandler: ((event: MediaQueryListEvent) => void) | undefined;
    const mediaQuery = {
      matches: false,
      media: `(min-width: ${WIDE_VIEWPORT_MIN_PX}px)`,
      onchange: null,
      addEventListener: vi.fn((_event: string, handler: (event: MediaQueryListEvent) => void) => {
        changeHandler = handler;
      }),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    };

    vi.spyOn(window, "matchMedia").mockReturnValue(mediaQuery as MediaQueryList);

    const { result, unmount } = renderHook(() => useWideViewport());
    expect(result.current).toBe(false);

    act(() => {
      changeHandler?.({ matches: true } as MediaQueryListEvent);
    });
    expect(result.current).toBe(true);

    expect(mediaQuery.addEventListener).toHaveBeenCalledWith("change", expect.any(Function));
    unmount();
    expect(mediaQuery.removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
  });
});