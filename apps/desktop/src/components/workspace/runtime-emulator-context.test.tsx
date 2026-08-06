// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, expectTypeOf, it, vi } from "vitest";

import type { EmulatorLogSnapshot } from "@/types/backend";

import {
  RuntimeEmulatorProvider,
  type RuntimeEmulatorContextValue,
  useRuntimeEmulatorContext,
} from "./runtime-emulator-context";
import type { WorkspaceTabRouterProps } from "./workspace-tab-router-props";

const emptyLogs: EmulatorLogSnapshot = {
  emulatorId: "localstack",
  lines: [],
  summary: "",
};

function createRuntimeEmulator(): RuntimeEmulatorContextValue {
  return {
    localStack: {
      authToken: "ls-token",
      setAuthToken: vi.fn(),
      persistence: true,
      setPersistence: vi.fn(),
      environmentText: "FOO=bar",
      setEnvironmentText: vi.fn(),
      logs: emptyLogs,
      logsStatus: "idle",
      actionStatus: "",
      actionInFlight: false,
      refreshLogs: vi.fn(async () => undefined),
      invokeAction: vi.fn(async () => undefined),
    },
    flociAz: {
      persistence: false,
      setPersistence: vi.fn(),
      environmentText: "AZURE_ENV=dev",
      setEnvironmentText: vi.fn(),
      logs: { ...emptyLogs, emulatorId: "floci-az" },
      logsStatus: "idle",
      actionStatus: "",
      actionInFlight: false,
      refreshLogs: vi.fn(async () => undefined),
      invokeAction: vi.fn(async () => undefined),
    },
    refreshDockerRuntime: vi.fn(async () => undefined),
  };
}

function RuntimeEmulatorProbe() {
  const runtime = useRuntimeEmulatorContext();
  return (
    <button
      type="button"
      onClick={() => {
        void runtime.localStack.invokeAction("start");
      }}
    >
      Start LocalStack
    </button>
  );
}

describe("RuntimeEmulatorProvider", () => {
  it("forwards LocalStack and floci-az values to consumers", () => {
    const runtime = createRuntimeEmulator();

    render(
      <RuntimeEmulatorProvider value={runtime}>
        <RuntimeEmulatorProbe />
      </RuntimeEmulatorProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Start LocalStack" }));

    expect(runtime.localStack.invokeAction).toHaveBeenCalledWith("start");
  });

  it("fails fast when a consumer has no provider", () => {
    expect(() => render(<RuntimeEmulatorProbe />)).toThrow(
      "useRuntimeEmulatorContext must be used within RuntimeEmulatorProvider",
    );
  });

  it("keeps runtime emulator fields out of the router prop contract", () => {
    type LegacyRuntimeProp =
      | "localStackAuthToken"
      | "setLocalStackAuthToken"
      | "localStackPersistence"
      | "setLocalStackPersistence"
      | "localStackEnvironmentText"
      | "setLocalStackEnvironmentText"
      | "localStackLogs"
      | "localStackLogsStatus"
      | "localStackActionStatus"
      | "localStackActionInFlight"
      | "flociAzPersistence"
      | "setFlociAzPersistence"
      | "flociAzEnvironmentText"
      | "setFlociAzEnvironmentText"
      | "flociAzLogs"
      | "flociAzLogsStatus"
      | "flociAzActionStatus"
      | "flociAzActionInFlight"
      | "refreshDockerRuntime"
      | "refreshLocalStackLogs"
      | "refreshFlociAzLogs"
      | "invokeLocalStackAction"
      | "invokeFlociAzAction";

    type ThreadedRuntimeProp = Extract<keyof WorkspaceTabRouterProps, LegacyRuntimeProp>;
    expectTypeOf<ThreadedRuntimeProp>().toEqualTypeOf<never>();
  });
});
