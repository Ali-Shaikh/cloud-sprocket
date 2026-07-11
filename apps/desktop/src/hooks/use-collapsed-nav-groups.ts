// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useCallback, useState } from "react";

const STORAGE_KEY = "cloudsprocket.nav.collapsedGroups";

function readCollapsed(): Set<string> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

function writeCollapsed(ids: Set<string>): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    /* storage unavailable; collapse state stays session-only */
  }
}

/**
 * Persisted collapse state for sidebar nav groups, keyed by stable group id.
 * Shared across providers on purpose: collapsing Compute on AWS collapses it
 * on Azure too, so the sidebar feels consistent when switching connections.
 */
export function useCollapsedNavGroups() {
  const [collapsed, setCollapsed] = useState<Set<string>>(readCollapsed);

  const isCollapsed = useCallback((groupId: string) => collapsed.has(groupId), [collapsed]);

  const toggleGroup = useCallback((groupId: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      writeCollapsed(next);
      return next;
    });
  }, []);

  return { isCollapsed, toggleGroup };
}
