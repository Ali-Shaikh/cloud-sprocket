// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

export type CancelUiEffect = "settle-cancelled" | "keep-running";

export function cancelUiEffect(rpcSucceeded: boolean): CancelUiEffect {
  return rpcSucceeded ? "settle-cancelled" : "keep-running";
}
