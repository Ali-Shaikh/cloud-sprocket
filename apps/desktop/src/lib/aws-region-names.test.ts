// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { describe, expect, it } from "vitest";

import { awsRegionName, formatAwsRegionLabel } from "./aws-region-names";

describe("formatAwsRegionLabel", () => {
  it("pairs the official name with the region code", () => {
    expect(formatAwsRegionLabel("eu-west-1")).toBe("Europe (Ireland) · eu-west-1");
    expect(formatAwsRegionLabel("us-east-1")).toBe("US East (N. Virginia) · us-east-1");
    expect(formatAwsRegionLabel("me-central-1")).toBe("Middle East (UAE) · me-central-1");
  });

  it("keeps unknown codes as-is so new regions still render", () => {
    expect(formatAwsRegionLabel("ap-unannounced-1")).toBe("ap-unannounced-1");
  });

  it("trims whitespace and treats a blank id as empty", () => {
    expect(formatAwsRegionLabel("  eu-west-2  ")).toBe("Europe (London) · eu-west-2");
    expect(formatAwsRegionLabel("   ")).toBe("");
  });
});

describe("awsRegionName", () => {
  it("returns only the long name", () => {
    expect(awsRegionName("ap-southeast-2")).toBe("Asia Pacific (Sydney)");
  });
});
