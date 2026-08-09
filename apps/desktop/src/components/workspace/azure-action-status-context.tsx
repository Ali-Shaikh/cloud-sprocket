// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import {
  createContext,
  useContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

/** Azure inventory action feedback: status strings and setters used by write handlers. */
export type AzureActionStatusContextValue = {
  azureActionStatus: string;
  setAzureActionStatus: Dispatch<SetStateAction<string>>;
  azureStorageActionStatus: string;
  setAzureStorageActionStatus: Dispatch<SetStateAction<string>>;
  azureAppServiceActionStatus: string;
  setAzureAppServiceActionStatus: Dispatch<SetStateAction<string>>;
  azureFrontDoorActionStatus: string;
  setAzureFrontDoorActionStatus: Dispatch<SetStateAction<string>>;
};

const AzureActionStatusContext = createContext<AzureActionStatusContextValue | null>(null);

export function AzureActionStatusProvider({
  value,
  children,
}: {
  value: AzureActionStatusContextValue;
  children: ReactNode;
}) {
  return (
    <AzureActionStatusContext.Provider value={value}>
      {children}
    </AzureActionStatusContext.Provider>
  );
}

export function useAzureActionStatusContext(): AzureActionStatusContextValue {
  const value = useContext(AzureActionStatusContext);
  if (!value) {
    throw new Error("useAzureActionStatusContext must be used within AzureActionStatusProvider");
  }
  return value;
}
