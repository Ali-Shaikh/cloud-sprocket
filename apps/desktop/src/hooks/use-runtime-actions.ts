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
import { fetchVirtualisationSnapshot } from "@/lib/workspace-runtime";
import { normaliseWorkspaceSnapshot } from "@/lib/workspace-snapshot";
import type {
  DockerRuntimeSnapshot,
  EmulatorActionResult,
  EmulatorLogSnapshot,
  ManagedDockerResource,
  WorkspaceSnapshot,
} from "@/types/backend";

function parseEnvironment(text: string, blockedKeys: string[] = []): Record<string, string> {
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

  const refreshVirtualisationState = useCallback(async (): Promise<WorkspaceSnapshot> => {
    const result = await fetchVirtualisationSnapshot();
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
        setLocalStackLogs(normaliseEmulatorLogSnapshot(result.localStackLogs));
        setFlociAzLogs(normaliseEmulatorLogSnapshot(result.flociAzLogs));
      });
    });
  }, [setFlociAzLogs, setLocalStackLogs, setWorkspace]);

  const refreshLocalStackLogs = useCallback(async (): Promise<void> => {
    setLocalStackLogsStatus("Refreshing LocalStack logs...");
    try {
      const logsResult = await backendRequest<EmulatorLogSnapshot>("emulators.logs", {
        emulatorId: "localstack",
        tail: 200,
      });
      setLocalStackLogs(normaliseEmulatorLogSnapshot(logsResult));
      setLocalStackLogsStatus("");
    } catch (error) {
      setLocalStackLogsStatus(error instanceof Error ? error.message : "Failed to refresh logs.");
    }
  }, [setLocalStackLogs, setLocalStackLogsStatus]);

  const refreshFlociAzLogs = useCallback(async (): Promise<void> => {
    setFlociAzLogsStatus("Refreshing floci-az logs...");
    try {
      const logsResult = await backendRequest<EmulatorLogSnapshot>("emulators.logs", {
        emulatorId: "floci-az",
        tail: 200,
      });
      setFlociAzLogs(normaliseEmulatorLogSnapshot(logsResult));
      setFlociAzLogsStatus("");
    } catch (error) {
      setFlociAzLogsStatus(error instanceof Error ? error.message : "Failed to refresh logs.");
    }
  }, [setFlociAzLogs, setFlociAzLogsStatus]);

  const localStackEnvironment = useCallback((): Record<string, string> => {
    return parseEnvironment(localStackEnvironmentText, ["LOCALSTACK_AUTH_TOKEN", "PERSISTENCE"]);
  }, [localStackEnvironmentText]);

  const flociAzEnvironment = useCallback((): Record<string, string> => {
    return parseEnvironment(flociAzEnvironmentText);
  }, [flociAzEnvironmentText]);

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

  const addLocalStackNotification = useCallback(
    (tone: NotificationTone, header: string, content: string): void => {
      notify(tone, header, content, emulatorNotifyOptions(tone));
    },
    [emulatorNotifyOptions],
  );

  const addEmulatorNotification = useCallback(
    (_emulatorId: string, tone: NotificationTone, header: string, content: string): void => {
      notify(tone, header, content, emulatorNotifyOptions(tone));
    },
    [emulatorNotifyOptions],
  );

  const pollLocalStackState = useCallback(
    (label: string, expectedStatus?: "running" | "stopped"): void => {
      let resolved = false;
      for (let attempt = 0; attempt < 12; attempt += 1) {
        window.setTimeout(() => {
          if (resolved) {
            return;
          }
          void refreshVirtualisationState().then((workspaceSnapshot) => {
            if (resolved) {
              return;
            }
            const localStack = emulatorStatusFromWorkspace(workspaceSnapshot, "localstack");
            if (expectedStatus && localStack?.status === expectedStatus) {
              resolved = true;
              const message = `${label} completed. ${localStack.summary}`;
              setLocalStackActionStatus(message);
              addLocalStackNotification("success", `${label} completed`, localStack.summary);
              return;
            }
            if (!expectedStatus && attempt === 11) {
              resolved = true;
              setLocalStackActionStatus(`${label} completed.`);
            }
          });
        }, (attempt + 1) * 2500);
      }
    },
    [addLocalStackNotification, refreshVirtualisationState, setLocalStackActionStatus],
  );

  const pollFlociAzState = useCallback(
    (label: string, expectedStatus?: "running" | "stopped"): void => {
      let resolved = false;
      for (let attempt = 0; attempt < 12; attempt += 1) {
        window.setTimeout(() => {
          if (resolved) {
            return;
          }
          void refreshVirtualisationState().then((workspaceSnapshot) => {
            if (resolved) {
              return;
            }
            const flociAz = emulatorStatusFromWorkspace(workspaceSnapshot, "floci-az");
            if (expectedStatus && flociAz?.status === expectedStatus) {
              resolved = true;
              const message = `${label} completed. ${flociAz.summary}`;
              setFlociAzActionStatus(message);
              addEmulatorNotification("floci-az", "success", `${label} completed`, flociAz.summary);
              return;
            }
            if (!expectedStatus && attempt === 11) {
              resolved = true;
              setFlociAzActionStatus(`${label} completed.`);
            }
          });
        }, (attempt + 1) * 2500);
      }
    },
    [addEmulatorNotification, refreshVirtualisationState, setFlociAzActionStatus],
  );

  const invokeLocalStackAction = useCallback(
    async (action: "prepareProfile" | "start" | "stop" | "recreate"): Promise<void> => {
      const method =
        action === "prepareProfile"
          ? "emulators.prepareProfile"
          : action === "stop"
            ? "emulators.stop"
            : "emulators.start";
      const startParams =
        action === "start" || action === "recreate"
          ? {
              emulatorId: "localstack",
              authToken: localStackAuthToken,
              persistence: localStackPersistence,
              environment: localStackEnvironment(),
              // Only sent for recreate so a normal start keeps its minimal payload.
              ...(action === "recreate" ? { recreate: true } : {}),
            }
          : { emulatorId: "localstack" };
      const label =
        action === "prepareProfile"
          ? "Prepare LocalStack profile"
          : action === "start"
            ? "Start LocalStack"
            : action === "recreate"
              ? "Recreate LocalStack"
              : "Stop LocalStack";
      const requestTimeoutMs = action === "recreate" ? 95000 : 22000;
      setLocalStackActionInFlight(true);
      setLocalStackActionStatus(`${label} requested.`);
      try {
        const result = await withTimeout(
          backendRequest<EmulatorActionResult>(method, startParams),
          requestTimeoutMs,
          `${label} did not finish within ${Math.round(requestTimeoutMs / 1000)} seconds. Check Docker and LocalStack logs, then retry.`,
        );
        const summary = result.summary || `${label} completed.`;
        setLocalStackActionStatus(summary);
        addLocalStackNotification(
          result.state === "failed" ? "error" : result.state === "degraded" ? "warning" : "success",
          result.state === "degraded" ? `${label} needs attention` : `${label} ${result.state}`,
          summary,
        );
        await refreshVirtualisationState();
        await refreshLocalStackLogs();
        if (action === "prepareProfile") {
          await reloadProvidersAndProfiles().catch(() => undefined);
        }
        if (action === "start" || action === "recreate" || action === "stop") {
          pollLocalStackState(label, action === "stop" ? "stopped" : "running");
        }
      } catch (error) {
        const rawMessage = error instanceof Error ? error.message : `${label} failed.`;
        const timedOut = rawMessage.includes("did not finish within");
        const message =
          rawMessage === `${label} failed.`
            ? `${label} failed. Docker did not complete the request. Try Recreate LocalStack, refresh Docker, check the logs, then retry.`
            : rawMessage;
        setLocalStackActionStatus(message);
        addLocalStackNotification(
          timedOut ? "warning" : "error",
          timedOut ? `${label} still pending` : `${label} failed`,
          message,
        );
        await refreshVirtualisationState().catch(() => undefined);
        if (timedOut && (action === "start" || action === "recreate" || action === "stop")) {
          pollLocalStackState(label, action === "stop" ? "stopped" : "running");
        }
      } finally {
        setLocalStackActionInFlight(false);
      }
    },
    [
      addLocalStackNotification,
      localStackAuthToken,
      localStackEnvironment,
      localStackPersistence,
      pollLocalStackState,
      refreshLocalStackLogs,
      refreshVirtualisationState,
      reloadProvidersAndProfiles,
      setLocalStackActionInFlight,
      setLocalStackActionStatus,
    ],
  );

  const invokeFlociAzAction = useCallback(
    async (action: "prepareProfile" | "start" | "stop" | "recreate"): Promise<void> => {
      const method =
        action === "prepareProfile"
          ? "emulators.prepareProfile"
          : action === "stop"
            ? "emulators.stop"
            : "emulators.start";
      const startParams =
        action === "start" || action === "recreate"
          ? {
              emulatorId: "floci-az",
              persistence: flociAzPersistence,
              environment: flociAzEnvironment(),
              // Only sent for recreate so a normal start keeps its minimal payload.
              ...(action === "recreate" ? { recreate: true } : {}),
            }
          : { emulatorId: "floci-az" };
      const label =
        action === "prepareProfile"
          ? "Prepare floci-az config"
          : action === "start"
            ? "Start floci-az"
            : action === "recreate"
              ? "Recreate floci-az"
              : "Stop floci-az";
      const requestTimeoutMs = action === "recreate" ? 95000 : 22000;
      setFlociAzActionInFlight(true);
      setFlociAzActionStatus(`${label} requested.`);
      try {
        const result = await withTimeout(
          backendRequest<EmulatorActionResult>(method, startParams),
          requestTimeoutMs,
          `${label} did not finish within ${Math.round(requestTimeoutMs / 1000)} seconds. Check Docker and floci-az logs, then retry.`,
        );
        const summary = result.summary || `${label} completed.`;
        setFlociAzActionStatus(summary);
        addEmulatorNotification(
          "floci-az",
          result.state === "failed" ? "error" : result.state === "degraded" ? "warning" : "success",
          result.state === "degraded" ? `${label} needs attention` : `${label} ${result.state}`,
          summary,
        );
        await refreshVirtualisationState();
        await refreshFlociAzLogs();
        if (action === "prepareProfile") {
          await reloadProvidersAndProfiles().catch(() => undefined);
        }
        if (action === "start" || action === "recreate" || action === "stop") {
          pollFlociAzState(label, action === "stop" ? "stopped" : "running");
        }
      } catch (error) {
        const rawMessage = error instanceof Error ? error.message : `${label} failed.`;
        const timedOut = rawMessage.includes("did not finish within");
        const message =
          rawMessage === `${label} failed.`
            ? `${label} failed. Docker did not complete the request. Try Recreate floci-az, refresh Docker, check the logs, then retry.`
            : rawMessage;
        setFlociAzActionStatus(message);
        addEmulatorNotification(
          "floci-az",
          timedOut ? "warning" : "error",
          timedOut ? `${label} still pending` : `${label} failed`,
          message,
        );
        await refreshVirtualisationState().catch(() => undefined);
        if (timedOut && (action === "start" || action === "recreate" || action === "stop")) {
          pollFlociAzState(label, action === "stop" ? "stopped" : "running");
        }
      } finally {
        setFlociAzActionInFlight(false);
      }
    },
    [
      addEmulatorNotification,
      flociAzEnvironment,
      flociAzPersistence,
      pollFlociAzState,
      refreshFlociAzLogs,
      refreshVirtualisationState,
      reloadProvidersAndProfiles,
      setFlociAzActionInFlight,
      setFlociAzActionStatus,
    ],
  );

  return {
    refreshDockerRuntime,
    refreshVirtualisationState,
    refreshLocalStackLogs,
    refreshFlociAzLogs,
    invokeLocalStackAction,
    invokeFlociAzAction,
  };
}