// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useEffect, useState } from "react";

/** Tailwind `xl` breakpoint (1280px): inline inspector docks beside the table. */
export const WIDE_VIEWPORT_MIN_PX = 1280;

/**
 * Tracks whether the viewport is wide enough to dock a resource inspector inline
 * beside an inventory table. Below the breakpoint the same panel floats in a Sheet.
 */
export function useWideViewport(minWidthPx = WIDE_VIEWPORT_MIN_PX): boolean {
  const [isWide, setIsWide] = useState(() =>
    typeof window === "undefined" ? true : window.innerWidth >= minWidthPx,
  );

  useEffect(() => {
    const onResize = () => {
      setIsWide(window.innerWidth >= minWidthPx);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, [minWidthPx]);

  return isWide;
}