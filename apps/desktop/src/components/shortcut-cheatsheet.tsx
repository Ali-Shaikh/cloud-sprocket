// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { createPortal } from "react-dom";

import { KEYBOARD_SHORTCUTS } from "@/lib/keyboard-shortcuts";

/**
 * Lightweight overlay listing keyboard shortcuts. Opened with `?` when focus
 * is not in a text field.
 */
export function ShortcutCheatsheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;

  const groups = new Map<string, typeof KEYBOARD_SHORTCUTS>();
  for (const shortcut of KEYBOARD_SHORTCUTS) {
    const list = groups.get(shortcut.group) ?? [];
    list.push(shortcut);
    groups.set(shortcut.group, list);
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 pt-[12vh]"
      onMouseDown={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-label="Keyboard shortcuts"
        className="w-full max-w-md overflow-hidden rounded-xl border border-border bg-popover shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">Keyboard shortcuts</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            Esc
          </button>
        </div>
        <div className="max-h-[60vh] space-y-4 overflow-y-auto px-4 py-3">
          {[...groups.entries()].map(([group, items]) => (
            <div key={group}>
              <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                {group}
              </div>
              <ul className="space-y-1.5">
                {items.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-foreground">{item.description}</span>
                    <kbd className="shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                      {item.keys}
                    </kbd>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
