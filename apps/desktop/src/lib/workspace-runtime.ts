// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { backendRequest } from "@/lib/backend";
import type { EmulatorLogSnapshot, RuntimeSnapshot } from "@/types/backend";

/** Engine and emulator status from `runtime.get` (no container log tails). */
export type VirtualisationStatusResult = {
  dockerRuntime: RuntimeSnapshot["dockerRuntime"];
  dockerResources: RuntimeSnapshot["dockerResources"];
  emulatorSummaries: RuntimeSnapshot["emulatorSummaries"];
  dockerDiagnostics: RuntimeSnapshot["dockerDiagnostics"];
};

const DEFAULT_LOG_TAIL = 200;

/**
 * Poll-friendly status fetch: one RPC for Docker engine, managed resources,
 * and emulator summaries. Does not read container log tails.
 */
export async function fetchVirtualisationStatus(): Promise<VirtualisationStatusResult> {
  const runtimeResult = await backendRequest<RuntimeSnapshot>("runtime.get");
  return {
    dockerRuntime: runtimeResult.dockerRuntime,
    dockerResources: runtimeResult.dockerResources,
    emulatorSummaries: runtimeResult.emulatorSummaries,
    dockerDiagnostics: runtimeResult.dockerDiagnostics,
  };
}

/**
 * On-demand emulator log tail. Failures resolve to an empty snapshot with
 * the error message in `summary` so the UI can show copy without throwing.
 */
export async function fetchEmulatorLogs(
  emulatorId: string,
  tail: number = DEFAULT_LOG_TAIL,
): Promise<EmulatorLogSnapshot> {
  try {
    return await backendRequest<EmulatorLogSnapshot>("emulators.logs", { emulatorId, tail });
  } catch (error) {
    const label = emulatorId === "floci-az" ? "floci-az" : "LocalStack";
    return {
      emulatorId,
      lines: [],
      summary: error instanceof Error ? error.message : `Failed to load ${label} logs.`,
    };
  }
}
