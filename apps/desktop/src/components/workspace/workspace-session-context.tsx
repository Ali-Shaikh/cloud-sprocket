// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import {
  createContext,
  useContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

import type {
  ProfileSummary,
  ProviderSummary,
  SessionSnapshot,
  WorkspaceSnapshot,
} from "@/types/backend";

export type WorkspaceSessionContextValue = {
  session: SessionSnapshot;
  setSession: Dispatch<SetStateAction<SessionSnapshot>>;
  workspace: WorkspaceSnapshot;
  setWorkspace: Dispatch<SetStateAction<WorkspaceSnapshot>>;
  activeWorkspace: WorkspaceSnapshot;
  providers: ProviderSummary[];
  profiles: ProfileSummary[];
  selectedProvider: ProviderSummary | undefined;
  selectedProfile: ProfileSummary | undefined;
};

const WorkspaceSessionContext =
  createContext<WorkspaceSessionContextValue | null>(null);

export function WorkspaceSessionProvider({
  value,
  children,
}: {
  value: WorkspaceSessionContextValue;
  children: ReactNode;
}) {
  return (
    <WorkspaceSessionContext.Provider value={value}>
      {children}
    </WorkspaceSessionContext.Provider>
  );
}

export function useWorkspaceSessionContext(): WorkspaceSessionContextValue {
  const value = useContext(WorkspaceSessionContext);
  if (!value) {
    throw new Error(
      "useWorkspaceSessionContext must be used within WorkspaceSessionProvider",
    );
  }
  return value;
}
