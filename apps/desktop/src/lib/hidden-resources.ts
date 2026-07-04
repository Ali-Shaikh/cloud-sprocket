// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import type { HiddenResourceHit } from "@/types/backend";

export function hiddenResourceServiceCount(hits: HiddenResourceHit[]): number {
  return hits.length;
}

export function formatHiddenResourceHit(hit: HiddenResourceHit): string {
  const noun = hit.resourceCount === 1 ? "resource" : "resources";
  return `${hit.label} (${hit.resourceCount} ${noun})`;
}

export function formatHiddenResourceSummary(hits: HiddenResourceHit[]): string {
  const serviceCount = hiddenResourceServiceCount(hits);
  if (serviceCount === 0) {
    return "";
  }
  const serviceNoun = serviceCount === 1 ? "disabled service" : "disabled services";
  const details = hits.map(formatHiddenResourceHit).join(", ");
  return `Resources exist in ${serviceCount} ${serviceNoun}: ${details}.`;
}

export function hiddenResourceChipLabel(hits: HiddenResourceHit[]): string {
  const serviceCount = hiddenResourceServiceCount(hits);
  if (serviceCount === 0) {
    return "";
  }
  const serviceNoun = serviceCount === 1 ? "disabled service" : "disabled services";
  return `Resources exist in ${serviceCount} ${serviceNoun}`;
}