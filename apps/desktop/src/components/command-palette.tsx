// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search } from "lucide-react";

import { useFocusTrap } from "@/hooks/use-focus-trap";
import { cn } from "@/lib/utils";

export interface Command {
  id: string;
  group: string;
  label: string;
  hint?: string;
  keywords?: string;
  destructive?: boolean;
  run: () => void;
}

/**
 * A keyboard-driven command palette (⌘K / Ctrl+K). Rendered as a lightweight
 * portal overlay: type to filter, arrow keys to move, Enter to run, Esc or a
 * backdrop click to close. Focus is trapped while open and restored on close.
 */
export function CommandPalette({
  open,
  commands,
  onClose,
}: {
  open: boolean;
  commands: Command[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useFocusTrap(open, dialogRef);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      // Focus after the portal mounts.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Esc from anywhere while open (focus may sit on a list button).
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return commands;
    return commands.filter((command) =>
      `${command.label} ${command.hint ?? ""} ${command.keywords ?? ""} ${command.group}`
        .toLowerCase()
        .includes(needle),
    );
  }, [commands, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    node?.scrollIntoView?.({ block: "nearest" });
  }, [activeIndex]);

  const groups = useMemo(() => {
    const order: string[] = [];
    const byGroup = new Map<string, { command: Command; index: number }[]>();
    filtered.forEach((command, index) => {
      if (!byGroup.has(command.group)) {
        byGroup.set(command.group, []);
        order.push(command.group);
      }
      byGroup.get(command.group)!.push({ command, index });
    });
    return order.map((group) => ({ group, items: byGroup.get(group)! }));
  }, [filtered]);

  if (!open) return null;

  function run(index: number) {
    const command = filtered[index];
    if (command) {
      onClose();
      command.run();
    }
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => Math.min(current + 1, Math.max(filtered.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      run(activeIndex);
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 pt-[14vh]"
      onMouseDown={onClose}
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="w-full max-w-xl overflow-hidden rounded-xl border border-border bg-popover shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-border px-4">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search commands…"
            aria-label="Search commands"
            aria-controls="command-palette-list"
            className="w-full bg-transparent py-3.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:outline-none"
          />
        </div>
        <div
          id="command-palette-list"
          ref={listRef}
          role="listbox"
          aria-label="Commands"
          className="max-h-80 overflow-y-auto p-1.5"
        >
          {filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">No matching commands</p>
          ) : (
            groups.map(({ group, items }) => (
              <div key={group} className="mb-1" role="group" aria-label={group}>
                <p className="px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {group}
                </p>
                {items.map(({ command, index }) => (
                  <button
                    key={command.id}
                    type="button"
                    role="option"
                    aria-selected={index === activeIndex}
                    aria-label={command.label}
                    data-index={index}
                    onMouseMove={() => setActiveIndex(index)}
                    onClick={() => run(index)}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover",
                      command.destructive
                        ? "text-destructive"
                        : index === activeIndex
                          ? "bg-accent text-accent-foreground"
                          : "text-foreground",
                      command.destructive && index === activeIndex
                        ? "bg-destructive/10"
                        : null,
                    )}
                  >
                    <span className="truncate">{command.label}</span>
                    {command.hint && (
                      <span className="shrink-0 text-xs text-muted-foreground">{command.hint}</span>
                    )}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
