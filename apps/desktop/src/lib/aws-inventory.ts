// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import type { WorkspaceSnapshot } from "@/types/backend";

export type AwsInventoryScope =
  | "s3"
  | "ec2"
  | "lambda"
  | "dynamodb"
  | "sqs"
  | "sns"
  | "rds"
  | "ecs"
  | "eks"
  | "cloudformation"
  | "eventbridge"
  | "route53"
  | "elb"
  | "apigateway"
  | "secrets"
  | "logs"
  | "iam";

const TAB_SCOPE_MAP: Record<string, AwsInventoryScope | undefined> = {
  s3: "s3",
  ec2: "ec2",
  lambda: "lambda",
  dynamodb: "dynamodb",
  sqs: "sqs",
  sns: "sns",
  rds: "rds",
  ecs: "ecs",
  eks: "eks",
  cloudformation: "cloudformation",
  eventbridge: "eventbridge",
  route53: "route53",
  elb: "elb",
  apigateway: "apigateway",
  secrets: "secrets",
  logs: "logs",
  iam: "iam",
};

export function awsInventoryScopeForTab(tabId: string): AwsInventoryScope | undefined {
  return TAB_SCOPE_MAP[tabId];
}

export function awsInventoryStatusMessage(
  workspace: WorkspaceSnapshot,
  scope: AwsInventoryScope,
): string | undefined {
  switch (scope) {
    case "s3":
      return workspace.s3StatusMessage;
    case "ec2":
      return workspace.ec2StatusMessage;
    case "lambda":
      return workspace.lambdaStatusMessage;
    case "dynamodb":
      return workspace.dynamodbStatusMessage;
    case "sqs":
      return workspace.sqsStatusMessage;
    case "sns":
      return workspace.snsStatusMessage;
    case "rds":
      return workspace.rdsStatusMessage;
    case "ecs":
      return workspace.ecsStatusMessage;
    case "eks":
      return workspace.eksStatusMessage;
    case "cloudformation":
      return workspace.cloudFormationStatusMessage;
    case "eventbridge":
      return workspace.eventBridgeStatusMessage;
    case "route53":
      return workspace.route53StatusMessage;
    case "elb":
      return workspace.elbStatusMessage;
    case "apigateway":
      return workspace.apiGatewayStatusMessage;
    case "secrets":
      return workspace.secretsManagerStatusMessage;
    case "logs":
      return workspace.logsStatusMessage;
    case "iam":
      return workspace.iamStatusMessage;
    default:
      return undefined;
  }
}

const DEFAULT_INVENTORY_LOADING_LABELS: Record<AwsInventoryScope, string> = {
  s3: "Loading S3 buckets...",
  ec2: "Loading EC2 regions...",
  lambda: "Loading Lambda functions...",
  dynamodb: "Loading DynamoDB tables...",
  sqs: "Loading SQS queues...",
  sns: "Loading SNS topics...",
  rds: "Loading RDS instances...",
  ecs: "Loading ECS clusters...",
  eks: "Loading EKS clusters...",
  cloudformation: "Loading CloudFormation stacks...",
  eventbridge: "Loading EventBridge buses...",
  route53: "Loading Route 53 hosted zones...",
  elb: "Loading load balancers...",
  apigateway: "Loading API Gateway APIs...",
  secrets: "Loading Secrets Manager secrets...",
  logs: "Loading CloudWatch log groups...",
  iam: "Loading IAM roles and policies...",
};

export function awsInventoryLoadingLabel(
  workspace: WorkspaceSnapshot,
  scope: AwsInventoryScope,
): string {
  const status = awsInventoryStatusMessage(workspace, scope)?.trim();
  if (status) {
    return status;
  }
  return DEFAULT_INVENTORY_LOADING_LABELS[scope];
}

export function awsInventoryLoaded(
  workspace: WorkspaceSnapshot,
  scope: AwsInventoryScope,
): boolean {
  switch (scope) {
    case "s3":
      return (workspace.s3Buckets?.length ?? 0) > 0 ||
        (workspace.s3StatusMessage ?? "").length > 0;
    case "ec2":
      return (workspace.ec2Regions?.length ?? 0) > 0 ||
        (workspace.ec2StatusMessage ?? "").length > 0;
    case "lambda":
      return (workspace.lambdaRegions?.length ?? 0) > 0 ||
        (workspace.lambdaStatusMessage ?? "").length > 0;
    case "dynamodb":
      return (workspace.dynamodbRegions?.length ?? 0) > 0 ||
        (workspace.dynamodbStatusMessage ?? "").length > 0;
    case "sqs":
      return (workspace.sqsRegions?.length ?? 0) > 0 ||
        (workspace.sqsStatusMessage ?? "").length > 0;
    case "sns":
      return (workspace.snsRegions?.length ?? 0) > 0 ||
        (workspace.snsStatusMessage ?? "").length > 0;
    case "rds":
      return (workspace.rdsRegions?.length ?? 0) > 0 ||
        (workspace.rdsStatusMessage ?? "").length > 0;
    case "ecs":
      return (workspace.ecsRegions?.length ?? 0) > 0 ||
        (workspace.ecsStatusMessage ?? "").length > 0;
    case "eks":
      return (workspace.eksRegions?.length ?? 0) > 0 ||
        (workspace.eksStatusMessage ?? "").length > 0;
    case "cloudformation":
      return (workspace.cloudFormationRegions?.length ?? 0) > 0 ||
        (workspace.cloudFormationStatusMessage ?? "").length > 0;
    case "eventbridge":
      return (workspace.eventBridgeRegions?.length ?? 0) > 0 ||
        (workspace.eventBridgeStatusMessage ?? "").length > 0;
    case "route53":
      return (workspace.route53HostedZones?.length ?? 0) > 0 ||
        (workspace.route53StatusMessage ?? "").length > 0;
    case "elb":
      return (workspace.elbRegions?.length ?? 0) > 0 ||
        (workspace.elbStatusMessage ?? "").length > 0;
    case "apigateway":
      return (workspace.apiGatewayRegions?.length ?? 0) > 0 ||
        (workspace.apiGatewayStatusMessage ?? "").length > 0;
    case "secrets":
      return (workspace.secretsManagerRegions?.length ?? 0) > 0 ||
        (workspace.secretsManagerStatusMessage ?? "").length > 0;
    case "logs":
      return (workspace.logsRegions?.length ?? 0) > 0 ||
        (workspace.logsStatusMessage ?? "").length > 0;
    case "iam":
      return (workspace.iamRoles?.length ?? 0) > 0 ||
        (workspace.iamPolicies?.length ?? 0) > 0 ||
        (workspace.iamStatusMessage ?? "").length > 0;
    default:
      return false;
  }
}