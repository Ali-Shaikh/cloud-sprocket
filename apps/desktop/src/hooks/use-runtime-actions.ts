// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { startTransition, useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";

import { backendRequest } from "@/lib/backend";
import { notify, type NotificationTone } from "@/lib/notify";
import {
  dockerDiagnosticsFromRuntime,
  emulatorStatusFromWorkspace,
  normaliseEmulatorLogSnapshot,
} from "@/lib/workspace-shell";
import { fetchEmulatorLogs, fetchVirtualisationStatus } from "@/lib/workspace-runtime";
import { normaliseWorkspaceSnapshot } from "@/lib/workspace-snapshot";
import type {
  DockerRuntimeSnapshot,
  EmulatorActionResult,
  EmulatorLogSnapshot,
  ManagedDockerResource,
  WorkspaceSnapshot,
} from "@/types/backend";

/** Known local emulator product ids for runtime actions. */
export type RuntimeEmulatorId = "localstack" | "floci-az";

export type EmulatorLifecycleAction = "prepareProfile" | "start" | "stop" | "recreate";

/** Options for start/recreate; LocalStack alone uses authToken. */
export type InvokeEmulatorActionOptions = {
  authToken?: string;
  persistence?: boolean;
  environment?: Record<string, string>;
};

export const EMULATOR_ACTION_TIMEOUT_MS = {
  default: 22_000,
  recreate: 95_000,
} as const;

export const EMULATOR_POLL = {
  attempts: 12,
  intervalMs: 2_500,
} as const;

export function parseEnvironment(text: string, blockedKeys: string[] = []): Record<string, string> {
  const env: Record<string, string> = {};
  const blocked = new Set(blockedKeys);
  text.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }
    const parts = trimmed.split("=");
    if (parts.length >= 2) {
      const key = parts[0].trim();
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) && !blocked.has(key)) {
        env[key] = parts.slice(1).join("=").trim();
      }
    }
  });
  return env;
}

export function emulatorDisplayName(emulatorId: RuntimeEmulatorId): string {
  return emulatorId === "floci-az" ? "floci-az" : "LocalStack";
}

export function emulatorActionLabel(
  emulatorId: RuntimeEmulatorId,
  action: EmulatorLifecycleAction,
): string {
  const name = emulatorDisplayName(emulatorId);
  switch (action) {
    case "prepareProfile":
      return emulatorId === "floci-az" ? `Prepare ${name} config` : `Prepare ${name} profile`;
    case "start":
      return `Start ${name}`;
    case "recreate":
      return `Recreate ${name}`;
    case "stop":
      return `Stop ${name}`;
  }
}

export function emulatorActionMethod(action: EmulatorLifecycleAction): string {
  if (action === "prepareProfile") {
    return "emulators.prepareProfile";
  }
  if (action === "stop") {
    return "emulators.stop";
  }
  return "emulators.start";
}

export function emulatorActionTimeoutMs(action: EmulatorLifecycleAction): number {
  return action === "recreate" ? EMULATOR_ACTION_TIMEOUT_MS.recreate : EMULATOR_ACTION_TIMEOUT_MS.default;
}

export function buildEmulatorActionParams(
  emulatorId: RuntimeEmulatorId,
  action: EmulatorLifecycleAction,
  options: InvokeEmulatorActionOptions = {},
): Record<string, unknown> {
  if (action !== "start" && action !== "recreate") {
    return { emulatorId };
  }
  const params: Record<string, unknown> = {
    emulatorId,
    persistence: options.persistence ?? false,
    environment: options.environment ?? {},
  };
  if (emulatorId === "localstack" && options.authToken !== undefined) {
    params.authToken = options.authToken;
  }
  // Only sent for recreate so a normal start keeps its minimal payload.
  if (action === "recreate") {
    params.recreate = true;
  }
  return params;
}

function withTimeout<T>(promise: Promise<T>, ms: number, errorMessage: string): Promise<T> {
  const timeout = new Promise<never>((_, reject) => {
    window.setTimeout(() => reject(new Error(errorMessage)), ms);
  });
  return Promise.race([promise, timeout]);
}

export type UseRuntimeActionsParams = {
  setWorkspace: Dispatch<SetStateAction<WorkspaceSnapshot>>;
  setLocalStackLogs: Dispatch<SetStateAction<EmulatorLogSnapshot>>;
  setLocalStackLogsStatus: Dispatch<SetStateAction<string>>;
  setLocalStackActionStatus: Dispatch<SetStateAction<string>>;
  setLocalStackActionInFlight: Dispatch<SetStateAction<boolean>>;
  localStackAuthToken: string;
  localStackPersistence: boolean;
  localStackEnvironmentText: string;
  setFlociAzLogs: Dispatch<SetStateAction<EmulatorLogSnapshot>>;
  setFlociAzLogsStatus: Dispatch<SetStateAction<string>>;
  setFlociAzActionStatus: Dispatch<SetStateAction<string>>;
  setFlociAzActionInFlight: Dispatch<SetStateAction<boolean>>;
  flociAzPersistence: boolean;
  flociAzEnvironmentText: string;
  setActiveWorkspaceTabId: Dispatch<SetStateAction<string>>;
  reloadProvidersAndProfiles: () => Promise<void>;
};

export function useRuntimeActions({
  setWorkspace,
  setLocalStackLogs,
  setLocalStackLogsStatus,
  setLocalStackActionStatus,
  setLocalStackActionInFlight,
  localStackAuthToken,
  localStackPersistence,
  localStackEnvironmentText,
  setFlociAzLogs,
  setFlociAzLogsStatus,
  setFlociAzActionStatus,
  setFlociAzActionInFlight,
  flociAzPersistence,
  flociAzEnvironmentText,
  setActiveWorkspaceTabId,
  reloadProvidersAndProfiles,
}: UseRuntimeActionsParams) {
  const refreshDockerRuntime = useCallback(async (): Promise<void> => {
    const [dockerRuntime, dockerResources] = await Promise.all([
      backendRequest<DockerRuntimeSnapshot>("docker.runtime.get"),
      backendRequest<ManagedDockerResource[]>("docker.resources.list"),
    ]);
    startTransition(() => {
      setWorkspace((current) =>
        normaliseWorkspaceSnapshot({
          ...current,
          dockerRuntime,
          dockerResources,
          dockerDiagnostics: dockerDiagnosticsFromRuntime(dockerRuntime),
        }),
      );
    });
  }, [setWorkspace]);

  /** Status only (`runtime.get`). Log tails load on Refresh Logs or tab enter. */
  const refreshVirtualisationState = useCallback(async (): Promise<WorkspaceSnapshot> => {
    const result = await fetchVirtualisationStatus();
    return await new Promise<WorkspaceSnapshot>((resolve) => {
      startTransition(() => {
        setWorkspace((current) => {
          const nextWorkspace = normaliseWorkspaceSnapshot({
            ...current,
            dockerRuntime: result.dockerRuntime,
            dockerResources: result.dockerResources,
            emulatorSummaries: result.emulatorSummaries,
            dockerDiagnostics: result.dockerDiagnostics,
          });
          resolve(nextWorkspace);
          return nextWorkspace;
        });
      });
    });
  }, [setWorkspace]);

  const refreshLocalStackLogs = useCallback(async (): Promise<void> => {
    setLocalStackLogsStatus("Refreshing LocalStack logs...");
    try {
      const logsResult = await fetchEmulatorLogs("localstack");
      setLocalStackLogs(normaliseEmulatorLogSnapshot(logsResult));
      setLocalStackLogsStatus("");
    } catch (error) {
      // Keep the last successful tail; only surface the failure in status.
      setLocalStackLogsStatus(
        error instanceof Error ? error.message : "Failed to load LocalStack logs.",
      );
    }
  }, [setLocalStackLogs, setLocalStackLogsStatus]);

  const refreshFlociAzLogs = useCallback(async (): Promise<void> => {
    setFlociAzLogsStatus("Refreshing floci-az logs...");
    try {
      const logsResult = await fetchEmulatorLogs("floci-az");
      setFlociAzLogs(normaliseEmulatorLogSnapshot(logsResult));
      setFlociAzLogsStatus("");
    } catch (error) {
      setFlociAzLogsStatus(
        error instanceof Error ? error.message : "Failed to load floci-az logs.",
      );
    }
  }, [setFlociAzLogs, setFlociAzLogsStatus]);

  const refreshEmulatorLogs = useCallback(
    async (emulatorId: RuntimeEmulatorId): Promise<void> => {
      if (emulatorId === "floci-az") {
        await refreshFlociAzLogs();
        return;
      }
      await refreshLocalStackLogs();
    },
    [refreshFlociAzLogs, refreshLocalStackLogs],
  );

  const localStackEnvironment = useCallback((): Record<string, string> => {
    return parseEnvironment(localStackEnvironmentText, ["LOCALSTACK_AUTH_TOKEN", "PERSISTENCE"]);
  }, [localStackEnvironmentText]);

  const flociAzEnvironment = useCallback((): Record<string, string> => {
    return parseEnvironment(flociAzEnvironmentText);
  }, [flociAzEnvironmentText]);

  const resolveStartOptions = useCallback(
    (
      emulatorId: RuntimeEmulatorId,
      options?: InvokeEmulatorActionOptions,
    ): InvokeEmulatorActionOptions => {
      if (emulatorId === "floci-az") {
        return {
          persistence: options?.persistence ?? flociAzPersistence,
          environment: options?.environment ?? flociAzEnvironment(),
        };
      }
      return {
        authToken: options?.authToken ?? localStackAuthToken,
        persistence: options?.persistence ?? localStackPersistence,
        environment: options?.environment ?? localStackEnvironment(),
      };
    },
    [
      flociAzEnvironment,
      flociAzPersistence,
      localStackAuthToken,
      localStackEnvironment,
      localStackPersistence,
    ],
  );

  const setActionStatus = useCallback(
    (emulatorId: RuntimeEmulatorId, status: string): void => {
      if (emulatorId === "floci-az") {
        setFlociAzActionStatus(status);
        return;
      }
      setLocalStackActionStatus(status);
    },
    [setFlociAzActionStatus, setLocalStackActionStatus],
  );

  const setActionInFlight = useCallback(
    (emulatorId: RuntimeEmulatorId, inFlight: boolean): void => {
      if (emulatorId === "floci-az") {
        setFlociAzActionInFlight(inFlight);
        return;
      }
      setLocalStackActionInFlight(inFlight);
    },
    [setFlociAzActionInFlight, setLocalStackActionInFlight],
  );

  const emulatorNotifyOptions = useCallback(
    (tone: NotificationTone) => {
      if (tone === "error" || tone === "warning") {
        return {
          action: {
            label: "View logs",
            run: () => setActiveWorkspaceTabId("virtualisation"),
          },
        };
      }
      return undefined;
    },
    [setActiveWorkspaceTabId],
  );

  const addEmulatorNotification = useCallback(
    (_emulatorId: RuntimeEmulatorId, tone: NotificationTone, header: string, content: string): void => {
      notify(tone, header, content, emulatorNotifyOptions(tone));
    },
    [emulatorNotifyOptions],
  );

  /** Shared status poll after start/stop/recreate (no log tails). */
  const pollEmulatorState = useCallback(
    (
      emulatorId: RuntimeEmulatorId,
      label: string,
      expectedStatus?: "running" | "stopped",
    ): void => {
      let resolved = false;
      for (let attempt = 0; attempt < EMULATOR_POLL.attempts; attempt += 1) {
        window.setTimeout(() => {
          if (resolved) {
            return;
          }
          void refreshVirtualisationState().then((workspaceSnapshot) => {
            if (resolved) {
              return;
            }
            const status = emulatorStatusFromWorkspace(workspaceSnapshot, emulatorId);
            if (expectedStatus && status?.status === expectedStatus) {
              resolved = true;
              const message = `${label} completed. ${status.summary}`;
              setActionStatus(emulatorId, message);
              addEmulatorNotification(emulatorId, "success", `${label} completed`, status.summary);
              return;
            }
            if (!expectedStatus && attempt === EMULATOR_POLL.attempts - 1) {
              resolved = true;
              setActionStatus(emulatorId, `${label} completed.`);
            }
          });
        }, (attempt + 1) * EMULATOR_POLL.intervalMs);
      }
    },
    [addEmulatorNotification, refreshVirtualisationState, setActionStatus],
  );

  const invokeEmulatorAction = useCallback(
    async (
      emulatorId: RuntimeEmulatorId,
      action: EmulatorLifecycleAction,
      options?: InvokeEmulatorActionOptions,
    ): Promise<void> => {
      const method = emulatorActionMethod(action);
      const startOptions = resolveStartOptions(emulatorId, options);
      const startParams = buildEmulatorActionParams(emulatorId, action, startOptions);
      const label = emulatorActionLabel(emulatorId, action);
      const name = emulatorDisplayName(emulatorId);
      const requestTimeoutMs = emulatorActionTimeoutMs(action);

      setActionInFlight(emulatorId, true);
      setActionStatus(emulatorId, `${label} requested.`);
      try {
        const result = await withTimeout(
          backendRequest<EmulatorActionResult>(method, startParams),
          requestTimeoutMs,
          `${label} did not finish within ${Math.round(requestTimeoutMs / 1000)} seconds. Check Docker and ${name} logs, then retry.`,
        );
        const summary = result.summary || `${label} completed.`;
        setActionStatus(emulatorId, summary);
        addEmulatorNotification(
          emulatorId,
          result.state === "failed" ? "error" : result.state === "degraded" ? "warning" : "success",
          result.state === "degraded" ? `${label} needs attention` : `${label} ${result.state}`,
          summary,
        );
        await refreshVirtualisationState();
        await refreshEmulatorLogs(emulatorId);
        if (action === "prepareProfile") {
          await reloadProvidersAndProfiles().catch(() => undefined);
        }
        if (action === "start" || action === "recreate" || action === "stop") {
          pollEmulatorState(emulatorId, label, action === "stop" ? "stopped" : "running");
        }
      } catch (error) {
        const rawMessage = error instanceof Error ? error.message : `${label} failed.`;
        const timedOut = rawMessage.includes("did not finish within");
        const message =
          rawMessage === `${label} failed.`
            ? `${label} failed. Docker did not complete the request. Try Recreate ${name}, refresh Docker, check the logs, then retry.`
            : rawMessage;
        setActionStatus(emulatorId, message);
        addEmulatorNotification(
          emulatorId,
          timedOut ? "warning" : "error",
          timedOut ? `${label} still pending` : `${label} failed`,
          message,
        );
        await refreshVirtualisationState().catch(() => undefined);
        if (timedOut && (action === "start" || action === "recreate" || action === "stop")) {
          pollEmulatorState(emulatorId, label, action === "stop" ? "stopped" : "running");
        }
      } finally {
        setActionInFlight(emulatorId, false);
      }
    },
    [
      addEmulatorNotification,
      pollEmulatorState,
      refreshEmulatorLogs,
      refreshVirtualisationState,
      reloadProvidersAndProfiles,
      resolveStartOptions,
      setActionInFlight,
      setActionStatus,
    ],
  );

  /** Public wrapper: LocalStack lifecycle (auth token from hook state). */
  const invokeLocalStackAction = useCallback(
    async (action: EmulatorLifecycleAction): Promise<void> => {
      await invokeEmulatorAction("localstack", action, { authToken: localStackAuthToken });
    },
    [invokeEmulatorAction, localStackAuthToken],
  );

  /** Public wrapper: floci-az lifecycle. */
  const invokeFlociAzAction = useCallback(
    async (action: EmulatorLifecycleAction): Promise<void> => {
      await invokeEmulatorAction("floci-az", action);
    },
    [invokeEmulatorAction],
  );

  return {
    refreshDockerRuntime,
    refreshVirtualisationState,
    refreshLocalStackLogs,
    refreshFlociAzLogs,
    invokeEmulatorAction,
    invokeLocalStackAction,
    invokeFlociAzAction,
  };
}
