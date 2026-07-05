// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useEffect, useState } from "react";

/** Tailwind `xl` breakpoint (1280px): inline inspector docks beside the table. */
export const WIDE_VIEWPORT_MIN_PX = 1280;

/**
 * Tracks whether the viewport is wide enough to dock a resource inspector inline
 * beside an inventory table. Below the breakpoint the same panel floats in a Sheet.
 */
function wideViewportQuery(minWidthPx: number): string {
  return `(min-width: ${minWidthPx}px)`;
}

export function useWideViewport(minWidthPx = WIDE_VIEWPORT_MIN_PX): boolean {
  const [isWide, setIsWide] = useState(() => {
    if (typeof window === "undefined") {
      return true;
    }
    return window.matchMedia(wideViewportQuery(minWidthPx)).matches;
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia(wideViewportQuery(minWidthPx));
    const onChange = (event: MediaQueryListEvent) => {
      setIsWide(event.matches);
    };
    mediaQuery.addEventListener("change", onChange);
    return () => {
      mediaQuery.removeEventListener("change", onChange);
    };
  }, [minWidthPx]);

  return isWide;
}