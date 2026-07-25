// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import type {
  AwsInventoryPayloadByScope,
  AwsInventoryScope,
  AwsInventorySlice,
  WorkspaceSnapshot,
} from "@/types/backend";

import { backendRequest } from "./backend";
import { isWorkspaceSnapshot, normaliseWorkspaceSnapshot } from "./workspace-snapshot";

type CollectionKeys<T> = {
  [K in keyof T]-?: NonNullable<T[K]> extends readonly unknown[] ? K : never;
}[keyof T];

const AWS_INVENTORY_COLLECTION_FIELDS = {
  s3: ["s3Buckets", "s3Objects", "s3ObjectMetadata", "s3ExportSnippets"],
  ec2: ["ec2Regions", "ec2Instances"],
  lambda: ["lambdaRegions", "lambdaFunctions"],
  dynamodb: ["dynamodbRegions", "dynamodbTables"],
  sqs: ["sqsRegions", "sqsQueues"],
  sns: ["snsRegions", "snsTopics"],
  rds: ["rdsRegions", "rdsInstances"],
  ecs: ["ecsRegions", "ecsClusters", "ecsServices", "ecsTasks"],
  eks: ["eksRegions", "eksClusters", "eksNodeGroups"],
  cloudformation: [
    "cloudFormationRegions",
    "cloudFormationStacks",
    "cloudFormationStackEvents",
  ],
  eventbridge: ["eventBridgeRegions", "eventBridgeBuses", "eventBridgeRules"],
  route53: ["route53HostedZones", "route53ResourceRecordSets"],
  elb: ["elbRegions", "elbLoadBalancers", "elbTargetGroups"],
  kms: ["kmsRegions", "kmsKeys", "kmsAliases"],
  apigateway: ["apiGatewayRegions", "apiGatewayApis", "apiGatewayStages"],
  secrets: ["secretsManagerRegions", "secretsManagerSecrets"],
  logs: ["logsRegions", "logGroups"],
  iam: ["iamRoles", "iamPolicies"],
} as const satisfies {
  [S in AwsInventoryScope]: readonly CollectionKeys<AwsInventoryPayloadByScope[S]>[];
};

/** Workspace RPCs return a snapshot once at the IPC boundary. */
export async function requestWorkspaceSnapshot(
  method: string,
  params: Record<string, unknown> = {},
): Promise<WorkspaceSnapshot> {
  const raw = await backendRequest<Partial<WorkspaceSnapshot> | WorkspaceSnapshot>(method, params);
  return normaliseWorkspaceSnapshot(raw);
}

/** Request one AWS-only inventory payload without treating it as a full workspace. */
export async function requestAwsInventorySlice<S extends AwsInventoryScope>(
  scope: S,
): Promise<AwsInventorySlice<S>> {
  const raw = await backendRequest<AwsInventorySlice<S>>("aws.inventory.get", { scope });
  if (
    !raw ||
    raw.providerId !== "aws" ||
    raw.scope !== scope ||
    !raw.payload ||
    typeof raw.payload !== "object" ||
    Array.isArray(raw.payload)
  ) {
    throw new Error(`Unexpected AWS inventory response for scope ${scope}.`);
  }
  const payload = raw.payload as unknown as Record<string, unknown>;
  const requiredCollections: readonly string[] =
    AWS_INVENTORY_COLLECTION_FIELDS[scope];
  if (requiredCollections.some((field) => !Array.isArray(payload[field]))) {
    throw new Error(`Unexpected AWS inventory response for scope ${scope}.`);
  }
  return raw;
}

export function normaliseWorkspaceFromUnknown(value: unknown): WorkspaceSnapshot | undefined {
  if (!isWorkspaceSnapshot(value)) {
    return undefined;
  }
  return normaliseWorkspaceSnapshot(value);
}
