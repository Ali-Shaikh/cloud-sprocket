// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import "@testing-library/jest-dom/vitest";
import { configure } from "@testing-library/react";

configure({ asyncUtilTimeout: 5000 });

// jsdom defaults to a 1024px-wide window, which trips the shell's responsive
// auto-collapse and hides the contextual nav. Widen it so the nav renders.
if (typeof window !== "undefined") {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: 1440,
  });
}

// jsdom does not implement matchMedia, which the ThemeProvider and viewport
// hooks rely on. Stub min-width queries against the widened innerWidth above;
// leave other queries (e.g. prefers-color-scheme) unmatched.
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  window.matchMedia = (query: string): MediaQueryList => {
    const minWidthMatch = query.match(/\(min-width:\s*(\d+)px\)/);
    const matches = minWidthMatch
      ? window.innerWidth >= Number(minWidthMatch[1])
      : false;

    return {
      matches,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    } as unknown as MediaQueryList;
  };
}
