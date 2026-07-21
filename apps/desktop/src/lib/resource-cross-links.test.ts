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

  it("does not invent a conventional path when the group is unknown", () => {
    expect(resolveLambdaLogGroupName({ functionName: "process-order" })).toBeUndefined();
  });

  it("uses the conventional path when it appears in known inventory names", () => {
    expect(
      resolveLambdaLogGroupName(
        { functionName: "process-order" },
        { knownLogGroupNames: ["/aws/lambda/process-order", "/other"] },
      ),
    ).toBe("/aws/lambda/process-order");
  });

  it("treats blank logGroup as missing", () => {
    expect(
      resolveLambdaLogGroupName({ functionName: "process-order", logGroup: "   " }),
    ).toBeUndefined();
  });

  it("returns undefined when there is no function name and no log group", () => {
    expect(resolveLambdaLogGroupName({ functionName: "  " })).toBeUndefined();
  });
});

describe("lambdaCrossLinks", () => {
  it("links to Logs with region context when the backend set logGroup", () => {
    expect(
      lambdaCrossLinks(
        {
          functionName: "process-order",
          logGroup: "/aws/lambda/process-order",
        },
        { region: "eu-west-1" },
      ),
    ).toEqual([
      {
        id: "logs",
        label: "Open in Logs",
        params: {
          provider: "aws",
          tab: "logs",
          resourceKey: "/aws/lambda/process-order",
          context: { logsRegion: "eu-west-1" },
        },
      },
    ]);
  });

  it("returns no link when logGroup is absent and the conventional path is unknown", () => {
    expect(lambdaCrossLinks({ functionName: "checkout" })).toEqual([]);
  });

  it("uses the conventional group only when known in inventory", () => {
    expect(
      lambdaCrossLinks(
        { functionName: "checkout" },
        { knownLogGroupNames: ["/aws/lambda/checkout"], region: "us-east-1" },
      ),
    ).toEqual([
      {
        id: "logs",
        label: "Open in Logs",
        params: {
          provider: "aws",
          tab: "logs",
          resourceKey: "/aws/lambda/checkout",
          context: { logsRegion: "us-east-1" },
        },
      },
    ]);
  });

  it("returns no links when the function name and log group are empty", () => {
    expect(lambdaCrossLinks({ functionName: "" })).toEqual([]);
  });
});
