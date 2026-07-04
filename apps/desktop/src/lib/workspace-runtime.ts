// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { backendRequest } from "@/lib/backend";
import type { EmulatorLogSnapshot, RuntimeSnapshot } from "@/types/backend";

export type VirtualisationFetchResult = {
  dockerRuntime: RuntimeSnapshot["dockerRuntime"];
  dockerResources: RuntimeSnapshot["dockerResources"];
  emulatorSummaries: RuntimeSnapshot["emulatorSummaries"];
  dockerDiagnostics: RuntimeSnapshot["dockerDiagnostics"];
  localStackLogs: EmulatorLogSnapshot;
  flociAzLogs: EmulatorLogSnapshot;
};

export async function fetchVirtualisationSnapshot(): Promise<VirtualisationFetchResult> {
  const [runtimeResult, logResult, flociLogResult] = await Promise.all([
    backendRequest<RuntimeSnapshot>("runtime.get"),
    backendRequest<EmulatorLogSnapshot>("emulators.logs", { emulatorId: "localstack", tail: 200 }).catch(
      (error) => ({
        emulatorId: "localstack",
        lines: [],
        summary: error instanceof Error ? error.message : "Failed to load LocalStack logs.",
      }),
    ),
    backendRequest<EmulatorLogSnapshot>("emulators.logs", { emulatorId: "floci-az", tail: 200 }).catch(
      (error) => ({
        emulatorId: "floci-az",
        lines: [],
        summary: error instanceof Error ? error.message : "Failed to load floci-az logs.",
      }),
    ),
  ]);

  return {
    dockerRuntime: runtimeResult.dockerRuntime,
    dockerResources: runtimeResult.dockerResources,
    emulatorSummaries: runtimeResult.emulatorSummaries,
    dockerDiagnostics: runtimeResult.dockerDiagnostics,
    localStackLogs: logResult,
    flociAzLogs: flociLogResult,
  };
}