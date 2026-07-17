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

  return `${part("day")} ${part("month")} ${part("year")}, ${part("hour")}:${part("minute")} UTC`;
}

/** Format a Unix epoch in seconds (AWS SQS-style). Invalid values become "Unknown". */
export function formatEpochSeconds(epochSeconds?: number): string {
  if (epochSeconds == null || epochSeconds <= 0 || !Number.isFinite(epochSeconds)) {
    return "Unknown";
  }
  return formatTimestamp(new Date(epochSeconds * 1000).toISOString());
}

/** Format a Unix epoch in milliseconds (CloudWatch Logs-style). */
export function formatEpochMillis(epochMillis?: number): string {
  if (epochMillis == null || epochMillis <= 0 || !Number.isFinite(epochMillis)) {
    return "Unknown";
  }
  return formatTimestamp(new Date(epochMillis).toISOString());
}
