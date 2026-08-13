// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { describe, expect, it } from "vitest";

import { reduceShellOverlay, type ShellOverlay, type ShellOverlayAction } from "./shell-overlay";

describe("reduceShellOverlay", () => {
  it.each([
    {
      name: "Ctrl+K from shortcuts closes shortcuts and opens the palette",
      current: "shortcuts" as ShellOverlay,
      action: { type: "toggle-palette" } as ShellOverlayAction,
      next: "palette" as ShellOverlay,
    },
    {
      name: "Ctrl+K while the palette is open closes it",
      current: "palette" as ShellOverlay,
      action: { type: "toggle-palette" } as ShellOverlayAction,
      next: "none" as ShellOverlay,
    },
    {
      name: "Ctrl+K from idle opens the palette",
      current: "none" as ShellOverlay,
      action: { type: "toggle-palette" } as ShellOverlayAction,
      next: "palette" as ShellOverlay,
    },
    {
      name: "opening shortcuts closes the palette",
      current: "palette" as ShellOverlay,
      action: { type: "open-shortcuts" } as ShellOverlayAction,
      next: "shortcuts" as ShellOverlay,
    },
    {
      name: "opening the palette closes shortcuts",
      current: "shortcuts" as ShellOverlay,
      action: { type: "open-palette" } as ShellOverlayAction,
      next: "palette" as ShellOverlay,
    },
    {
      name: "closing the palette does not reopen shortcuts",
      current: "palette" as ShellOverlay,
      action: { type: "close-palette" } as ShellOverlayAction,
      next: "none" as ShellOverlay,
    },
    {
      name: "closing shortcuts while the palette is open leaves the palette",
      current: "palette" as ShellOverlay,
      action: { type: "close-shortcuts" } as ShellOverlayAction,
      next: "palette" as ShellOverlay,
    },
    {
      name: "closing the palette while shortcuts is open leaves shortcuts",
      current: "shortcuts" as ShellOverlay,
      action: { type: "close-palette" } as ShellOverlayAction,
      next: "shortcuts" as ShellOverlay,
    },
  ])("$name", ({ current, action, next }) => {
    expect(reduceShellOverlay(current, action)).toBe(next);
  });
});
