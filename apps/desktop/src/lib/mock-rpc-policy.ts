// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

/**
 * Browser-mock rules that must stay aligned with the daemon.
 * Pure: no DOM, no mock state. The mock shell calls these then mutates fixtures.
 */

export const UPDATEABLE_DEPLOYMENT_STATUSES = [
  "applied",
  "planned",
  "failed",
  "cancelled",
] as const;

export const APPLYABLE_DEPLOYMENT_STATUS = "planned";

const IN_FLIGHT_DEPLOYMENT_STATUSES = new Set(["pending", "planning", "applying", "destroying"]);

/** True when deployments.plan may reuse this record via updateDeploymentId. */
export function canReuseDeploymentForUpdate(status: string): boolean {
  return (
    status === "applied" ||
    status === "planned" ||
    status === "failed" ||
    status === "cancelled"
  );
}

export function updateDeploymentRejectedReason(status: string): string | null {
  if (canReuseDeploymentForUpdate(status)) return null;
  return "update is only supported for applied, planned, failed, or cancelled deployments";
}

export function applyDeploymentRejectedReason(status: string): string | null {
  if (status === APPLYABLE_DEPLOYMENT_STATUS) return null;
  return "apply requires a planned deployment";
}

export function retryPostApplyRejectedReason(status: string): string | null {
  if (status === "applied") return null;
  return "retry post-apply requires an applied deployment";
}

export function driftCheckRejectedReason(status: string): string | null {
  if (status === "applied" || status === "planned" || status === "failed") {
    return null;
  }
  return `drift check is only supported for applied, planned, or failed deployments (status=${status})`;
}

/**
 * Matches daemon deleteDeployment: refuse in-flight work, applied stacks,
 * and cancelled records that still have recorded outputs.
 */
export function deleteDeploymentRejectedReason(
  status: string,
  outputCount: number,
): string | null {
  if (IN_FLIGHT_DEPLOYMENT_STATUSES.has(status)) {
    return "this deployment is still running or stopping; wait for the current operation (or stop) to fully complete before removing it";
  }
  if (status === "applied" || (status === "cancelled" && outputCount > 0)) {
    return "this deployment still has (or had) live resources; destroy it before removing the record";
  }
  return null;
}

/** AWS mutating mock RPCs that currently skip the write-mode check. */
export const MOCK_AWS_WRITE_METHODS = [
  "aws.s3.uploadObject",
  "aws.s3.deleteObject",
  "aws.s3.createBucket",
  "aws.s3.copyObject",
  "aws.s3.createFolderPrefix",
  "aws.ec2.invokeAction",
  "aws.ec2.runInstances",
  "aws.ec2.terminateInstances",
  "aws.sqs.peek",
  "aws.sqs.sendMessage",
  "aws.sqs.createQueue",
  "aws.sns.publish",
  "aws.sns.createTopic",
  "aws.dynamodb.putItem",
  "aws.dynamodb.deleteItem",
  "aws.rds.startInstance",
  "aws.rds.stopInstance",
  "aws.logs.createLogGroup",
  "aws.logs.putLogEvents",
  "aws.iam.createRole",
  "aws.lambda.invoke",
  "aws.lambda.create",
  "aws.lambda.deleteFunction",
  "labs.runAction",
] as const;

const MOCK_AWS_WRITE_METHOD_SET = new Set<string>(MOCK_AWS_WRITE_METHODS);

export const MOCK_AWS_WRITE_MODE_MESSAGE =
  "Turn on write mode from the top bar to run mutating actions.";

export function mockAwsWriteRejectedReason(
  method: string,
  awsWriteModeEnabled: boolean,
): string | null {
  if (!MOCK_AWS_WRITE_METHOD_SET.has(method)) return null;
  if (awsWriteModeEnabled) return null;
  return MOCK_AWS_WRITE_MODE_MESSAGE;
}
