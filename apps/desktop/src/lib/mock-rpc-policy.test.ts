// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { describe, expect, it } from "vitest";

import {
  applyDeploymentRejectedReason,
  canReuseDeploymentForUpdate,
  deleteDeploymentRejectedReason,
  driftCheckRejectedReason,
  mockAwsWriteRejectedReason,
  retryPostApplyRejectedReason,
  updateDeploymentRejectedReason,
} from "./mock-rpc-policy";

describe("canReuseDeploymentForUpdate", () => {
  it.each([
    { status: "applied", allowed: true },
    { status: "planned", allowed: true },
    { status: "failed", allowed: true },
    { status: "cancelled", allowed: true },
    { status: "destroyed", allowed: false },
    { status: "applying", allowed: false },
  ])("$status is allowed=$allowed", ({ status, allowed }) => {
    expect(canReuseDeploymentForUpdate(status)).toBe(allowed);
    expect(updateDeploymentRejectedReason(status) === null).toBe(allowed);
  });
});

describe("deleteDeploymentRejectedReason", () => {
  it("refuses applied records", () => {
    expect(deleteDeploymentRejectedReason("applied", 0)).toMatch(/live resources/);
  });

  it("refuses cancelled records that still have outputs", () => {
    expect(deleteDeploymentRejectedReason("cancelled", 2)).toMatch(/live resources/);
  });

  it("allows cancelled records with no outputs", () => {
    expect(deleteDeploymentRejectedReason("cancelled", 0)).toBeNull();
  });

  it("refuses failed records that still have outputs", () => {
    expect(deleteDeploymentRejectedReason("failed", 3)).toMatch(/live resources/);
  });

  it("allows failed records with no outputs", () => {
    expect(deleteDeploymentRejectedReason("failed", 0)).toBeNull();
  });

  it("refuses in-flight statuses", () => {
    expect(deleteDeploymentRejectedReason("applying", 0)).toMatch(/still running/);
  });
});

describe("apply and retry gates", () => {
  it("apply requires planned", () => {
    expect(applyDeploymentRejectedReason("planned")).toBeNull();
    expect(applyDeploymentRejectedReason("applied")).toMatch(/planned/);
    expect(applyDeploymentRejectedReason("cancelled")).toMatch(/planned/);
  });

  it("retry post-apply requires applied", () => {
    expect(retryPostApplyRejectedReason("applied")).toBeNull();
    expect(retryPostApplyRejectedReason("failed")).toMatch(/applied/);
  });

  it("drift allows applied, planned, and failed", () => {
    expect(driftCheckRejectedReason("applied")).toBeNull();
    expect(driftCheckRejectedReason("cancelled")).toMatch(/cancelled/);
  });
});

describe("mockAwsWriteRejectedReason", () => {
  it("rejects listed AWS writes when write mode is off", () => {
    expect(mockAwsWriteRejectedReason("aws.s3.deleteObject", false)).toMatch(/write mode/);
    expect(mockAwsWriteRejectedReason("labs.runAction", false)).toMatch(/write mode/);
  });

  it("allows listed writes when write mode is on", () => {
    expect(mockAwsWriteRejectedReason("aws.s3.deleteObject", true)).toBeNull();
  });

  it("does not gate reads or already-gated siblings", () => {
    expect(mockAwsWriteRejectedReason("aws.s3.selectBucket", false)).toBeNull();
    expect(mockAwsWriteRejectedReason("aws.sqs.purgeQueue", false)).toBeNull();
  });
});
