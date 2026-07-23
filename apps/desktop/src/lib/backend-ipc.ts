// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

/**
 * Real Tauri IPC client plus public backend API.
 *
 * Browser mock fixtures live in backend-mock.ts and are only loaded when
 * __ENABLE_BROWSER_MOCK__ is true (non-Tauri Vite builds / tests).
 */

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { normaliseBackendRequestError } from "./backend-error";
import type {
  ActivityLogEntry,
  Deployment,
  DeploymentJob,
  JobStatus,
  LabRunActionResult,
  LabSession,
  LabStepAction,
  Recipe,
  RecipeManifest,
  StateChangedPayload,
  TofuStatus,
  DriftReport,
} from "../types/backend";

export type BackendEventName =
  | "state.changed"
  | "job.updated"
  | "log.appended"
  | "deployment.log"
  | "deployment.changed"
  | "lab.changed";

export type DebugLogEntry = {
  timestamp: string;
  type: "request" | "response" | "error" | "event" | "console";
  method?: string;
  payload: unknown;
};

const debugLogs: DebugLogEntry[] = [];
let debugLogListener: ((entry: DebugLogEntry) => void) | null = null;
const DEBUG_PAYLOAD_MAX_CHARS = 2_000;

function truncateDebugPayload(payload: unknown): unknown {
  if (payload == null) {
    return payload;
  }
  try {
    const serialised = JSON.stringify(payload);
    if (serialised.length <= DEBUG_PAYLOAD_MAX_CHARS) {
      return payload;
    }
    return {
      truncated: true,
      originalLength: serialised.length,
      preview: `${serialised.slice(0, DEBUG_PAYLOAD_MAX_CHARS)}…`,
    };
  } catch {
    return { truncated: true, preview: String(payload).slice(0, DEBUG_PAYLOAD_MAX_CHARS) };
  }
}

export function getDebugLogs(): DebugLogEntry[] {
  return [...debugLogs];
}

export function subscribeToDebugLogs(listener: (entry: DebugLogEntry) => void): () => void {
  debugLogListener = listener;
  return () => {
    debugLogListener = null;
  };
}

export function addDebugLog(entry: DebugLogEntry): void {
  debugLogs.unshift(entry);
  if (debugLogs.length > 2000) {
    debugLogs.pop();
  }
  if (debugLogListener) {
    debugLogListener(entry);
  }
}

export function clearDebugLogs(): void {
  debugLogs.length = 0;
}

type BackendEventMap = {
  "state.changed": StateChangedPayload;
  "job.updated": JobStatus;
  "log.appended": ActivityLogEntry;
  "deployment.log": import("../types/backend").DeploymentLogEvent;
  "deployment.changed": Deployment;
  "lab.changed": LabSession;
};

function tauriEventName(eventName: BackendEventName): string {
  return eventName.replaceAll(".", ":");
}

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** True when the Vite define includes the browser mock (non-Tauri builds / tests). */
export function isBrowserMockEnabled(): boolean {
  return typeof __ENABLE_BROWSER_MOCK__ !== "undefined" && __ENABLE_BROWSER_MOCK__;
}

// --- IaC recipes & deployments: client wrappers --------------------------------

export async function listRecipes(): Promise<RecipeManifest[]> {
  return backendRequest<RecipeManifest[]>("recipes.list");
}

export async function getRecipe(recipeId: string): Promise<Recipe> {
  return backendRequest<Recipe>("recipes.get", { recipeId });
}

export async function getTofuStatus(): Promise<TofuStatus> {
  return backendRequest<TofuStatus>("tofu.status");
}

export async function installTofu(): Promise<JobStatus> {
  return backendRequest<JobStatus>("tofu.install");
}

export async function listDeployments(): Promise<Deployment[]> {
  return backendRequest<Deployment[]>("deployments.list");
}

export async function getDeployment(deploymentId: string): Promise<Deployment> {
  return backendRequest<Deployment>("deployments.get", { deploymentId });
}

export interface PlanDeploymentRequest {
  recipeId: string;
  name: string;
  providerId: string;
  profileId: string;
  local: boolean;
  runtimeId?: string;
  variables: Record<string, unknown>;
}

export async function planDeployment(request: PlanDeploymentRequest): Promise<DeploymentJob> {
  return backendRequest<DeploymentJob>("deployments.plan", { ...request });
}

export async function applyDeployment(deploymentId: string, policyOverride?: string): Promise<DeploymentJob> {
  return backendRequest<DeploymentJob>("deployments.apply", { deploymentId, policyOverride });
}

export async function destroyDeployment(deploymentId: string): Promise<DeploymentJob> {
  return backendRequest<DeploymentJob>("deployments.destroy", { deploymentId });
}

export interface CheckDriftResult {
  deployment: Deployment;
  drift: DriftReport;
}

export async function checkDeploymentDrift(deploymentId: string): Promise<CheckDriftResult> {
  return backendRequest<CheckDriftResult>("deployments.checkDrift", { deploymentId });
}

export async function cancelDeployment(deploymentId: string): Promise<void> {
  await backendRequest("deployments.cancel", { deploymentId });
}

export async function deleteDeployment(deploymentId: string): Promise<void> {
  await backendRequest("deployments.delete", { deploymentId });
}

export async function retryPostApplyDeployment(deploymentId: string): Promise<DeploymentJob> {
  return backendRequest<DeploymentJob>("deployments.retryPostApply", { deploymentId });
}

export async function importRecipeFolder(
  sourcePath: string,
  confirm = false,
  sourceType?: "folder" | "zip",
): Promise<any> {
  // Local import (C2): folder or zip; preview by default; confirm=true copies after trust review.
  return backendRequest<any>("recipes.import", { sourcePath, confirm, sourceType });
}

export async function validateRecipeFolder(sourcePath: string): Promise<any> {
  // C1 validation against a local recipe directory.
  return backendRequest<any>("recipes.validate", { sourcePath });
}

export async function scaffoldRecipe(destDir: string, provider?: string): Promise<any> {
  // C3 authoring scaffold.
  return backendRequest<any>("recipes.scaffold", { destDir, provider });
}

export async function startLabSession(deploymentId: string): Promise<LabSession> {
  return backendRequest<LabSession>("labs.start", { deploymentId });
}

export async function getLabSession(deploymentId: string): Promise<LabSession> {
  return backendRequest<LabSession>("labs.get", { deploymentId });
}

export async function verifyLabStep(deploymentId: string, stepId: string): Promise<LabSession> {
  return backendRequest<LabSession>("labs.verifyStep", { deploymentId, stepId });
}

export async function runLabAction(
  deploymentId: string,
  stepId: string,
  action: LabStepAction,
  actionIndex?: number,
): Promise<LabRunActionResult> {
  return backendRequest<LabRunActionResult>("labs.runAction", {
    deploymentId,
    stepId,
    actionIndex,
    action,
  });
}

export async function resetLabSession(deploymentId: string): Promise<LabSession> {
  return backendRequest<LabSession>("labs.reset", { deploymentId });
}

// openExternalUrl opens a URL in the user's default browser. The Tauri webview
// blocks plain <a target="_blank"> navigation, so deployment output links must
// go through the opener plugin; in browser/dev we fall back to window.open.
export async function openExternalUrl(url: string): Promise<void> {
  if (isTauriRuntime()) {
    await openUrl(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

export async function backendRequest<T>(
  method: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  const requestId = Math.floor(Math.random() * 1000000);
  addDebugLog({
    timestamp: new Date().toISOString(),
    type: "request",
    method,
    payload: { requestId, params },
  });

  // Build-time gate: when __ENABLE_BROWSER_MOCK__ is false (Tauri builds),
  // bundlers eliminate this branch and the backend-mock module entirely.
  if (__ENABLE_BROWSER_MOCK__ && !isTauriRuntime()) {
    try {
      const { handleMockRequest } = await import("./backend-mock");
      const result = await handleMockRequest<T>(method, params);
      addDebugLog({
        timestamp: new Date().toISOString(),
        type: "response",
        method,
        payload: { requestId, result: truncateDebugPayload(result) },
      });
      return result;
    } catch (error) {
      addDebugLog({
        timestamp: new Date().toISOString(),
        type: "error",
        method,
        payload: { requestId, error: error instanceof Error ? error.message : String(error) },
      });
      throw error;
    }
  }

  try {
    const result = await invoke<T>("backend_request", { method, params });
    addDebugLog({
      timestamp: new Date().toISOString(),
      type: "response",
      method,
      payload: { requestId, result: truncateDebugPayload(result) },
    });
    return result;
  } catch (error) {
    const safeError = normaliseBackendRequestError(error);
    addDebugLog({
      timestamp: new Date().toISOString(),
      type: "error",
      method,
      payload: { requestId, code: safeError.code, error: safeError.message },
    });
    throw safeError;
  }
}

export async function subscribeToBackendEvent<K extends BackendEventName>(
  eventName: K,
  handler: (payload: BackendEventMap[K]) => void,
): Promise<() => void> {
  const wrappedHandler = (payload: BackendEventMap[K]) => {
    addDebugLog({
      timestamp: new Date().toISOString(),
      type: "event",
      method: eventName,
      payload,
    });
    handler(payload);
  };

  if (isTauriRuntime()) {
    const unlisten = await listen<BackendEventMap[K]>(tauriEventName(eventName), (event) => {
      wrappedHandler(event.payload);
    });
    return () => {
      unlisten();
    };
  }

  if (__ENABLE_BROWSER_MOCK__) {
    const { subscribeMockBackendEvent } = await import("./backend-mock");
    return subscribeMockBackendEvent(eventName, wrappedHandler);
  }

  // Non-Tauri build without mock support: no-op unsubscribe.
  return () => {};
}
