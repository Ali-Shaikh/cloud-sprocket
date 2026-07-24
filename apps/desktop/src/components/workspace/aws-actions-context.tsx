// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { createContext, useContext, type ReactNode } from "react";

import type { useAwsActions } from "@/hooks/use-aws-actions";

/** Callbacks returned by `useAwsActions` for AWS inventory and write operations. */
export type AwsActions = ReturnType<typeof useAwsActions>;

const AwsActionsContext = createContext<AwsActions | null>(null);

export function AwsActionsProvider({
  value,
  children,
}: {
  value: AwsActions;
  children: ReactNode;
}) {
  return <AwsActionsContext.Provider value={value}>{children}</AwsActionsContext.Provider>;
}

export function useAwsActionsContext(): AwsActions {
  const value = useContext(AwsActionsContext);
  if (!value) {
    throw new Error("useAwsActionsContext must be used within AwsActionsProvider");
  }
  return value;
}
