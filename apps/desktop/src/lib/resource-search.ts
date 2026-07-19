// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import type { NavigateToResourceParams } from "@/lib/navigate-to-resource";
import type { WorkspaceSnapshot } from "@/types/backend";

export type ResourceSearchHit = {
  id: string;
  label: string;
  service: string;
  keywords: string;
  params: NavigateToResourceParams;
};

type Collector = {
  provider: "aws" | "azure";
  tab: string;
  service: string;
  resourceKey: string;
  label: string;
  keywords?: string;
};

function hitFrom(collector: Collector): ResourceSearchHit {
  return {
    id: `${collector.provider}:${collector.tab}:${collector.resourceKey}`,
    label: collector.label,
    service: collector.service,
    keywords: collector.keywords ?? "",
    params: {
      provider: collector.provider,
      tab: collector.tab,
      resourceKey: collector.resourceKey,
    },
  };
}

/**
 * Build a flat, palette-ready index from the client-side workspace snapshot.
 * Empty inventories contribute nothing; selection is purely frontend for now.
 */
export function indexWorkspaceResources(
  workspace: WorkspaceSnapshot | null | undefined,
  provider: "aws" | "azure" | undefined,
): ResourceSearchHit[] {
  if (!workspace || !provider) return [];

  const hits: ResourceSearchHit[] = [];

  if (provider === "aws") {
    for (const bucket of workspace.s3Buckets ?? []) {
      hits.push(
        hitFrom({
          provider: "aws",
          tab: "s3",
          service: "S3",
          resourceKey: bucket.name,
          label: bucket.name,
          keywords: "bucket storage",
        }),
      );
    }
    for (const instance of workspace.ec2Instances ?? []) {
      hits.push(
        hitFrom({
          provider: "aws",
          tab: "ec2",
          service: "EC2",
          resourceKey: instance.instanceId,
          label: instance.name?.trim() || instance.instanceId,
          keywords: `${instance.instanceId} ${instance.instanceType ?? ""} ${instance.state ?? ""}`,
        }),
      );
    }
    for (const fn of workspace.lambdaFunctions ?? []) {
      hits.push(
        hitFrom({
          provider: "aws",
          tab: "lambda",
          service: "Lambda",
          resourceKey: fn.functionName,
          label: fn.functionName,
          keywords: `function ${fn.runtime ?? ""}`,
        }),
      );
    }
    for (const table of workspace.dynamodbTables ?? []) {
      hits.push(
        hitFrom({
          provider: "aws",
          tab: "dynamodb",
          service: "DynamoDB",
          resourceKey: table.tableName,
          label: table.tableName,
          keywords: "table",
        }),
      );
    }
    for (const queue of workspace.sqsQueues ?? []) {
      hits.push(
        hitFrom({
          provider: "aws",
          tab: "sqs",
          service: "SQS",
          resourceKey: queue.queueUrl,
          label: queue.queueName || queue.queueUrl,
          keywords: `queue ${queue.queueUrl}`,
        }),
      );
    }
    for (const topic of workspace.snsTopics ?? []) {
      hits.push(
        hitFrom({
          provider: "aws",
          tab: "sns",
          service: "SNS",
          resourceKey: topic.topicArn,
          label: topic.topicName || topic.topicArn,
          keywords: `topic ${topic.topicArn}`,
        }),
      );
    }
    for (const db of workspace.rdsInstances ?? []) {
      hits.push(
        hitFrom({
          provider: "aws",
          tab: "rds",
          service: "RDS",
          resourceKey: db.dbInstanceIdentifier,
          label: db.dbInstanceIdentifier,
          keywords: `database ${db.engine ?? ""}`,
        }),
      );
    }
    for (const group of workspace.logGroups ?? []) {
      hits.push(
        hitFrom({
          provider: "aws",
          tab: "logs",
          service: "CloudWatch Logs",
          resourceKey: group.logGroupName,
          label: group.logGroupName,
          keywords: "log group",
        }),
      );
    }
    for (const role of workspace.iamRoles ?? []) {
      hits.push(
        hitFrom({
          provider: "aws",
          tab: "iam",
          service: "IAM",
          resourceKey: role.roleName,
          label: role.roleName,
          keywords: "role",
        }),
      );
    }
    for (const secret of workspace.secretsManagerSecrets ?? []) {
      hits.push(
        hitFrom({
          provider: "aws",
          tab: "secrets",
          service: "Secrets Manager",
          resourceKey: secret.name,
          label: secret.name,
          keywords: "secret",
        }),
      );
    }
    for (const cluster of workspace.ecsClusters ?? []) {
      hits.push(
        hitFrom({
          provider: "aws",
          tab: "ecs",
          service: "ECS",
          resourceKey: cluster.clusterArn,
          label: cluster.clusterName || cluster.clusterArn,
          keywords: `cluster ${cluster.clusterArn}`,
        }),
      );
    }
    for (const cluster of workspace.eksClusters ?? []) {
      hits.push(
        hitFrom({
          provider: "aws",
          tab: "eks",
          service: "EKS",
          resourceKey: cluster.clusterName,
          label: cluster.clusterName,
          keywords: "cluster kubernetes",
        }),
      );
    }
    for (const stack of workspace.cloudFormationStacks ?? []) {
      hits.push(
        hitFrom({
          provider: "aws",
          tab: "cloudformation",
          service: "CloudFormation",
          resourceKey: stack.stackName,
          label: stack.stackName,
          keywords: "stack",
        }),
      );
    }
    for (const bus of workspace.eventBridgeBuses ?? []) {
      hits.push(
        hitFrom({
          provider: "aws",
          tab: "eventbridge",
          service: "EventBridge",
          resourceKey: bus.name,
          label: bus.name,
          keywords: "bus event",
        }),
      );
    }
    for (const zone of workspace.route53HostedZones ?? []) {
      hits.push(
        hitFrom({
          provider: "aws",
          tab: "route53",
          service: "Route 53",
          resourceKey: zone.hostedZoneId,
          label: zone.name || zone.hostedZoneId,
          keywords: `dns zone ${zone.hostedZoneId}`,
        }),
      );
    }
    for (const lb of workspace.elbLoadBalancers ?? []) {
      hits.push(
        hitFrom({
          provider: "aws",
          tab: "elb",
          service: "ELB",
          resourceKey: lb.loadBalancerArn,
          label: lb.loadBalancerName || lb.loadBalancerArn,
          keywords: `load balancer ${lb.loadBalancerArn}`,
        }),
      );
    }
    for (const key of workspace.kmsKeys ?? []) {
      hits.push(
        hitFrom({
          provider: "aws",
          tab: "kms",
          service: "KMS",
          resourceKey: key.keyId,
          label: key.description?.trim() || key.keyId,
          keywords: `key ${key.keyId} ${key.arn ?? ""}`,
        }),
      );
    }
    return hits;
  }

  // Azure
  for (const rg of workspace.azureResourceGroups ?? []) {
    hits.push(
      hitFrom({
        provider: "azure",
        tab: "azure-resource-groups",
        service: "Resource groups",
        resourceKey: rg.name,
        label: rg.name,
        keywords: "rg resource group",
      }),
    );
  }
  for (const vm of workspace.azureVirtualMachines ?? []) {
    hits.push(
      hitFrom({
        provider: "azure",
        tab: "azure-vms",
        service: "Virtual machines",
        resourceKey: vm.vmId,
        label: vm.name || vm.vmId,
        keywords: `vm ${vm.vmId}`,
      }),
    );
  }
  for (const account of workspace.azureStorageAccounts ?? []) {
    hits.push(
      hitFrom({
        provider: "azure",
        tab: "azure-storage",
        service: "Storage",
        resourceKey: account.name,
        label: account.name,
        keywords: "storage account blob",
      }),
    );
  }
  for (const app of workspace.azureWebApps ?? []) {
    hits.push(
      hitFrom({
        provider: "azure",
        tab: "azure-app-service",
        service: "App Service",
        resourceKey: app.name,
        label: app.name,
        keywords: "web app",
      }),
    );
  }
  for (const server of workspace.azurePostgresServers ?? []) {
    hits.push(
      hitFrom({
        provider: "azure",
        tab: "azure-postgres",
        service: "PostgreSQL",
        resourceKey: server.name,
        label: server.name,
        keywords: "postgres database flexible",
      }),
    );
  }
  for (const vault of workspace.azureKeyVaults ?? []) {
    hits.push(
      hitFrom({
        provider: "azure",
        tab: "azure-key-vault",
        service: "Key Vault",
        resourceKey: vault.name,
        label: vault.name,
        keywords: "secrets vault",
      }),
    );
  }
  for (const fnApp of workspace.azureFunctionApps ?? []) {
    hits.push(
      hitFrom({
        provider: "azure",
        tab: "azure-functions",
        service: "Functions",
        resourceKey: fnApp.name,
        label: fnApp.name,
        keywords: "function app",
      }),
    );
  }
  for (const ws of workspace.azureLogAnalyticsWorkspaces ?? []) {
    hits.push(
      hitFrom({
        provider: "azure",
        tab: "azure-log-analytics",
        service: "Log Analytics",
        resourceKey: ws.name,
        label: ws.name,
        keywords: "workspace logs kql",
      }),
    );
  }
  for (const policy of workspace.azureWafPolicies ?? []) {
    hits.push(
      hitFrom({
        provider: "azure",
        tab: "azure-waf",
        service: "WAF",
        resourceKey: policy.name,
        label: policy.name,
        keywords: "firewall policy",
      }),
    );
  }
  return hits;
}

export function filterResourceHits(
  hits: ResourceSearchHit[],
  query: string,
  limit = 20,
): ResourceSearchHit[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return hits.slice(0, limit);
  }
  return hits
    .filter((hit) =>
      `${hit.label} ${hit.service} ${hit.keywords}`.toLowerCase().includes(needle),
    )
    .slice(0, limit);
}
