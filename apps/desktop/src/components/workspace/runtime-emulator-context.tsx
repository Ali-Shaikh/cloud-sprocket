// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import {
  createContext,
  useContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

import type { EmulatorLogSnapshot } from "@/types/backend";

export type EmulatorAction = "prepareProfile" | "start" | "stop" | "recreate";

/** LocalStack emulator form state, logs, and lifecycle callbacks. */
export type LocalStackEmulatorState = {
  authToken: string;
  setAuthToken: Dispatch<SetStateAction<string>>;
  persistence: boolean;
  setPersistence: Dispatch<SetStateAction<boolean>>;
  environmentText: string;
  setEnvironmentText: Dispatch<SetStateAction<string>>;
  logs: EmulatorLogSnapshot;
  logsStatus: string;
  actionStatus: string;
  actionInFlight: boolean;
  refreshLogs: () => Promise<void>;
  invokeAction: (action: EmulatorAction) => Promise<void>;
};

/** floci-az emulator form state, logs, and lifecycle callbacks (no auth token). */
export type FlociAzEmulatorState = {
  persistence: boolean;
  setPersistence: Dispatch<SetStateAction<boolean>>;
  environmentText: string;
  setEnvironmentText: Dispatch<SetStateAction<string>>;
  logs: EmulatorLogSnapshot;
  logsStatus: string;
  actionStatus: string;
  actionInFlight: boolean;
  refreshLogs: () => Promise<void>;
  invokeAction: (action: EmulatorAction) => Promise<void>;
};

export type RuntimeEmulatorContextValue = {
  localStack: LocalStackEmulatorState;
  flociAz: FlociAzEmulatorState;
  refreshDockerRuntime: () => Promise<void>;
};

const RuntimeEmulatorContext = createContext<RuntimeEmulatorContextValue | null>(null);

export function RuntimeEmulatorProvider({
  value,
  children,
}: {
  value: RuntimeEmulatorContextValue;
  children: ReactNode;
}) {
  return (
    <RuntimeEmulatorContext.Provider value={value}>
      {children}
    </RuntimeEmulatorContext.Provider>
  );
}

export function useRuntimeEmulatorContext(): RuntimeEmulatorContextValue {
  const value = useContext(RuntimeEmulatorContext);
  if (!value) {
    throw new Error(
      "useRuntimeEmulatorContext must be used within RuntimeEmulatorProvider",
    );
  }
  return value;
}
