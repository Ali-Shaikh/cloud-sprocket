// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import type { NavigateToResourceParams } from "@/lib/navigate-to-resource";

/**
 * A navigable place in the app shell. Tab-only jumps set `tabId`; resource
 * deep links also carry a `focus` payload that `useNavigateToResource` can apply.
 */
export type NavigationLocation = {
  tabId: string;
  label?: string;
  focus?: NavigateToResourceParams;
};

/** Stable key for dedupe in history / recents (tab + resource, ignore label). */
export function navigationLocationKey(location: NavigationLocation): string {
  const focus = location.focus;
  if (!focus) {
    return `tab:${location.tabId}`;
  }
  const resource = focus.resourceKey?.trim() ?? "";
  const sub = focus.subPage?.trim() ?? "";
  return `res:${focus.provider}:${location.tabId}:${resource}:${sub}`;
}

export function navigationLocationsEqual(a: NavigationLocation, b: NavigationLocation): boolean {
  return navigationLocationKey(a) === navigationLocationKey(b);
}

export function locationFromTabId(tabId: string, label?: string): NavigationLocation {
  return { tabId, label };
}
