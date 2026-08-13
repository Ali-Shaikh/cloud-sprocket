// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { describe, expect, it } from "vitest";

import { cancelUiEffect, type CancelUiEffect } from "./cancel-ui-effect";

describe("cancelUiEffect", () => {
  it.each<[boolean, CancelUiEffect]>([
    [true, "settle-cancelled"],
    [false, "keep-running"],
  ])("maps rpcSucceeded=%s to %s", (rpcSucceeded, effect) => {
    expect(cancelUiEffect(rpcSucceeded)).toBe(effect);
  });
});
