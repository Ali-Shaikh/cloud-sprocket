// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import {
  type NavigationLocation,
  navigationLocationsEqual,
} from "@/lib/navigation-location";

export type NavigationHistoryState = {
  entries: NavigationLocation[];
  /** Index of the current entry in `entries`. */
  index: number;
};

export const DEFAULT_HISTORY_MAX = 50;

export function createNavigationHistory(
  initial?: NavigationLocation,
): NavigationHistoryState {
  if (!initial) {
    return { entries: [], index: -1 };
  }
  return { entries: [initial], index: 0 };
}

export function canGoBack(state: NavigationHistoryState): boolean {
  return state.index > 0;
}

export function canGoForward(state: NavigationHistoryState): boolean {
  return state.index >= 0 && state.index < state.entries.length - 1;
}

/**
 * Push a location onto the history stack. Drops any forward entries (browser
 * style). Skips a no-op when the location matches the current entry.
 */
export function pushNavigationHistory(
  state: NavigationHistoryState,
  location: NavigationLocation,
  max = DEFAULT_HISTORY_MAX,
): NavigationHistoryState {
  const current = state.entries[state.index];
  if (current && navigationLocationsEqual(current, location)) {
    // Refresh label if the new entry carries one.
    if (location.label && location.label !== current.label) {
      const entries = state.entries.slice();
      entries[state.index] = { ...current, label: location.label };
      return { entries, index: state.index };
    }
    return state;
  }

  const kept = state.index >= 0 ? state.entries.slice(0, state.index + 1) : [];
  kept.push(location);
  const overflow = Math.max(0, kept.length - max);
  const entries = overflow > 0 ? kept.slice(overflow) : kept;
  return { entries, index: entries.length - 1 };
}

export function goBackNavigationHistory(
  state: NavigationHistoryState,
): { state: NavigationHistoryState; location: NavigationLocation | null } {
  if (!canGoBack(state)) {
    return { state, location: null };
  }
  const index = state.index - 1;
  return {
    state: { entries: state.entries, index },
    location: state.entries[index] ?? null,
  };
}

export function goForwardNavigationHistory(
  state: NavigationHistoryState,
): { state: NavigationHistoryState; location: NavigationLocation | null } {
  if (!canGoForward(state)) {
    return { state, location: null };
  }
  const index = state.index + 1;
  return {
    state: { entries: state.entries, index },
    location: state.entries[index] ?? null,
  };
}
