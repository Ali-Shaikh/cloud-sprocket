// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import {
  Boxes,
  Bug,
  Code2,
  LayoutGrid,
  Server,
  Wrench,
} from "lucide-react";
import awsApigatewayIconUrl from "@/assets/cloud-icons/aws-apigateway.svg";
import awsEc2IconUrl from "@/assets/cloud-icons/aws-ec2.svg";
import awsDynamodbIconUrl from "@/assets/cloud-icons/aws-dynamodb.svg";
import awsEcsIconUrl from "@/assets/cloud-icons/aws-ecs.svg";
import awsCloudformationIconUrl from "@/assets/cloud-icons/aws-cloudformation.svg";
import awsEksIconUrl from "@/assets/cloud-icons/aws-eks.svg";
import awsEventbridgeIconUrl from "@/assets/cloud-icons/aws-eventbridge.svg";
import awsRoute53IconUrl from "@/assets/cloud-icons/aws-route53.svg";
import awsElbIconUrl from "@/assets/cloud-icons/aws-elb.svg";
import awsKmsIconUrl from "@/assets/cloud-icons/aws-kms.svg";
import awsLambdaIconUrl from "@/assets/cloud-icons/aws-lambda.svg";
import awsS3IconUrl from "@/assets/cloud-icons/aws-s3.svg";
import awsSecretsManagerIconUrl from "@/assets/cloud-icons/aws-secrets-manager.svg";
import awsSqsIconUrl from "@/assets/cloud-icons/aws-sqs.svg";
import awsSnsIconUrl from "@/assets/cloud-icons/aws-sns.svg";
import awsRdsIconUrl from "@/assets/cloud-icons/aws-rds.svg";
import awsCloudwatchIconUrl from "@/assets/cloud-icons/aws-cloudwatch.svg";
import awsIamIconUrl from "@/assets/cloud-icons/aws-iam.svg";
import azureIconUrl from "@/assets/cloud-icons/azure.svg";
import azureResourceGroupsIconUrl from "@/assets/cloud-icons/azure-resource-groups.svg";
import azureVmIconUrl from "@/assets/cloud-icons/azure-vm.svg";
import azureStorageIconUrl from "@/assets/cloud-icons/azure-storage.svg";
import azureAppServiceIconUrl from "@/assets/cloud-icons/azure-app-service.svg";
import azureLogAnalyticsIconUrl from "@/assets/cloud-icons/azure-log-analytics.svg";
import azureWafIconUrl from "@/assets/cloud-icons/azure-waf.svg";
import azureFunctionsIconUrl from "@/assets/cloud-icons/azure-functions.svg";
import azureKeyVaultIconUrl from "@/assets/cloud-icons/azure-key-vault.svg";
import azureCosmosIconUrl from "@/assets/cloud-icons/azure-cosmos.svg";
import azureQueuesIconUrl from "@/assets/cloud-icons/azure-queues.svg";
import azureEntraIconUrl from "@/assets/cloud-icons/azure-entra.svg";
import gcpIconUrl from "@/assets/cloud-icons/gcp.svg";
import type { ActivityEntry, NavItem } from "@/components/shell/types";
import type { Status } from "@/components/status-dot";
import type {
  ActivityLogEntry,
  AuthMethod,
  DockerRuntimeSnapshot,
  EmulatorLogSnapshot,
  EmulatorSummary,
  ProviderSummary,
  WorkspaceSnapshot,
  WorkspaceTab,
} from "@/types/backend";
import { normaliseArray } from "@/lib/workspace-snapshot";

export function profileInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0]![0] ?? ""}${words[1]![0] ?? ""}`.toUpperCase();
  }
  return name.trim().slice(0, 2).toUpperCase();
}

export function providerStatus(provider: ProviderSummary): Status {
  switch (provider.state) {
    case "configured":
      return "on";
    case "tooling-only":
      return "warning";
    default:
      return "off";
  }
}

export function authLabel(method?: AuthMethod): string | undefined {
  if (method === "cli") {
    return "CLI";
  }
  if (method === "sso") {
    return "SSO";
  }
  if (method === "local-files") {
    return "Local files";
  }
  return undefined;
}

export function viewLabelFor(tabId: string, tabs: WorkspaceTab[]): string {
  const labels: Record<string, string> = {
    overview: "Overview",
    virtualisation: "Local Runtime",
    debug: "Debug console",
    "developer-tools": "Developer Toolbox",
    settings: "Services",
    ecs: "ECS",
    apigateway: "API Gateway",
    secrets: "Secrets",
    s3: "Storage",
    ec2: "Compute",
    lambda: "Lambda",
    dynamodb: "DynamoDB",
    sqs: "SQS",
    sns: "SNS",
    rds: "RDS",
    kms: "KMS",
    logs: "Logs",
    iam: "IAM",
    "azure-overview": "Azure",
    "azure-resource-groups": "Resource groups",
    "azure-vms": "Virtual machines",
    "azure-storage": "Storage",
    "azure-app-service": "App Service",
    "azure-tools": "Tools",
    "azure-log-analytics": "Log Analytics",
    "azure-waf": "WAF Security",
    "azure-front-door": "Front Door",
    "azure-functions": "Functions",
    "azure-key-vault": "Key Vault",
    "azure-cosmos": "Cosmos DB",
    "azure-postgres": "PostgreSQL",
    "azure-queues": "Queues",
    "azure-entra": "Entra ID",
    actions: "Activity",
  };
  return labels[tabId] ?? tabs.find((tab) => tab.tabId === tabId)?.label ?? "Workspace";
}

export function navItemForTab(tab: WorkspaceTab, workspace: WorkspaceSnapshot): NavItem {
  const base: NavItem = {
    id: tab.tabId,
    label: tab.label,
    comingSoon: tab.category === "coming_soon",
  };
  if (tab.category === "coming_soon") {
    return base;
  }
  switch (tab.tabId) {
    case "overview":
      return { ...base, icon: LayoutGrid };
    case "s3":
      return { ...base, iconUrl: awsS3IconUrl, count: workspace.s3Buckets.length };
    case "ec2":
      return { ...base, iconUrl: awsEc2IconUrl, count: workspace.ec2Instances.length };
    case "lambda":
      return { ...base, iconUrl: awsLambdaIconUrl, count: workspace.lambdaFunctions.length };
    case "dynamodb":
      return { ...base, iconUrl: awsDynamodbIconUrl, count: workspace.dynamodbTables.length };
    case "sqs":
      return { ...base, iconUrl: awsSqsIconUrl, count: workspace.sqsQueues.length };
    case "sns":
      return { ...base, iconUrl: awsSnsIconUrl, count: workspace.snsTopics.length };
    case "rds":
      return { ...base, iconUrl: awsRdsIconUrl, count: workspace.rdsInstances.length };
    case "ecs":
      return { ...base, iconUrl: awsEcsIconUrl, count: workspace.ecsClusters.length };
    case "eks":
      return { ...base, iconUrl: awsEksIconUrl, count: workspace.eksClusters.length };
    case "cloudformation":
      return {
        ...base,
        iconUrl: awsCloudformationIconUrl,
        count: workspace.cloudFormationStacks.length,
      };
    case "eventbridge":
      return {
        ...base,
        iconUrl: awsEventbridgeIconUrl,
        count: workspace.eventBridgeBuses.length,
      };
    case "route53":
      return {
        ...base,
        iconUrl: awsRoute53IconUrl,
        count: workspace.route53HostedZones.length,
      };
    case "elb":
      return {
        ...base,
        iconUrl: awsElbIconUrl,
        count: workspace.elbLoadBalancers.length,
      };
    case "kms":
      return {
        ...base,
        iconUrl: awsKmsIconUrl,
        count: workspace.kmsKeys.length,
      };
    case "apigateway":
      return { ...base, iconUrl: awsApigatewayIconUrl, count: workspace.apiGatewayApis.length };
    case "secrets":
      return {
        ...base,
        iconUrl: awsSecretsManagerIconUrl,
        count: workspace.secretsManagerSecrets.length,
      };
    case "logs":
      return { ...base, iconUrl: awsCloudwatchIconUrl, count: workspace.logGroups.length };
    case "iam":
      return { ...base, iconUrl: awsIamIconUrl, count: workspace.iamRoles.length };
    case "azure-overview":
      return { ...base, iconUrl: azureIconUrl, count: workspace.azureResourceGroups.length };
    case "azure-resource-groups":
      return { ...base, iconUrl: azureResourceGroupsIconUrl, count: workspace.azureResourceGroups.length };
    case "azure-vms":
      return { ...base, iconUrl: azureVmIconUrl, count: workspace.azureVirtualMachines.length };
    case "azure-storage":
      return {
        ...base,
        iconUrl: azureStorageIconUrl,
        count:
          workspace.azureBlobContainers.length > 0
            ? workspace.azureBlobContainers.length
            : workspace.azureStorageAccounts.length,
      };
    case "azure-app-service":
      return { ...base, iconUrl: azureAppServiceIconUrl, count: workspace.azureWebApps.length };
    case "azure-tools":
      return { ...base, icon: Wrench };
    case "azure-log-analytics":
      return { ...base, iconUrl: azureLogAnalyticsIconUrl, count: workspace.azureLogAnalyticsWorkspaces.length };
    case "azure-waf":
      return { ...base, iconUrl: azureWafIconUrl, count: workspace.azureWafPolicies.length };
    case "azure-front-door":
      return { ...base, iconUrl: azureWafIconUrl, count: workspace.azureFrontDoorProfiles.length };
    case "azure-functions":
      return { ...base, iconUrl: azureFunctionsIconUrl, count: workspace.azureFunctionApps.length };
    case "azure-key-vault":
      return { ...base, iconUrl: azureKeyVaultIconUrl, count: workspace.azureKeyVaults.length };
    case "azure-cosmos":
      return { ...base, iconUrl: azureCosmosIconUrl, count: workspace.azureCosmosAccounts.length };
    case "azure-postgres":
      return { ...base, iconUrl: awsRdsIconUrl, count: workspace.azurePostgresServers.length };
    case "azure-queues":
      return { ...base, iconUrl: azureQueuesIconUrl, count: workspace.azureStorageQueues.length };
    case "azure-entra":
      return { ...base, iconUrl: azureEntraIconUrl, count: workspace.azureEntraUsers.length };
    case "actions":
      return { ...base, icon: Boxes };
    case "virtualisation":
      return { ...base, icon: Server, count: workspace.emulatorSummaries.length };
    case "gcp-overview":
      return { ...base, iconUrl: gcpIconUrl };
    case "debug":
      return { ...base, icon: Bug };
    case "developer-tools":
      return { ...base, icon: Code2 };
    default:
      return { ...base, icon: Boxes };
  }
}

const LOG_TONE: Record<string, Status> = {
  error: "error",
  warn: "warning",
  warning: "warning",
  success: "on",
  info: "off",
  debug: "off",
};

export function logTone(level: string): Status {
  return LOG_TONE[level?.toLowerCase?.() ?? ""] ?? "off";
}

export function formatLogTime(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }
  return date.toLocaleTimeString("en-GB");
}

export function toActivityEntries(logs: ActivityLogEntry[]): ActivityEntry[] {
  return logs.map((entry) => ({
    id: entry.id,
    timestamp: formatLogTime(entry.timestamp),
    message: entry.message,
    detail: entry.details,
    tone: logTone(entry.level),
  }));
}

export function dockerDiagnosticsFromRuntime(runtime: DockerRuntimeSnapshot): WorkspaceSnapshot["dockerDiagnostics"] {
  return {
    engineState: runtime.reachable ? "available" : runtime.host ? "unavailable" : "unknown",
    summary: runtime.summary,
    details: runtime.details,
    contextName: runtime.contextName,
    host: runtime.host,
  };
}

export function normaliseEmulatorLogSnapshot(snapshot: Partial<EmulatorLogSnapshot> | null | undefined): EmulatorLogSnapshot {
  return {
    emulatorId: snapshot?.emulatorId ?? "localstack",
    lines: normaliseArray(snapshot?.lines).map((line) => String(line)),
    summary: snapshot?.summary ?? "Emulator logs have not been loaded yet.",
  };
}

export function emulatorStatusFromWorkspace(workspace: WorkspaceSnapshot, emulatorId: string): EmulatorSummary | undefined {
  return workspace.emulatorSummaries.find((e) => e.emulatorId === emulatorId);
}
