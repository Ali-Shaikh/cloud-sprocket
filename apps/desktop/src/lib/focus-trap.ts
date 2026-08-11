// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

/**
 * Selector for elements that participate in sequential keyboard focus.
 * Kept narrow so dialog traps do not pull in inert or decorative nodes.
 */
export const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

/**
 * Decide the next focusable index when Tab (or Shift+Tab) is pressed inside a trap.
 * Pure: no DOM. Returns -1 when there is nothing to focus.
 */
export function nextTrapIndex(
  count: number,
  activeIndex: number,
  shiftKey: boolean,
): number {
  if (count <= 0) return -1;
  if (activeIndex < 0) return shiftKey ? count - 1 : 0;
  if (shiftKey) return activeIndex <= 0 ? count - 1 : activeIndex - 1;
  return activeIndex >= count - 1 ? 0 : activeIndex + 1;
}

function isFocusableCandidate(element: HTMLElement): boolean {
  if (element.closest("[inert], [aria-hidden='true']")) return false;
  if (element.hasAttribute("hidden") || element.getAttribute("aria-hidden") === "true") {
    return false;
  }
  // Prefer computed style so fixed/portal nodes stay included (offsetParent is null
  // for them). Avoid getClientRects: jsdom reports empty rects for most elements.
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") return false;
  return true;
}

/** Collect focusable HTMLElements under `root` (document order). */
export function getFocusableElements(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    isFocusableCandidate,
  );
}
