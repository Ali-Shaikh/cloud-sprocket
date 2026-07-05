// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { listDeployments, subscribeToBackendEvent } from "@/lib/backend";
import { queryKeys } from "@/lib/query-keys";
import type { Deployment } from "@/types/backend";

export function useDeploymentsQuery() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.deployments.list,
    queryFn: listDeployments,
  });

  useEffect(() => {
    const unsubChanged = subscribeToBackendEvent("deployment.changed", (deployment) => {
      queryClient.setQueryData<Deployment[]>(queryKeys.deployments.list, (current = []) => {
        const next = current.filter((entry) => entry.id !== deployment.id);
        return [deployment, ...next];
      });
    });
    return () => {
      void unsubChanged.then((unsub) => unsub());
    };
  }, [queryClient]);

  return query;
}