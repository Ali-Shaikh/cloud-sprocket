// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import {
  type NavigationLocation,
  navigationLocationKey,
} from "@/lib/navigation-location";

export type RecentNavigationEntry = NavigationLocation & {
  at: number;
};

export const DEFAULT_RECENTS_MAX = 12;
export const RECENTS_STORAGE_KEY = "cloudsprocket.nav.recents";
export const PINS_STORAGE_KEY = "cloudsprocket.nav.pins";

export function mergeRecent(
  recents: RecentNavigationEntry[],
  location: NavigationLocation,
  at = Date.now(),
  max = DEFAULT_RECENTS_MAX,
): RecentNavigationEntry[] {
  const key = navigationLocationKey(location);
  const next: RecentNavigationEntry = {
    ...location,
    at,
  };
  const filtered = recents.filter((entry) => navigationLocationKey(entry) !== key);
  return [next, ...filtered].slice(0, max);
}

export function serialiseRecents(recents: RecentNavigationEntry[]): string {
  return JSON.stringify(
    recents.map((entry) => ({
      tabId: entry.tabId,
      label: entry.label,
      focus: entry.focus,
      at: entry.at,
    })),
  );
}

export function deserialiseRecents(raw: string | null): RecentNavigationEntry[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: RecentNavigationEntry[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const record = item as Record<string, unknown>;
      if (typeof record.tabId !== "string" || !record.tabId) continue;
      const at = typeof record.at === "number" ? record.at : 0;
      const entry: RecentNavigationEntry = {
        tabId: record.tabId,
        at,
      };
      if (typeof record.label === "string") {
        entry.label = record.label;
      }
      if (record.focus && typeof record.focus === "object") {
        const focus = record.focus as Record<string, unknown>;
        if (focus.provider === "aws" || focus.provider === "azure") {
          if (typeof focus.tab === "string") {
            entry.focus = {
              provider: focus.provider,
              tab: focus.tab,
              resourceKey: typeof focus.resourceKey === "string" ? focus.resourceKey : undefined,
              subPage: typeof focus.subPage === "string" ? focus.subPage : undefined,
            };
          }
        }
      }
      out.push(entry);
    }
    return out;
  } catch {
    return [];
  }
}

export function serialisePins(pins: string[]): string {
  return JSON.stringify(pins.filter((id) => typeof id === "string" && id.length > 0));
}

export function deserialisePins(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string" && id.length > 0);
  } catch {
    return [];
  }
}

/** Toggle a tab id in the pins list; pinned order is most-recently-pinned first. */
export function togglePin(pins: string[], tabId: string): string[] {
  if (pins.includes(tabId)) {
    return pins.filter((id) => id !== tabId);
  }
  return [tabId, ...pins];
}

/**
 * Reorder nav items so pinned tab ids appear first (in pin order), then the
 * rest in their original order. Only matches plain tab ids (not composite
 * `tab:page` deep links).
 */
export function orderItemsByPins<T extends { id: string }>(
  items: T[],
  pins: string[],
): T[] {
  if (pins.length === 0 || items.length === 0) return items;
  const byId = new Map(items.map((item) => [item.id, item]));
  const pinned: T[] = [];
  const seen = new Set<string>();
  for (const pin of pins) {
    const item = byId.get(pin);
    if (item) {
      pinned.push(item);
      seen.add(pin);
    }
  }
  const rest = items.filter((item) => !seen.has(item.id));
  return [...pinned, ...rest];
}
