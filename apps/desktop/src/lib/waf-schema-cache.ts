// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import type { AzureWafLogSchemaProfile } from "@/types/backend";

const cache = new Map<string, AzureWafLogSchemaProfile>();

export function getCachedWafLogSchema(workspace: string): AzureWafLogSchemaProfile | undefined {
  const key = workspace.trim();
  if (!key) {
    return undefined;
  }
  return cache.get(key);
}

export function setCachedWafLogSchema(workspace: string, schema: AzureWafLogSchemaProfile): void {
  const key = workspace.trim();
  if (!key) {
    return;
  }
  cache.set(key, schema);
}

/** Test helper: reset the in-memory probe cache between cases. */
export function clearWafLogSchemaCache(): void {
  cache.clear();
}