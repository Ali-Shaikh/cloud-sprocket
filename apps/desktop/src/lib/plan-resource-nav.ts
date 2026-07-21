// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import type { NavigateToResourceParams } from "@/lib/navigate-to-resource";
import type { ResourceChange } from "@/types/backend";

/**
 * How the inventory selection key is derived from an OpenTofu resource change.
 * - name: logical `change.name` is a reasonable inventory key
 * - tabOnly: map the tab, but skip resourceKey (inventory needs ARN/URL/id)
 * - none: no useful inventory destination
 */
type KeyMode = "name" | "tabOnly" | "none";

type TypeMapping = {
  tab: string;
  keyMode: KeyMode;
};

/** AWS OpenTofu resource types → inventory tab + key strategy. */
const AWS_TYPE_MAP: Record<string, TypeMapping> = {
  aws_s3_bucket: { tab: "s3", keyMode: "name" },
  aws_s3_bucket_website_configuration: { tab: "s3", keyMode: "tabOnly" },
  aws_s3_bucket_public_access_block: { tab: "s3", keyMode: "tabOnly" },
  aws_s3_bucket_policy: { tab: "s3", keyMode: "tabOnly" },
  aws_s3_object: { tab: "s3", keyMode: "tabOnly" },
  aws_lambda_function: { tab: "lambda", keyMode: "name" },
  aws_lambda_permission: { tab: "lambda", keyMode: "tabOnly" },
  aws_lambda_event_source_mapping: { tab: "lambda", keyMode: "tabOnly" },
  aws_dynamodb_table: { tab: "dynamodb", keyMode: "name" },
  aws_sqs_queue: { tab: "sqs", keyMode: "tabOnly" },
  aws_sqs_queue_policy: { tab: "sqs", keyMode: "tabOnly" },
  aws_sns_topic: { tab: "sns", keyMode: "tabOnly" },
  aws_sns_topic_subscription: { tab: "sns", keyMode: "tabOnly" },
  aws_sns_topic_policy: { tab: "sns", keyMode: "tabOnly" },
  aws_cloudwatch_log_group: { tab: "logs", keyMode: "name" },
  aws_cloudwatch_log_stream: { tab: "logs", keyMode: "tabOnly" },
  aws_cloudwatch_metric_alarm: { tab: "logs", keyMode: "tabOnly" },
  aws_secretsmanager_secret: { tab: "secrets", keyMode: "name" },
  aws_secretsmanager_secret_version: { tab: "secrets", keyMode: "tabOnly" },
  aws_iam_role: { tab: "iam", keyMode: "name" },
  aws_iam_role_policy: { tab: "iam", keyMode: "tabOnly" },
  aws_iam_role_policy_attachment: { tab: "iam", keyMode: "tabOnly" },
  aws_iam_policy: { tab: "iam", keyMode: "tabOnly" },
  aws_iam_user: { tab: "iam", keyMode: "name" },
  aws_iam_instance_profile: { tab: "iam", keyMode: "tabOnly" },
  aws_db_instance: { tab: "rds", keyMode: "name" },
  aws_rds_cluster: { tab: "rds", keyMode: "name" },
  aws_rds_cluster_instance: { tab: "rds", keyMode: "name" },
  aws_instance: { tab: "ec2", keyMode: "tabOnly" },
  aws_ami: { tab: "ec2", keyMode: "tabOnly" },
  aws_security_group: { tab: "ec2", keyMode: "tabOnly" },
  aws_cloudformation_stack: { tab: "cloudformation", keyMode: "name" },
  aws_cloudwatch_event_bus: { tab: "eventbridge", keyMode: "name" },
  aws_cloudwatch_event_rule: { tab: "eventbridge", keyMode: "tabOnly" },
  aws_scheduler_schedule: { tab: "eventbridge", keyMode: "tabOnly" },
  aws_route53_zone: { tab: "route53", keyMode: "tabOnly" },
  aws_route53_record: { tab: "route53", keyMode: "tabOnly" },
  aws_lb: { tab: "elb", keyMode: "tabOnly" },
  aws_alb: { tab: "elb", keyMode: "tabOnly" },
  aws_lb_listener: { tab: "elb", keyMode: "tabOnly" },
  aws_lb_target_group: { tab: "elb", keyMode: "tabOnly" },
  aws_kms_key: { tab: "kms", keyMode: "tabOnly" },
  aws_kms_alias: { tab: "kms", keyMode: "name" },
  aws_api_gateway_rest_api: { tab: "apigateway", keyMode: "tabOnly" },
  aws_api_gateway_stage: { tab: "apigateway", keyMode: "tabOnly" },
  aws_apigatewayv2_api: { tab: "apigateway", keyMode: "tabOnly" },
  aws_ecs_cluster: { tab: "ecs", keyMode: "tabOnly" },
  aws_ecs_service: { tab: "ecs", keyMode: "tabOnly" },
  aws_ecs_task_definition: { tab: "ecs", keyMode: "tabOnly" },
  aws_eks_cluster: { tab: "eks", keyMode: "name" },
};

/** Azure OpenTofu resource types → inventory tab + key strategy. */
const AZURE_TYPE_MAP: Record<string, TypeMapping> = {
  azurerm_storage_account: { tab: "azure-storage", keyMode: "name" },
  azurerm_storage_container: { tab: "azure-storage", keyMode: "tabOnly" },
  azurerm_storage_blob: { tab: "azure-storage", keyMode: "tabOnly" },
  azurerm_storage_queue: { tab: "azure-storage", keyMode: "tabOnly" },
  azurerm_linux_web_app: { tab: "azure-app-service", keyMode: "name" },
  azurerm_windows_web_app: { tab: "azure-app-service", keyMode: "name" },
  azurerm_app_service: { tab: "azure-app-service", keyMode: "name" },
  azurerm_service_plan: { tab: "azure-app-service", keyMode: "tabOnly" },
  azurerm_linux_function_app: { tab: "azure-functions", keyMode: "name" },
  azurerm_windows_function_app: { tab: "azure-functions", keyMode: "name" },
  azurerm_function_app: { tab: "azure-functions", keyMode: "name" },
  azurerm_function_app_flex_consumption: { tab: "azure-functions", keyMode: "name" },
  azurerm_postgresql_flexible_server: { tab: "azure-postgres", keyMode: "name" },
  azurerm_postgresql_flexible_server_database: { tab: "azure-postgres", keyMode: "tabOnly" },
  azurerm_postgresql_server: { tab: "azure-postgres", keyMode: "name" },
  azurerm_key_vault: { tab: "azure-key-vault", keyMode: "name" },
  azurerm_key_vault_secret: { tab: "azure-key-vault", keyMode: "tabOnly" },
  azurerm_key_vault_key: { tab: "azure-key-vault", keyMode: "tabOnly" },
  azurerm_resource_group: { tab: "azure-resource-groups", keyMode: "name" },
  azurerm_linux_virtual_machine: { tab: "azure-vms", keyMode: "tabOnly" },
  azurerm_windows_virtual_machine: { tab: "azure-vms", keyMode: "tabOnly" },
  azurerm_virtual_machine: { tab: "azure-vms", keyMode: "tabOnly" },
  azurerm_log_analytics_workspace: { tab: "azure-log-analytics", keyMode: "name" },
  azurerm_web_application_firewall_policy: { tab: "azure-waf", keyMode: "name" },
};

function resolveProvider(providerId: string): "aws" | "azure" {
  return providerId === "azure" ? "azure" : "aws";
}

function lookupMapping(provider: "aws" | "azure", resourceType: string): TypeMapping | undefined {
  const type = resourceType.trim().toLowerCase();
  if (!type) return undefined;
  if (provider === "azure") {
    return AZURE_TYPE_MAP[type];
  }
  return AWS_TYPE_MAP[type];
}

/**
 * True when the logical name looks like a URL or ARN that inventory can select.
 * Used to upgrade tab-only types (e.g. SQS) when the plan name is already a real key.
 */
function looksLikeInventoryKey(value: string, tab: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (/^https?:\/\//i.test(v) || v.includes("://")) return true;
  if (v.startsWith("arn:")) return true;
  // Route53 zone ids often look like Z1ABCDEF
  if (tab === "route53" && /^Z[A-Z0-9]+$/i.test(v)) return true;
  // EC2 instance ids
  if (tab === "ec2" && /^i-[0-9a-f]+$/i.test(v)) return true;
  return false;
}

/**
 * Map an OpenTofu plan resource change to an inventory deep-link, or null when
 * the type is not navigable in the workspace inventory.
 */
export function planResourceNavigateParams(
  providerId: string,
  change: Pick<ResourceChange, "type" | "name" | "actions">,
): NavigateToResourceParams | null {
  const provider = resolveProvider(providerId);
  const mapping = lookupMapping(provider, change.type);
  if (!mapping || mapping.keyMode === "none") return null;

  const name = (change.name ?? "").trim();
  const params: NavigateToResourceParams = {
    provider,
    tab: mapping.tab,
  };

  if (mapping.keyMode === "name" && name) {
    params.resourceKey = name;
  } else if (mapping.keyMode === "tabOnly" && name && looksLikeInventoryKey(name, mapping.tab)) {
    params.resourceKey = name;
  }

  return params;
}

export type PlanActionTone = "create" | "update" | "delete" | "replace" | "other";

/**
 * Classify plan actions for UI tone (destructive deletes, create/update colours).
 */
export function planActionTone(actions: string[]): PlanActionTone {
  const set = new Set(actions.map((a) => a.toLowerCase()));
  if (set.has("delete") && set.has("create")) return "replace";
  if (set.has("delete")) return "delete";
  if (set.has("create")) return "create";
  if (set.has("update")) return "update";
  return "other";
}

/** True when the change includes a destroy (delete-only or create+delete replace). */
export function isDestructivePlanChange(actions: string[]): boolean {
  return actions.some((a) => a.toLowerCase() === "delete");
}
