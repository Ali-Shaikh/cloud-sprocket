// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

export type ShortcutDefinition = {
  id: string;
  keys: string;
  description: string;
  group: string;
};

/** Catalogue shown in the ? cheatsheet and used for documentation. */
export const KEYBOARD_SHORTCUTS: ShortcutDefinition[] = [
  {
    id: "palette",
    keys: "Ctrl/⌘ K",
    description: "Open or close the command palette",
    group: "General",
  },
  {
    id: "cheatsheet",
    keys: "?",
    description: "Show keyboard shortcuts",
    group: "General",
  },
  {
    id: "back",
    keys: "Alt ←",
    description: "Go back",
    group: "Navigation",
  },
  {
    id: "forward",
    keys: "Alt →",
    description: "Go forward",
    group: "Navigation",
  },
  {
    id: "rail",
    keys: "Ctrl/⌘ 1–9",
    description: "Jump to a rail area (connections, tools, runtime, deploy)",
    group: "Navigation",
  },
  {
    id: "prev-tab",
    keys: "[",
    description: "Previous tab in the current sidebar group",
    group: "Navigation",
  },
  {
    id: "next-tab",
    keys: "]",
    description: "Next tab in the current sidebar group",
    group: "Navigation",
  },
];

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return Boolean(target.closest("[contenteditable='true']"));
}

/** Cycle within a flat list of tab ids; wraps around. */
export function cycleTabId(
  tabIds: string[],
  activeId: string,
  direction: 1 | -1,
): string | null {
  if (tabIds.length === 0) return null;
  const index = tabIds.indexOf(activeId);
  if (index < 0) {
    return direction === 1 ? tabIds[0]! : tabIds[tabIds.length - 1]!;
  }
  const next = (index + direction + tabIds.length) % tabIds.length;
  return tabIds[next] ?? null;
}
