// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useCallback, useRef, useState } from "react";

import { useFetchDepth } from "./use-fetch-depth";

export function useWorkspaceLoading() {
  const workspaceDepthRef = useRef(0);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [workspaceFetching, setWorkspaceFetching] = useState(false);
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false);
  const azureInventory = useFetchDepth();
  const awsInventory = useFetchDepth();

  const beginWorkspaceFetch = useCallback(() => {
    workspaceDepthRef.current += 1;
    if (workspaceDepthRef.current === 1) {
      setWorkspaceFetching(true);
      setWorkspaceLoading(true);
    }
  }, []);

  const endWorkspaceFetch = useCallback(() => {
    workspaceDepthRef.current = Math.max(0, workspaceDepthRef.current - 1);
    if (workspaceDepthRef.current === 0) {
      setWorkspaceFetching(false);
      setWorkspaceLoading(false);
    }
  }, []);

  const resetWorkspaceFetch = useCallback(() => {
    workspaceDepthRef.current = 0;
    setWorkspaceFetching(false);
    setWorkspaceLoading(false);
  }, []);

  return {
    workspaceLoading,
    workspaceFetching,
    workspaceLoaded,
    setWorkspaceLoaded,
    azureInventoryLoading: azureInventory.loading,
    awsInventoryLoading: awsInventory.loading,
    beginWorkspaceFetch,
    endWorkspaceFetch,
    resetWorkspaceFetch,
    beginAzureInventoryFetch: azureInventory.begin,
    endAzureInventoryFetch: azureInventory.end,
    beginAwsInventoryFetch: awsInventory.begin,
    endAwsInventoryFetch: awsInventory.end,
  };
}