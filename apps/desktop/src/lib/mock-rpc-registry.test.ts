// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { describe, expect, it } from "vitest";

import { EXPECTED_RPC_METHODS } from "./expected-rpc-methods";
import { registeredMockMethods } from "./backend-mock";

describe("browser mock RPC registry", () => {
  it("matches the daemon method surface exactly", () => {
    const expected = [...EXPECTED_RPC_METHODS];
    const got = registeredMockMethods();
    expect(got).toEqual(expected);
  });

  it("keeps the expected list sorted", () => {
    const expected = [...EXPECTED_RPC_METHODS];
    const sorted = [...expected].sort((a, b) => a.localeCompare(b));
    expect(expected).toEqual(sorted);
  });
});
