// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useCallback, useEffect, useRef, useState } from "react";

import {
  canGoBack,
  canGoForward,
  createNavigationHistory,
  goBackNavigationHistory,
  goForwardNavigationHistory,
  pushNavigationHistory,
  type NavigationHistoryState,
} from "@/lib/navigation-history";
import {
  type NavigationLocation,
  locationFromTabId,
} from "@/lib/navigation-location";
import {
  PINS_STORAGE_KEY,
  RECENTS_STORAGE_KEY,
  deserialisePins,
  deserialiseRecents,
  mergeRecent,
  serialisePins,
  serialiseRecents,
  togglePin,
  type RecentNavigationEntry,
} from "@/lib/navigation-recents";
import type { NavigateToResourceParams } from "@/lib/navigate-to-resource";

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}

export type NavigateOptions = {
  /** When true, do not push onto the history stack (used by back/forward). */
  replace?: boolean;
  /** Skip recording in recents (rare; e.g. transient debug). */
  skipRecent?: boolean;
};

export type UseNavigationControllerParams = {
  activeWorkspaceTabId: string;
  setActiveWorkspaceTabId: (tabId: string) => void;
  /** Apply a resource deep-link after the tab change. */
  applyResourceFocus?: (params: NavigateToResourceParams) => void;
  /** Resolve a human label for a bare tab id. */
  labelForTab?: (tabId: string) => string | undefined;
};

/**
 * Single entry point for shell navigation: tab changes, resource focus,
 * history, and recents/pins persistence.
 */
export function useNavigationController(params: UseNavigationControllerParams) {
  const {
    activeWorkspaceTabId,
    setActiveWorkspaceTabId,
    applyResourceFocus,
    labelForTab,
  } = params;

  const [history, setHistory] = useState<NavigationHistoryState>(() =>
    createNavigationHistory(locationFromTabId(activeWorkspaceTabId)),
  );
  const [recents, setRecents] = useState<RecentNavigationEntry[]>(() =>
    deserialiseRecents(readStorage(RECENTS_STORAGE_KEY)),
  );
  const [pins, setPins] = useState<string[]>(() => deserialisePins(readStorage(PINS_STORAGE_KEY)));

  // Track the last applied location so external setActiveWorkspaceTabId calls
  // (session unlock, invalid-tab reset) still update history once we learn of them.
  const lastTabRef = useRef(activeWorkspaceTabId);
  const navigatingRef = useRef(false);

  const recordLocation = useCallback(
    (location: NavigationLocation, options: NavigateOptions = {}) => {
      // Keep the external-tab-change effect from double-recording the same jump.
      lastTabRef.current = location.tabId;
      if (!options.replace) {
        setHistory((current) => pushNavigationHistory(current, location));
      }
      if (!options.skipRecent) {
        setRecents((current) => {
          const next = mergeRecent(current, location);
          writeStorage(RECENTS_STORAGE_KEY, serialiseRecents(next));
          return next;
        });
      }
    },
    [],
  );

  const navigateTo = useCallback(
    (location: NavigationLocation, options: NavigateOptions = {}) => {
      const label =
        location.label ?? labelForTab?.(location.tabId) ?? location.focus?.resourceKey;
      const normalised: NavigationLocation = {
        ...location,
        label: label || location.tabId,
      };

      navigatingRef.current = true;
      setActiveWorkspaceTabId(normalised.tabId);
      lastTabRef.current = normalised.tabId;

      if (normalised.focus && applyResourceFocus) {
        applyResourceFocus(normalised.focus);
      }

      if (!options.replace) {
        recordLocation(normalised, options);
      } else {
        // replace still updates the current history entry's label when needed
        setHistory((current) => {
          if (current.index < 0) {
            return pushNavigationHistory(current, normalised);
          }
          const entries = current.entries.slice();
          entries[current.index] = normalised;
          return { entries, index: current.index };
        });
      }
      // Defer clearing so the activeWorkspaceTabId effect does not double-push.
      queueMicrotask(() => {
        navigatingRef.current = false;
      });
    },
    [applyResourceFocus, labelForTab, recordLocation, setActiveWorkspaceTabId],
  );

  const navigateToTab = useCallback(
    (tabId: string, options?: NavigateOptions) => {
      navigateTo(locationFromTabId(tabId, labelForTab?.(tabId)), options);
    },
    [labelForTab, navigateTo],
  );

  // External tab changes (session lifecycle) feed history without double-counting
  // navigations that already went through navigateTo.
  useEffect(() => {
    if (navigatingRef.current) {
      lastTabRef.current = activeWorkspaceTabId;
      return;
    }
    if (lastTabRef.current === activeWorkspaceTabId) {
      return;
    }
    lastTabRef.current = activeWorkspaceTabId;
    recordLocation(locationFromTabId(activeWorkspaceTabId, labelForTab?.(activeWorkspaceTabId)));
  }, [activeWorkspaceTabId, labelForTab, recordLocation]);

  const goBack = useCallback(() => {
    setHistory((current) => {
      const result = goBackNavigationHistory(current);
      if (result.location) {
        navigatingRef.current = true;
        setActiveWorkspaceTabId(result.location.tabId);
        lastTabRef.current = result.location.tabId;
        if (result.location.focus && applyResourceFocus) {
          applyResourceFocus(result.location.focus);
        }
        queueMicrotask(() => {
          navigatingRef.current = false;
        });
      }
      return result.state;
    });
  }, [applyResourceFocus, setActiveWorkspaceTabId]);

  const goForward = useCallback(() => {
    setHistory((current) => {
      const result = goForwardNavigationHistory(current);
      if (result.location) {
        navigatingRef.current = true;
        setActiveWorkspaceTabId(result.location.tabId);
        lastTabRef.current = result.location.tabId;
        if (result.location.focus && applyResourceFocus) {
          applyResourceFocus(result.location.focus);
        }
        queueMicrotask(() => {
          navigatingRef.current = false;
        });
      }
      return result.state;
    });
  }, [applyResourceFocus, setActiveWorkspaceTabId]);

  const togglePinnedTab = useCallback((tabId: string) => {
    setPins((current) => {
      const next = togglePin(current, tabId);
      writeStorage(PINS_STORAGE_KEY, serialisePins(next));
      return next;
    });
  }, []);

  return {
    navigateTo,
    navigateToTab,
    /** Record a navigation that already applied its own tab/focus (e.g. resource deep links). */
    recordLocation,
    goBack,
    goForward,
    canGoBack: canGoBack(history),
    canGoForward: canGoForward(history),
    recents,
    pins,
    togglePinnedTab,
    history,
  };
}
