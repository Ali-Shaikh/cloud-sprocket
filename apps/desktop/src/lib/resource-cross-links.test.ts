// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { describe, expect, it } from "vitest";

import {
  conventionalLambdaLogGroup,
  lambdaCrossLinks,
  resolveLambdaLogGroupName,
} from "./resource-cross-links";

describe("conventionalLambdaLogGroup", () => {
  it("builds the AWS default log group path", () => {
    expect(conventionalLambdaLogGroup("process-order")).toBe("/aws/lambda/process-order");
  });

  it("trims surrounding whitespace on the function name", () => {
    expect(conventionalLambdaLogGroup("  demo-fn  ")).toBe("/aws/lambda/demo-fn");
  });
});

describe("resolveLambdaLogGroupName", () => {
  it("prefers an explicit log group from the snapshot", () => {
    expect(
      resolveLambdaLogGroupName({
        functionName: "process-order",
        logGroup: "/custom/path/process-order",
      }),
    ).toBe("/custom/path/process-order");
  });

  it("falls back to the conventional path when logGroup is missing", () => {
    expect(resolveLambdaLogGroupName({ functionName: "process-order" })).toBe(
      "/aws/lambda/process-order",
    );
  });

  it("treats blank logGroup as missing", () => {
    expect(
      resolveLambdaLogGroupName({ functionName: "process-order", logGroup: "   " }),
    ).toBe("/aws/lambda/process-order");
  });

  it("returns undefined when there is no function name and no log group", () => {
    expect(resolveLambdaLogGroupName({ functionName: "  " })).toBeUndefined();
  });
});

describe("lambdaCrossLinks", () => {
  it("links to the Logs tab with the resolved log group name", () => {
    expect(
      lambdaCrossLinks({
        functionName: "process-order",
        logGroup: "/aws/lambda/process-order",
      }),
    ).toEqual([
      {
        id: "logs",
        label: "Open in Logs",
        params: {
          provider: "aws",
          tab: "logs",
          resourceKey: "/aws/lambda/process-order",
        },
      },
    ]);
  });

  it("uses the conventional log group when the field is absent", () => {
    expect(lambdaCrossLinks({ functionName: "checkout" })).toEqual([
      {
        id: "logs",
        label: "Open in Logs",
        params: {
          provider: "aws",
          tab: "logs",
          resourceKey: "/aws/lambda/checkout",
        },
      },
    ]);
  });

  it("returns no links when the function name and log group are empty", () => {
    expect(lambdaCrossLinks({ functionName: "" })).toEqual([]);
  });
});
