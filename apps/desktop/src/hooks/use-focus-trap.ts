// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { type RefObject, useEffect } from "react";

import { getFocusableElements, nextTrapIndex } from "@/lib/focus-trap";

/**
 * Keep Tab/Shift+Tab cycling inside `containerRef` while `active` is true,
 * and restore focus to the previously focused element when the trap ends.
 */
export function useFocusTrap(
  active: boolean,
  containerRef: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    if (!active) return;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Tab") return;
      const container = containerRef.current;
      if (!container) return;

      const focusables = getFocusableElements(container);
      if (focusables.length === 0) {
        event.preventDefault();
        return;
      }

      const activeElement = document.activeElement;
      const activeIndex =
        activeElement instanceof HTMLElement ? focusables.indexOf(activeElement) : -1;
      const nextIndex = nextTrapIndex(focusables.length, activeIndex, event.shiftKey);
      if (nextIndex < 0) return;

      // Only intercept when we would leave the trap or focus is already outside.
      const wouldLeave =
        activeIndex < 0 ||
        (!event.shiftKey && activeIndex === focusables.length - 1) ||
        (event.shiftKey && activeIndex === 0);

      if (!wouldLeave) return;

      event.preventDefault();
      focusables[nextIndex]?.focus();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (
        previouslyFocused &&
        document.contains(previouslyFocused) &&
        typeof previouslyFocused.focus === "function"
      ) {
        previouslyFocused.focus();
      }
    };
  }, [active, containerRef]);
}
