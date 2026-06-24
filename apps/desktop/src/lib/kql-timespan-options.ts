// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

export type KqlTimespanOption = {
  label: string;
  value: string;
  timespan: string;
};

/** ISO 8601 durations accepted by Azure Monitor log queries. */
export const KQL_TIMESPAN_OPTIONS: KqlTimespanOption[] = [
  { label: "Last 1 minute", value: "PT1M", timespan: "PT1M" },
  { label: "Last 5 minutes", value: "PT5M", timespan: "PT5M" },
  { label: "Last 15 minutes", value: "PT15M", timespan: "PT15M" },
  { label: "Last 30 minutes", value: "PT30M", timespan: "PT30M" },
  { label: "Last 1 hour", value: "PT1H", timespan: "PT1H" },
  { label: "Last 3 hours", value: "PT3H", timespan: "PT3H" },
  { label: "Last 6 hours", value: "PT6H", timespan: "PT6H" },
  { label: "Last 12 hours", value: "PT12H", timespan: "PT12H" },
  { label: "Last 24 hours", value: "P1D", timespan: "P1D" },
  { label: "Last 7 days", value: "P7D", timespan: "P7D" },
  { label: "Last 30 days", value: "P30D", timespan: "P30D" },
  { label: "All time", value: "all", timespan: "" },
];

/** Subset tuned for WAF triage: short windows first, no all-time by default. */
export const WAF_TIMESPAN_OPTIONS: KqlTimespanOption[] = KQL_TIMESPAN_OPTIONS.filter(
  (option) => option.value !== "all",
);

export const WAF_DEFAULT_TIMESPAN_VALUE = "PT1H";

export function timespanValueFor(timespan: string, options = KQL_TIMESPAN_OPTIONS): string {
  const match = options.find((option) => option.timespan === timespan);
  return match?.value ?? options[0]?.value ?? "all";
}

export function timespanLabelFor(value: string, options = KQL_TIMESPAN_OPTIONS): string {
  return options.find((option) => option.value === value)?.label ?? options[0]?.label ?? "All time";
}

export function timespanDurationFor(value: string, options = KQL_TIMESPAN_OPTIONS): string {
  return options.find((option) => option.value === value)?.timespan ?? "";
}