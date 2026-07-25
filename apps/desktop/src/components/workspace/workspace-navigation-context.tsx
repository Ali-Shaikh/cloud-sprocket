// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import {
  createContext,
  useContext,
  type Dispatch,
  type MutableRefObject,
  type ReactNode,
  type SetStateAction,
} from "react";

import type { NavigationLocation } from "@/lib/navigation-location";
import type { NavigateToResourceParams } from "@/lib/navigate-to-resource";

export type WorkspaceNavigationContextValue = {
  activeWorkspaceTabId: string;
  setActiveWorkspaceTabId: Dispatch<SetStateAction<string>>;
  activeAzurePageId: string;
  setActiveAzurePageId: Dispatch<SetStateAction<string>>;
  lambdaCreateFormOpen: boolean;
  setLambdaCreateFormOpen: Dispatch<SetStateAction<boolean>>;
  logAnalyticsPrefill: { query?: string; timespan?: string } | null;
  setLogAnalyticsPrefill: Dispatch<
    SetStateAction<{ query?: string; timespan?: string } | null>
  >;
  frontDoorAccessPrefill: {
    trackingReference: string;
    workspace?: string;
    timespan?: string;
  } | null;
  setFrontDoorAccessPrefill: Dispatch<
    SetStateAction<{
      trackingReference: string;
      workspace?: string;
      timespan?: string;
    } | null>
  >;
  recordLocation?: (location: NavigationLocation) => void;
  navigateToResourceRef?: MutableRefObject<
    | ((
        params: NavigateToResourceParams,
        options?: { record?: boolean },
      ) => void)
    | null
  >;
};

const WorkspaceNavigationContext =
  createContext<WorkspaceNavigationContextValue | null>(null);

export function WorkspaceNavigationProvider({
  value,
  children,
}: {
  value: WorkspaceNavigationContextValue;
  children: ReactNode;
}) {
  return (
    <WorkspaceNavigationContext.Provider value={value}>
      {children}
    </WorkspaceNavigationContext.Provider>
  );
}

export function useWorkspaceNavigationContext(): WorkspaceNavigationContextValue {
  const value = useContext(WorkspaceNavigationContext);
  if (!value) {
    throw new Error(
      "useWorkspaceNavigationContext must be used within WorkspaceNavigationProvider",
    );
  }
  return value;
}
