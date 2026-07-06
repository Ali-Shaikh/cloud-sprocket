// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { describe, expect, it } from "vitest";

import { awsWriteEnableDialogIntent, awsWriteTargetSummary } from "./aws-write-policy";
import { emptyWorkspace } from "./workspace-snapshot";

describe("awsWriteTargetSummary", () => {
  it("labels local endpoints separately from live AWS", () => {
    expect(
      awsWriteTargetSummary({
        ...emptyWorkspace,
        awsWriteTargetIsLocal: true,
        awsEndpointUrl: "http://localhost:4566",
      }),
    ).toBe("http://localhost:4566");

    expect(
      awsWriteTargetSummary({
        ...emptyWorkspace,
        awsWriteTargetIsLocal: false,
      }),
    ).toBe("live AWS account");
  });
});

describe("awsWriteEnableDialogIntent", () => {
  it("uses a stronger cloud confirmation for non-local targets", () => {
    expect(
      awsWriteEnableDialogIntent({
        ...emptyWorkspace,
        awsWriteTargetIsLocal: true,
      }),
    ).toBe("enable-local");

    expect(
      awsWriteEnableDialogIntent({
        ...emptyWorkspace,
        awsWriteTargetIsLocal: false,
      }),
    ).toBe("enable-cloud");
  });
});