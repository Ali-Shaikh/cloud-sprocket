// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

const RUNTIME_LABELS: Record<string, string> = {
  localstack: "LocalStack",
  "floci-az": "floci-az",
  "docker-compose": "Docker Compose",
  "magento-compose": "Magento (Docker Compose)",
};

export function runtimeDisplayName(runtimeId?: string): string {
  const id = (runtimeId ?? "localstack").trim() || "localstack";
  return RUNTIME_LABELS[id] ?? id;
}