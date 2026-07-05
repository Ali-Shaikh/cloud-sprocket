// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

export const queryKeys = {
  virtualisation: {
    runtime: ["virtualisation", "runtime"] as const,
  },
  deployments: {
    list: ["deployments", "list"] as const,
  },
} as const;