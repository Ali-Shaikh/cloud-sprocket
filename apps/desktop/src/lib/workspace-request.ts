// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import type { WorkspaceSnapshot } from "@/types/backend";

import { backendRequest } from "./backend";
import { isWorkspaceSnapshot, normaliseWorkspaceSnapshot } from "./workspace-snapshot";

/** Workspace RPCs return a snapshot once at the IPC boundary. */
export async function requestWorkspaceSnapshot(
  method: string,
  params: Record<string, unknown> = {},
): Promise<WorkspaceSnapshot> {
  const raw = await backendRequest<Partial<WorkspaceSnapshot> | WorkspaceSnapshot>(method, params);
  return normaliseWorkspaceSnapshot(raw);
}

export function normaliseWorkspaceFromUnknown(value: unknown): WorkspaceSnapshot | undefined {
  if (!isWorkspaceSnapshot(value)) {
    return undefined;
  }
  return normaliseWorkspaceSnapshot(value);
}