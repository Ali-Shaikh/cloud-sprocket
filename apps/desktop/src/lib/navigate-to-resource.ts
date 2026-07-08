// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

export type NavigateToResourceParams = {
  provider: "aws" | "azure";
  tab: string;
  resourceKey?: string;
  subPage?: string;
  context?: Record<string, string>;
};

export type ResourceSelectionRpc = {
  method: string;
  params: Record<string, unknown>;
};

export type NavigateSubPageTarget = {
  tab: "s3" | "azure-overview" | "azure-storage";
  pageId: string;
};

export type NavigateToResourcePlan = {
  tabId: string;
  subPage?: NavigateSubPageTarget;
  selections: ResourceSelectionRpc[];
  uiFlags?: {
    openLambdaCreate?: boolean;
  };
};

type TabResourceMapping = {
  tabId: string;
  paramKey?: string;
  method?: string;
  subPageParent?: NavigateSubPageTarget["tab"];
};

const AWS_TAB_ALIASES: Record<string, TabResourceMapping> = {
  s3: { tabId: "s3", method: "aws.s3.selectBucket", paramKey: "bucketName", subPageParent: "s3" },
  ec2: { tabId: "ec2", method: "aws.ec2.selectInstance", paramKey: "instanceId" },
  lambda: { tabId: "lambda", method: "aws.lambda.selectFunction", paramKey: "functionName" },
  dynamodb: { tabId: "dynamodb", method: "aws.dynamodb.selectTable", paramKey: "tableName" },
  sqs: { tabId: "sqs", method: "aws.sqs.selectQueue", paramKey: "queueUrl" },
  sns: { tabId: "sns", method: "aws.sns.selectTopic", paramKey: "topicArn" },
  rds: { tabId: "rds", method: "aws.rds.selectInstance", paramKey: "instanceId" },
  logs: { tabId: "logs", method: "aws.logs.selectLogGroup", paramKey: "logGroupName" },
  iam: { tabId: "iam", method: "aws.iam.selectRole", paramKey: "roleName" },
  ecs: { tabId: "ecs", method: "aws.ecs.selectCluster", paramKey: "clusterArn" },
  eks: { tabId: "eks", method: "aws.eks.selectCluster", paramKey: "clusterName" },
  cloudformation: { tabId: "cloudformation", method: "aws.cloudformation.selectStack", paramKey: "stackName" },
  eventbridge: { tabId: "eventbridge", method: "aws.eventbridge.selectBus", paramKey: "busName" },
  route53: { tabId: "route53", method: "aws.route53.selectHostedZone", paramKey: "hostedZoneId" },
  elb: { tabId: "elb", method: "aws.elb.selectLoadBalancer", paramKey: "loadBalancerArn" },
  kms: { tabId: "kms", method: "aws.kms.selectKey", paramKey: "keyId" },
  apigateway: { tabId: "apigateway", method: "aws.apigateway.selectApi", paramKey: "apiKey" },
  secrets: { tabId: "secrets", method: "aws.secretsmanager.selectSecret", paramKey: "secretName" },
};

const AZURE_TAB_ALIASES: Record<string, TabResourceMapping> = {
  "azure-overview": { tabId: "azure-overview", subPageParent: "azure-overview" },
  "azure-resource-groups": {
    tabId: "azure-resource-groups",
    method: "azure.resourceGroups.select",
    paramKey: "resourceGroup",
  },
  "azure-vms": { tabId: "azure-vms", method: "azure.virtualMachines.select", paramKey: "vmId" },
  "azure-storage": {
    tabId: "azure-storage",
    method: "azure.storage.selectAccount",
    paramKey: "accountName",
    subPageParent: "azure-storage",
  },
  "azure-app-service": { tabId: "azure-app-service", method: "azure.appService.selectWebApp", paramKey: "appName" },
  "azure-postgres": {
    tabId: "azure-postgres",
    method: "azure.postgres.selectServer",
    paramKey: "server",
  },
  "azure-key-vault": { tabId: "azure-key-vault", method: "azure.keyVault.selectVault", paramKey: "vaultName" },
  "azure-functions": { tabId: "azure-functions", method: "azure.functions.selectApp", paramKey: "appName" },
  "azure-log-analytics": {
    tabId: "azure-log-analytics",
    method: "azure.logAnalytics.selectWorkspace",
    paramKey: "workspaceName",
  },
  "azure-waf": { tabId: "azure-waf", method: "azure.waf.selectPolicy", paramKey: "policyName" },
};

const AWS_CONTEXT_KEYS: Record<string, { method: string; paramKey: string; tabId: string }> = {
  lambdaFunctionName: { tabId: "lambda", method: "aws.lambda.selectFunction", paramKey: "functionName" },
  dynamodbTableName: { tabId: "dynamodb", method: "aws.dynamodb.selectTable", paramKey: "tableName" },
  sqsQueueUrl: { tabId: "sqs", method: "aws.sqs.selectQueue", paramKey: "queueUrl" },
  snsTopicArn: { tabId: "sns", method: "aws.sns.selectTopic", paramKey: "topicArn" },
  rdsInstanceId: { tabId: "rds", method: "aws.rds.selectInstance", paramKey: "instanceId" },
  logGroupName: { tabId: "logs", method: "aws.logs.selectLogGroup", paramKey: "logGroupName" },
  iamRoleName: { tabId: "iam", method: "aws.iam.selectRole", paramKey: "roleName" },
  ec2InstanceId: { tabId: "ec2", method: "aws.ec2.selectInstance", paramKey: "instanceId" },
  s3BucketName: { tabId: "s3", method: "aws.s3.selectBucket", paramKey: "bucketName" },
};

function normaliseTabId(provider: NavigateToResourceParams["provider"], tab: string): string {
  const trimmed = tab.trim();
  if (provider === "aws") {
    if (trimmed.startsWith("aws-")) {
      return trimmed.slice(4);
    }
    return trimmed;
  }
  if (trimmed.startsWith("azure-")) {
    return trimmed;
  }
  return `azure-${trimmed}`;
}

function resolveTabMapping(
  provider: NavigateToResourceParams["provider"],
  tab: string,
): TabResourceMapping | undefined {
  const normalised = normaliseTabId(provider, tab);
  if (provider === "aws") {
    return AWS_TAB_ALIASES[normalised];
  }
  return AZURE_TAB_ALIASES[normalised] ?? AZURE_TAB_ALIASES[tab];
}

export function planNavigateToResource(params: NavigateToResourceParams): NavigateToResourcePlan {
  const mapping = resolveTabMapping(params.provider, params.tab);
  const tabId = mapping?.tabId ?? normaliseTabId(params.provider, params.tab);
  const selections: ResourceSelectionRpc[] = [];
  const uiFlags: NavigateToResourcePlan["uiFlags"] = {};

  if (params.context) {
    for (const [key, value] of Object.entries(params.context)) {
      if (key === "openLambdaCreate" && value === "true") {
        uiFlags.openLambdaCreate = true;
        continue;
      }
      const contextMapping = AWS_CONTEXT_KEYS[key];
      if (contextMapping && value) {
        selections.push({
          method: contextMapping.method,
          params: { [contextMapping.paramKey]: value },
        });
      }
    }
  }

  const resourceKey = params.resourceKey?.trim();
  if (resourceKey && mapping?.method && mapping.paramKey) {
    selections.push({
      method: mapping.method,
      params: { [mapping.paramKey]: resourceKey },
    });
  }

  let subPage: NavigateSubPageTarget | undefined;
  if (params.subPage && mapping?.subPageParent) {
    subPage = { tab: mapping.subPageParent, pageId: params.subPage };
  }

  return {
    tabId,
    subPage,
    selections,
    uiFlags: Object.keys(uiFlags).length > 0 ? uiFlags : undefined,
  };
}

export function openTabActionToParams(
  provider: "aws" | "azure",
  tab: string,
  focus?: string,
): NavigateToResourceParams {
  return {
    provider,
    tab,
    resourceKey: focus,
  };
}

export function overviewNavigateToParams(
  tabId: string,
  context?: Record<string, string | boolean | undefined>,
  provider: "aws" | "azure" = "aws",
): NavigateToResourceParams {
  const stringContext: Record<string, string> = {};
  if (context) {
    for (const [key, value] of Object.entries(context)) {
      if (typeof value === "string" && value) {
        stringContext[key] = value;
      }
      if (key === "openLambdaCreate" && value) {
        stringContext.openLambdaCreate = "true";
      }
    }
  }
  return {
    provider,
    tab: tabId,
    context: Object.keys(stringContext).length > 0 ? stringContext : undefined,
  };
}