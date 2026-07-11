// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

/** Format an ISO timestamp consistently in British English and UTC. */
export function formatTimestamp(iso: string): string {
  const value = new Date(iso);
  if (!iso || Number.isNaN(value.getTime())) return iso;

  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? "";

  return `${part("day")} ${part("month")} ${part("year")}, ${part("hour")}:${part("minute")}`;
}
