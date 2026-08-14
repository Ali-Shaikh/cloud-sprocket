// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { describe, expect, it } from "vitest";

import {
  isDiscoveryRefreshJob,
  isEC2ActionJob,
  isS3PresignJob,
  JOB_KIND_DISCOVERY_REFRESH,
  JOB_KIND_EC2_ACTION,
  JOB_KIND_S3_PRESIGN,
} from "./job-kind";

describe("isDiscoveryRefreshJob", () => {
  it("matches kind even when the label changes", () => {
    expect(
      isDiscoveryRefreshJob({
        jobId: "j1",
        kind: JOB_KIND_DISCOVERY_REFRESH,
        label: "Discovery refresh",
      }),
    ).toBe(true);
  });

  it("matches the tracked job id", () => {
    expect(
      isDiscoveryRefreshJob({ jobId: "tracked", label: "Something else" }, "tracked"),
    ).toBe(true);
  });

  it("falls back to the historical label", () => {
    expect(isDiscoveryRefreshJob({ jobId: "j2", label: "Refresh Discovery" })).toBe(true);
    expect(isDiscoveryRefreshJob({ jobId: "j3", label: "Discovery refresh" })).toBe(false);
  });

  it("does not fall back to the label when a different kind is set", () => {
    expect(
      isDiscoveryRefreshJob({
        jobId: "j4",
        kind: JOB_KIND_EC2_ACTION,
        label: "Refresh Discovery",
      }),
    ).toBe(false);
  });
});

describe("isEC2ActionJob", () => {
  it("matches kind, not an unrelated label that happens to mention EC2", () => {
    expect(isEC2ActionJob({ kind: JOB_KIND_EC2_ACTION, label: "Instance lifecycle" })).toBe(true);
    expect(isEC2ActionJob({ label: "Plan my-app" })).toBe(false);
  });

  it("falls back to the historical EC2 label substring", () => {
    expect(isEC2ActionJob({ label: "EC2 Action" })).toBe(true);
    expect(isEC2ActionJob({ label: "EC2 Terminate" })).toBe(true);
  });

  it("does not treat another kind as an EC2 action even if the label mentions EC2", () => {
    expect(isEC2ActionJob({ kind: JOB_KIND_S3_PRESIGN, label: "EC2 Signed URL" })).toBe(false);
  });
});

describe("isS3PresignJob", () => {
  it("matches kind even if the label is rewritten", () => {
    expect(isS3PresignJob({ kind: JOB_KIND_S3_PRESIGN, label: "Presign object" })).toBe(true);
  });

  it("falls back to the historical signed-url label", () => {
    expect(isS3PresignJob({ label: "S3 Signed URL" })).toBe(true);
    expect(isS3PresignJob({ label: "S3 Upload" })).toBe(false);
  });

  it("does not treat another kind as a presign even if the label mentions a signed URL", () => {
    expect(isS3PresignJob({ kind: JOB_KIND_EC2_ACTION, label: "S3 Signed URL" })).toBe(false);
  });
});
