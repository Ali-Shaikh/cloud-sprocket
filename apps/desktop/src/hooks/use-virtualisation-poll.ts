// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";

const VIRTUALISATION_POLL_MS = 5000;

export function useVirtualisationPoll(
  activeWorkspaceTabId: string,
  refresh: () => Promise<unknown>,
): void {
  const enabled = activeWorkspaceTabId === "virtualisation";

  useQuery({
    queryKey: queryKeys.virtualisation.runtime,
    queryFn: async () => {
      await refresh();
      return null;
    },
    enabled,
    refetchInterval: enabled ? VIRTUALISATION_POLL_MS : false,
    staleTime: VIRTUALISATION_POLL_MS,
  });
}