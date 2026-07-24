// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  EmulatorActionResult,
  EmulatorLogSnapshot,
  WorkspaceSnapshot,
} from "@/types/backend";

import {
  buildEmulatorActionParams,
  EMULATOR_ACTION_TIMEOUT_MS,
  EMULATOR_POLL,
  emulatorActionLabel,
  emulatorActionMethod,
  emulatorActionTimeoutMs,
  emulatorDisplayName,
  parseEnvironment,
  useRuntimeActions,
  type UseRuntimeActionsParams,
} from "./use-runtime-actions";

const backendRequest = vi.fn();
const notify = vi.fn();
const fetchVirtualisationStatus = vi.fn();
const fetchEmulatorLogs = vi.fn();
const emulatorStatusFromWorkspace = vi.fn();

vi.mock("@/lib/backend", () => ({
  backendRequest: (...args: unknown[]) => backendRequest(...args),
}));

vi.mock("@/lib/notify", () => ({
  notify: (...args: unknown[]) => notify(...args),
}));

vi.mock("@/lib/workspace-runtime", () => ({
  fetchVirtualisationStatus: (...args: unknown[]) => fetchVirtualisationStatus(...args),
  fetchEmulatorLogs: (...args: unknown[]) => fetchEmulatorLogs(...args),
}));

vi.mock("@/lib/workspace-shell", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/workspace-shell")>();
  return {
    ...actual,
    emulatorStatusFromWorkspace: (...args: unknown[]) => emulatorStatusFromWorkspace(...args),
    dockerDiagnosticsFromRuntime: vi.fn(() => ({
      engineState: "available",
      summary: "ok",
      details: [],
    })),
    normaliseEmulatorLogSnapshot: (value: EmulatorLogSnapshot) => value,
  };
});

vi.mock("@/lib/workspace-snapshot", () => ({
  normaliseWorkspaceSnapshot: (value: WorkspaceSnapshot) => value,
}));

function emptyLogs(emulatorId: string): EmulatorLogSnapshot {
  return { emulatorId, lines: [], summary: "" };
}

function emptyWorkspace(): WorkspaceSnapshot {
  return {
    dockerRuntime: {
      reachable: true,
      resourceOwnership: {
        labelKey: "com.cloudsprocket.managed",
        labelValue: "true",
        projectLabelKey: "com.cloudsprocket.project",
        projectName: "cloudsprocket",
        summary: "owned",
      },
      summary: "Docker is running",
      details: [],
    },
    dockerResources: [],
    dockerDiagnostics: {
      engineState: "available",
      summary: "ok",
      details: [],
    },
    emulatorSummaries: [],
  } as unknown as WorkspaceSnapshot;
}

function actionResult(
  emulatorId: string,
  summary: string,
  state: EmulatorActionResult["state"] = "succeeded",
): EmulatorActionResult {
  return {
    emulatorId,
    action: "start",
    state,
    summary,
    status: {
      emulatorId,
      providerId: emulatorId === "floci-az" ? "azure" : "aws",
      label: emulatorId,
      kind: "container",
      status: "running",
      summary,
      details: [],
    },
  };
}

/** setState mock that applies functional updaters so startTransition paths resolve. */
function stateSetter<T>(initial: T) {
  return vi.fn((value: T | ((current: T) => T)) => {
    if (typeof value === "function") {
      (value as (current: T) => T)(initial);
    }
  });
}

function createParams(overrides: Partial<UseRuntimeActionsParams> = {}): UseRuntimeActionsParams {
  return {
    setWorkspace: stateSetter(emptyWorkspace()),
    setLocalStackLogs: vi.fn(),
    setLocalStackLogsStatus: vi.fn(),
    setLocalStackActionStatus: vi.fn(),
    setLocalStackActionInFlight: vi.fn(),
    localStackAuthToken: "ls-token",
    localStackPersistence: true,
    localStackEnvironmentText: "FOO=bar\nLOCALSTACK_AUTH_TOKEN=secret\n",
    setFlociAzLogs: vi.fn(),
    setFlociAzLogsStatus: vi.fn(),
    setFlociAzActionStatus: vi.fn(),
    setFlociAzActionInFlight: vi.fn(),
    flociAzPersistence: false,
    flociAzEnvironmentText: "AZURE_ENV=dev",
    setActiveWorkspaceTabId: vi.fn(),
    reloadProvidersAndProfiles: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("runtime action pure helpers", () => {
  it("parseEnvironment skips comments, blanks, and blocked keys", () => {
    const env = parseEnvironment(
      ["# comment", "", "FOO=bar", "BAZ=one=two", "LOCALSTACK_AUTH_TOKEN=x", "1BAD=no"].join("\n"),
      ["LOCALSTACK_AUTH_TOKEN"],
    );
    expect(env).toEqual({ FOO: "bar", BAZ: "one=two" });
  });

  it("labels and methods match product copy", () => {
    expect(emulatorDisplayName("localstack")).toBe("LocalStack");
    expect(emulatorDisplayName("floci-az")).toBe("floci-az");
    expect(emulatorActionLabel("localstack", "prepareProfile")).toBe("Prepare LocalStack profile");
    expect(emulatorActionLabel("floci-az", "prepareProfile")).toBe("Prepare floci-az config");
    expect(emulatorActionLabel("localstack", "start")).toBe("Start LocalStack");
    expect(emulatorActionLabel("floci-az", "recreate")).toBe("Recreate floci-az");
    expect(emulatorActionMethod("prepareProfile")).toBe("emulators.prepareProfile");
    expect(emulatorActionMethod("stop")).toBe("emulators.stop");
    expect(emulatorActionMethod("start")).toBe("emulators.start");
    expect(emulatorActionMethod("recreate")).toBe("emulators.start");
  });

  it("keeps recreate 95s vs default 22s timeouts", () => {
    expect(emulatorActionTimeoutMs("start")).toBe(EMULATOR_ACTION_TIMEOUT_MS.default);
    expect(emulatorActionTimeoutMs("stop")).toBe(EMULATOR_ACTION_TIMEOUT_MS.default);
    expect(emulatorActionTimeoutMs("recreate")).toBe(EMULATOR_ACTION_TIMEOUT_MS.recreate);
    expect(EMULATOR_ACTION_TIMEOUT_MS.default).toBe(22_000);
    expect(EMULATOR_ACTION_TIMEOUT_MS.recreate).toBe(95_000);
    expect(EMULATOR_POLL.attempts).toBe(12);
    expect(EMULATOR_POLL.intervalMs).toBe(2_500);
  });

  it("buildEmulatorActionParams keeps start minimal and recreate flagged", () => {
    expect(buildEmulatorActionParams("localstack", "stop")).toEqual({ emulatorId: "localstack" });
    expect(
      buildEmulatorActionParams("localstack", "start", {
        authToken: "tok",
        persistence: true,
        environment: { FOO: "bar" },
      }),
    ).toEqual({
      emulatorId: "localstack",
      authToken: "tok",
      persistence: true,
      environment: { FOO: "bar" },
    });
    expect(
      buildEmulatorActionParams("floci-az", "recreate", {
        authToken: "ignored",
        persistence: false,
        environment: {},
      }),
    ).toEqual({
      emulatorId: "floci-az",
      persistence: false,
      environment: {},
      recreate: true,
    });
  });
});

describe("useRuntimeActions invokeEmulatorAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    fetchVirtualisationStatus.mockResolvedValue({
      dockerRuntime: emptyWorkspace().dockerRuntime,
      dockerResources: [],
      emulatorSummaries: [],
      dockerDiagnostics: emptyWorkspace().dockerDiagnostics,
    });
    fetchEmulatorLogs.mockImplementation(async (emulatorId: string) => emptyLogs(emulatorId));
    emulatorStatusFromWorkspace.mockReturnValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts LocalStack with auth token and polls for running", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    backendRequest.mockResolvedValue(actionResult("localstack", "LocalStack is up"));
    emulatorStatusFromWorkspace.mockReturnValue({
      emulatorId: "localstack",
      status: "running",
      summary: "healthy",
    });

    const params = createParams();
    const { result } = renderHook(() => useRuntimeActions(params));

    await act(async () => {
      await result.current.invokeLocalStackAction("start");
    });

    expect(backendRequest).toHaveBeenCalledWith("emulators.start", {
      emulatorId: "localstack",
      authToken: "ls-token",
      persistence: true,
      environment: { FOO: "bar" },
    });
    expect(params.setLocalStackActionInFlight).toHaveBeenCalledWith(true);
    expect(params.setLocalStackActionInFlight).toHaveBeenCalledWith(false);
    expect(params.setLocalStackActionStatus).toHaveBeenCalledWith("LocalStack is up");
    expect(fetchEmulatorLogs).toHaveBeenCalledWith("localstack");
    expect(notify).toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(EMULATOR_POLL.intervalMs);
    });

    expect(fetchVirtualisationStatus).toHaveBeenCalled();
    expect(params.setLocalStackActionStatus).toHaveBeenCalledWith(
      "Start LocalStack completed. healthy",
    );
  });

  it("starts floci-az without auth token via shared invoke path", async () => {
    backendRequest.mockResolvedValue(actionResult("floci-az", "floci-az is up"));

    const params = createParams();
    const { result } = renderHook(() => useRuntimeActions(params));

    await act(async () => {
      await result.current.invokeFlociAzAction("start");
    });

    expect(backendRequest).toHaveBeenCalledWith("emulators.start", {
      emulatorId: "floci-az",
      persistence: false,
      environment: { AZURE_ENV: "dev" },
    });
    expect(params.setFlociAzActionStatus).toHaveBeenCalledWith("floci-az is up");
    expect(fetchEmulatorLogs).toHaveBeenCalledWith("floci-az");
  });

  it("invokeEmulatorAction accepts LocalStack authToken override in options", async () => {
    backendRequest.mockResolvedValue(actionResult("localstack", "ok"));

    const params = createParams();
    const { result } = renderHook(() => useRuntimeActions(params));

    await act(async () => {
      await result.current.invokeEmulatorAction("localstack", "recreate", {
        authToken: "override-token",
      });
    });

    expect(backendRequest).toHaveBeenCalledWith("emulators.start", {
      emulatorId: "localstack",
      authToken: "override-token",
      persistence: true,
      environment: { FOO: "bar" },
      recreate: true,
    });
  });

  it("prepareProfile reloads providers for both products", async () => {
    backendRequest.mockResolvedValue(actionResult("localstack", "profile ready"));

    const params = createParams();
    const { result } = renderHook(() => useRuntimeActions(params));

    await act(async () => {
      await result.current.invokeLocalStackAction("prepareProfile");
    });

    expect(backendRequest).toHaveBeenCalledWith("emulators.prepareProfile", {
      emulatorId: "localstack",
    });
    expect(params.reloadProvidersAndProfiles).toHaveBeenCalled();
  });

  it("surfaces timeout warning and continues polling", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    backendRequest.mockImplementation(
      () =>
        new Promise(() => {
          /* never resolves so withTimeout wins */
        }),
    );

    const params = createParams();
    const { result } = renderHook(() => useRuntimeActions(params));

    await act(async () => {
      const pending = result.current.invokeFlociAzAction("stop");
      await vi.advanceTimersByTimeAsync(EMULATOR_ACTION_TIMEOUT_MS.default + 50);
      await pending;
    });

    expect(params.setFlociAzActionStatus).toHaveBeenCalledWith(
      expect.stringContaining("did not finish within 22 seconds"),
    );
    expect(notify).toHaveBeenCalledWith(
      "warning",
      "Stop floci-az still pending",
      expect.stringContaining("did not finish within 22 seconds"),
      expect.anything(),
    );
  });
});
