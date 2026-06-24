// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { describe, expect, it } from "vitest";

import { suggestExclusionFromMatch, suggestExclusionsFromMatches } from "./waf-exclusion-suggestions";

describe("waf-exclusion-suggestions", () => {
  it("maps User-Agent matches to RequestHeaderNames", () => {
    const suggestion = suggestExclusionFromMatch({
      matchVariableName: "RequestHeaders.User-Agent",
      matchVariableValue: "curl/8.0",
    });
    expect(suggestion?.exclusion.matchVariable).toBe("RequestHeaderNames");
    expect(suggestion?.exclusion.selector).toBe("User-Agent");
  });

  it("deduplicates repeated match suggestions", () => {
    const suggestions = suggestExclusionsFromMatches([
      { matchVariableName: "ARGS:q", matchVariableValue: "test" },
      { matchVariableName: "ARGS:q", matchVariableValue: "test" },
    ]);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.exclusion.matchVariable).toBe("QueryStringArgNames");
  });
});