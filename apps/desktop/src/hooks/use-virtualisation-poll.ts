// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useEffect } from "react";

const VIRTUALISATION_POLL_MS = 5000;

export function useVirtualisationPoll(
  activeWorkspaceTabId: string,
  refresh: () => Promise<unknown>,
): void {
  useEffect(() => {
    if (activeWorkspaceTabId !== "virtualisation") {
      return undefined;
    }

    void refresh();
    const interval = window.setInterval(() => {
      void refresh();
    }, VIRTUALISATION_POLL_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, [activeWorkspaceTabId, refresh]);
}