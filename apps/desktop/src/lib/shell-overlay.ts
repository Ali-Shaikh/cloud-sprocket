// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

/** At most one shell overlay is visible. Palette and shortcuts must not stack. */
export type ShellOverlay = "none" | "palette" | "shortcuts";

export type ShellOverlayAction =
  | { type: "toggle-palette" }
  | { type: "open-palette" }
  | { type: "open-shortcuts" }
  | { type: "close-palette" }
  | { type: "close-shortcuts" };

/**
 * Decide the next exclusive overlay. Pure: no DOM.
 * Opening either overlay closes the other. Toggling the palette closed
 * does not reopen shortcuts.
 */
export function reduceShellOverlay(
  current: ShellOverlay,
  action: ShellOverlayAction,
): ShellOverlay {
  switch (action.type) {
    case "toggle-palette":
      return current === "palette" ? "none" : "palette";
    case "open-palette":
      return "palette";
    case "open-shortcuts":
      return "shortcuts";
    case "close-palette":
      return current === "palette" ? "none" : current;
    case "close-shortcuts":
      return current === "shortcuts" ? "none" : current;
  }
}
