// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { createContext, useContext, type ReactNode } from "react";

import type { useAzureActions } from "@/hooks/use-azure-actions";

/** Callbacks returned by `useAzureActions` for Azure inventory and write operations. */
export type AzureActions = ReturnType<typeof useAzureActions>;

const AzureActionsContext = createContext<AzureActions | null>(null);

export function AzureActionsProvider({
  value,
  children,
}: {
  value: AzureActions;
  children: ReactNode;
}) {
  return <AzureActionsContext.Provider value={value}>{children}</AzureActionsContext.Provider>;
}

export function useAzureActionsContext(): AzureActions {
  const value = useContext(AzureActionsContext);
  if (!value) {
    throw new Error("useAzureActionsContext must be used within AzureActionsProvider");
  }
  return value;
}
