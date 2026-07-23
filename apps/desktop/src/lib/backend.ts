// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

/**
 * Public backend client facade.
 *
 * Implementation lives in backend-ipc.ts (Tauri invoke + public helpers).
 * Browser mock fixtures live in backend-mock.ts and are loaded only when
 * the Vite define __ENABLE_BROWSER_MOCK__ is true.
 */

export {
  type BackendEventName,
  type DebugLogEntry,
  type PlanDeploymentRequest,
  type CheckDriftResult,
  getDebugLogs,
  subscribeToDebugLogs,
  addDebugLog,
  clearDebugLogs,
  isTauriRuntime,
  isBrowserMockEnabled,
  listRecipes,
  getRecipe,
  getTofuStatus,
  installTofu,
  listDeployments,
  getDeployment,
  planDeployment,
  applyDeployment,
  destroyDeployment,
  checkDeploymentDrift,
  cancelDeployment,
  deleteDeployment,
  retryPostApplyDeployment,
  importRecipeFolder,
  validateRecipeFolder,
  scaffoldRecipe,
  startLabSession,
  getLabSession,
  verifyLabStep,
  runLabAction,
  resetLabSession,
  openExternalUrl,
  backendRequest,
  subscribeToBackendEvent,
} from "./backend-ipc";
