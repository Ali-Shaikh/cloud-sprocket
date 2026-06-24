// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import type { AzureWafExclusion } from "@/types/backend";
import type { WafMatchRow } from "./waf-decode";

export type WafExclusionSuggestion = {
  label: string;
  exclusion: AzureWafExclusion;
};

/** Map a WAF log match variable to a Front Door managed-rule exclusion shape. */
export function suggestExclusionFromMatch(match: WafMatchRow): WafExclusionSuggestion | null {
  const variable = match.matchVariableName.trim();
  const value = match.matchVariableValue.trim();
  if (!variable || !value) {
    return null;
  }

  const normalised = variable.toLowerCase();

  if (normalised.includes("user-agent") || normalised.includes("request_headers.user-agent")) {
    return {
      label: `Exclude header User-Agent = ${value}`,
      exclusion: {
        matchVariable: "RequestHeaderNames",
        selectorMatchOperator: "Equals",
        selector: "User-Agent",
      },
    };
  }

  if (normalised.includes("cookie") || normalised.includes("request_cookies")) {
    const cookieName = value.split("=")[0]?.trim() || value;
    return {
      label: `Exclude cookie ${cookieName}`,
      exclusion: {
        matchVariable: "RequestCookieNames",
        selectorMatchOperator: "Equals",
        selector: cookieName,
      },
    };
  }

  if (
    normalised.includes("querystring") ||
    normalised.includes("args") ||
    normalised.includes("request_uri.query")
  ) {
    const argName = value.includes("=") ? value.split("=")[0]?.trim() : value;
    if (!argName) {
      return null;
    }
    return {
      label: `Exclude query arg ${argName}`,
      exclusion: {
        matchVariable: "QueryStringArgNames",
        selectorMatchOperator: "Equals",
        selector: argName,
      },
    };
  }

  if (normalised.includes("requestbody") || normalised.includes("request_body")) {
    return {
      label: `Exclude body field ${value}`,
      exclusion: {
        matchVariable: "RequestBodyPostArgNames",
        selectorMatchOperator: "Equals",
        selector: value,
      },
    };
  }

  if (normalised.includes("request_uri") || normalised.includes("uri")) {
    return {
      label: `Exclude query containing ${value}`,
      exclusion: {
        matchVariable: "QueryStringArgNames",
        selectorMatchOperator: "Contains",
        selector: value,
      },
    };
  }

  return {
    label: `Exclude ${variable} = ${value}`,
    exclusion: {
      matchVariable: "RequestHeaderNames",
      selectorMatchOperator: "Contains",
      selector: value.slice(0, 128),
    },
  };
}

export function suggestExclusionsFromMatches(matches: WafMatchRow[]): WafExclusionSuggestion[] {
  const seen = new Set<string>();
  const suggestions: WafExclusionSuggestion[] = [];
  for (const match of matches) {
    const suggestion = suggestExclusionFromMatch(match);
    if (!suggestion) {
      continue;
    }
    const key = `${suggestion.exclusion.matchVariable}:${suggestion.exclusion.selectorMatchOperator}:${suggestion.exclusion.selector}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    suggestions.push(suggestion);
  }
  return suggestions;
}