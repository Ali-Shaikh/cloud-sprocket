// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";

const VIRTUALISATION_POLL_MS = 5000;

/**
 * While the Local Runtime tab is active, poll engine/emulator status only.
 * Log tails are not polled: load once on tab enter (optional callback) and via
 * Refresh Logs / post-action refresh in use-runtime-actions.
 */
export function useVirtualisationPoll(
  activeWorkspaceTabId: string,
  refreshStatus: () => Promise<unknown>,
  refreshLogsOnEnter?: () => Promise<unknown>,
): void {
  const enabled = activeWorkspaceTabId === "virtualisation";
  const logsLoadedForVisitRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      logsLoadedForVisitRef.current = false;
      return;
    }
    if (logsLoadedForVisitRef.current || !refreshLogsOnEnter) {
      return;
    }
    logsLoadedForVisitRef.current = true;
    void refreshLogsOnEnter();
  }, [enabled, refreshLogsOnEnter]);

  useQuery({
    queryKey: queryKeys.virtualisation.runtime,
    queryFn: async () => {
      await refreshStatus();
      return null;
    },
    enabled,
    refetchInterval: enabled ? VIRTUALISATION_POLL_MS : false,
    staleTime: VIRTUALISATION_POLL_MS,
  });
}
