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

// jsdom does not implement matchMedia, which the ThemeProvider relies on to
// resolve the OS colour-scheme preference. Provide a minimal stub.
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}
