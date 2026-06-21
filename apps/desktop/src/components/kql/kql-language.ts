// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { StreamLanguage } from "@codemirror/language";
import type { StringStream } from "@codemirror/language";

const kqlKeywords = new Set([
  "and",
  "asc",
  "by",
  "desc",
  "distinct",
  "extend",
  "false",
  "has",
  "in",
  "join",
  "let",
  "limit",
  "not",
  "null",
  "on",
  "or",
  "order",
  "project",
  "search",
  "sort",
  "summarize",
  "take",
  "top",
  "true",
  "union",
  "where",
]);

function tokenise(stream: StringStream) {
  if (stream.eatSpace()) {
    return null;
  }
  if (stream.match("//")) {
    stream.skipToEnd();
    return "comment";
  }
  if (stream.match(/"(?:[^"\\]|\\.)*"/)) {
    return "string";
  }
  if (stream.match(/'(?:[^'\\]|\\.)*'/)) {
    return "string";
  }
  if (stream.match(/[|!]=|[<>]=?|[|+*/%-]/)) {
    return "operator";
  }
  if (stream.match(/[a-zA-Z_][\w]*/)) {
    const word = stream.current().toLowerCase();
    if (kqlKeywords.has(word)) {
      return "keyword";
    }
    return "variable";
  }
  if (stream.match(/[0-9]+(?:\.[0-9]+)?/)) {
    return "number";
  }
  stream.next();
  return null;
}

export const kqlLanguage = StreamLanguage.define({
  token: tokenise,
});