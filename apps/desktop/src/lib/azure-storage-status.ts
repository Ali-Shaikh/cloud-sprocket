// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

export type AzureStorageStatusPresentation = {
  tone: "info" | "warning" | "destructive";
  isError: boolean;
  title: string;
  description?: string;
  detail?: string;
};

/**
 * Present azureStorageStatusMessage for the Storage browser.
 * Multi-line error status from the daemon is:
 *   title\nguidance\ntechnical detail
 * Plain single-line messages stay informational.
 */
export function presentAzureStorageStatus(
  message: string | undefined | null,
): AzureStorageStatusPresentation | null {
  const raw = (message ?? "").trim();
  if (!raw) {
    return null;
  }

  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const title = lines[0] ?? raw;
  const lower = title.toLowerCase();
  const isError =
    lower.startsWith("could not list") ||
    lower.includes("failed") ||
    lower.includes("error") ||
    lower.includes("timed out") ||
    lower.includes("timeout");

  if (!isError) {
    return {
      tone: "info",
      isError: false,
      title: raw.includes("\n") ? title : raw,
      description: lines.length > 1 ? lines.slice(1).join(" ") : undefined,
    };
  }

  const description = lines[1];
  const detail = lines.length > 2 ? lines.slice(2).join("\n") : undefined;

  // Single-line legacy errors still get a readable banner.
  if (lines.length === 1) {
    return {
      tone: "destructive",
      isError: true,
      title,
    };
  }

  return {
    tone: "destructive",
    isError: true,
    title,
    description,
    detail,
  };
}
