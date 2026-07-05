// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import type {
  AppResetResult,
  ActivityLogEntry,
  AppSettingsSnapshot,
  AuthMethod,
  Deployment,
  DeploymentJob,
  DeploymentLogEvent,
  EmulatorStatus,
  JobStatus,
  ProfileSummary,
  ProviderSummary,
  Recipe,
  RecipeManifest,
  SessionSnapshot,
  StateChangedPayload,
  TofuStatus,
  WorkspaceSnapshot,
  WorkspaceTab,
  AwsLambdaInvokeResult,
  HiddenResourceHit,
  HiddenResourcesSnapshot,
  PreferencesSnapshot,
  ServiceCatalogEntry,
  ServicePreferences,
} from "../types/backend";
import {
  isProviderEnabled,
  isServiceEnabled,
} from "./service-preferences";

export type BackendEventName =
  | "state.changed"
  | "job.updated"
  | "log.appended"
  | "deployment.log"
  | "deployment.changed";

export type DebugLogEntry = {
  timestamp: string;
  type: "request" | "response" | "error" | "event" | "console";
  method?: string;
  payload: unknown;
};

const debugLogs: DebugLogEntry[] = [];
let debugLogListener: ((entry: DebugLogEntry) => void) | null = null;
const DEBUG_PAYLOAD_MAX_CHARS = 2_000;

function truncateDebugPayload(payload: unknown): unknown {
  if (payload == null) {
    return payload;
  }
  try {
    const serialised = JSON.stringify(payload);
    if (serialised.length <= DEBUG_PAYLOAD_MAX_CHARS) {
      return payload;
    }
    return {
      truncated: true,
      originalLength: serialised.length,
      preview: `${serialised.slice(0, DEBUG_PAYLOAD_MAX_CHARS)}…`,
    };
  } catch {
    return { truncated: true, preview: String(payload).slice(0, DEBUG_PAYLOAD_MAX_CHARS) };
  }
}

export function getDebugLogs(): DebugLogEntry[] {
  return [...debugLogs];
}

export function subscribeToDebugLogs(listener: (entry: DebugLogEntry) => void): () => void {
  debugLogListener = listener;
  return () => {
    debugLogListener = null;
  };
}

export function addDebugLog(entry: DebugLogEntry): void {
  debugLogs.unshift(entry);
  if (debugLogs.length > 2000) {
    debugLogs.pop();
  }
  if (debugLogListener) {
    debugLogListener(entry);
  }
}

export function clearDebugLogs(): void {
  debugLogs.length = 0;
}

type BackendEventMap = {
  "state.changed": StateChangedPayload;
  "job.updated": JobStatus;
  "log.appended": ActivityLogEntry;
  "deployment.log": DeploymentLogEvent;
  "deployment.changed": Deployment;
};

type MockState = {
  providers: ProviderSummary[];
  profiles: ProfileSummary[];
  session: SessionSnapshot;
  logs: ActivityLogEntry[];
  settings: AppSettingsSnapshot;
  preferences: ServicePreferences;
  localStackStatus: EmulatorStatus;
  flociAzStatus: EmulatorStatus;
  flociAzConfigReady: boolean;
};

const mockListeners = new Map<
  BackendEventName,
  Set<(payload: BackendEventMap[BackendEventName]) => void>
>();

function tauriEventName(eventName: BackendEventName): string {
  return eventName.replaceAll(".", ":");
}

const mockWorkspaceTabs: WorkspaceTab[] = [
  {
    tabId: "overview",
    label: "Overview",
    summary: "Session-wide provider context and health.",
    detail: "Shows the locked cloud context and recent operator activity.",
  },
  {
    tabId: "virtualisation",
    label: "Local Runtime",
    summary: "Docker and local cloud runtime controls.",
    detail: "Manage Docker diagnostics, LocalStack, local config artefacts, and app-owned emulator state.",
  },
  {
    tabId: "s3",
    label: "S3",
    summary: "Bucket and object workbench.",
    detail: "Presigned URLs, uploads, validation, and bucket browsing are being ported.",
  },
  {
    tabId: "ec2",
    label: "EC2",
    summary: "Fleet and instance operations.",
    detail: "Instance inventory and lifecycle actions are being ported.",
  },
  {
    tabId: "lambda",
    label: "Lambda",
    summary: "Function inventory, configuration, logs and safe test invoke.",
    detail: "List functions by region, view config and recent CloudWatch logs, perform test invokes.",
  },
  {
    tabId: "dynamodb",
    label: "DynamoDB",
    summary: "Table inventory and read-only item preview.",
    detail: "List tables by region, inspect keys and GSIs, and scan the first items read-only.",
  },
  {
    tabId: "sqs",
    label: "SQS",
    summary: "Queue inventory, depth metrics, and safe message peek.",
    detail: "List queues by region, inspect depth and in-flight counts, and peek messages without deleting them.",
  },
  {
    tabId: "sns",
    label: "SNS",
    summary: "Topic inventory and subscription preview.",
    detail: "List topics by region and inspect subscriptions read-only.",
  },
  {
    tabId: "rds",
    label: "RDS",
    summary: "Database instance inventory.",
    detail: "List RDS instances by region with engine, status, and endpoint details.",
  },
  {
    tabId: "logs",
    label: "Logs",
    summary: "CloudWatch Logs group inventory and recent events.",
    detail: "Browse log groups by region and tail recent events read-only.",
  },
  {
    tabId: "iam",
    label: "IAM",
    summary: "Role and policy inventory.",
    detail: "Inspect IAM roles and customer-managed policies created in this account.",
  },
  {
    tabId: "actions",
    label: "Activity",
    summary: "Recent job, log, and refresh history.",
    detail: "Shows the latest backend activity while the workspace shell continues to expand.",
  },
];

const mockAzureWorkspaceTabs: WorkspaceTab[] = [
  {
    tabId: "overview",
    label: "Overview",
    summary: "Session-wide provider context and health.",
    detail: "Shows the locked cloud context and recent operator activity.",
  },
  {
    tabId: "virtualisation",
    label: "Local Runtime",
    summary: "Docker and local cloud runtime controls.",
    detail: "Manage Docker diagnostics, LocalStack, local config artefacts, and app-owned emulator state.",
  },
  {
    tabId: "azure-overview",
    label: "Azure",
    summary: "Subscription context and readiness.",
    detail: "Surfaces the locked Azure subscription details and the next read-only inventory slices.",
  },
  {
    tabId: "azure-resource-groups",
    label: "Resource Groups",
    summary: "Read-only Azure resource group inventory.",
    detail: "Browse resource groups discovered for the locked Azure subscription.",
  },
  {
    tabId: "azure-vms",
    label: "Virtual Machines",
    summary: "Read-only Azure virtual machine inventory.",
    detail: "Browse virtual machines for the selected Azure resource group.",
  },
  {
    tabId: "azure-storage",
    label: "Storage",
    summary: "Blob storage accounts, containers, and objects.",
    detail: "Browse storage accounts and blob containers, upload and delete blobs when write mode is on.",
  },
  {
    tabId: "azure-app-service",
    label: "App Service",
    summary: "Cloud App Service web apps.",
    detail: "Browse and create App Service web apps on cloud Azure profiles.",
  },
  {
    tabId: "azure-log-analytics",
    label: "Log Analytics",
    summary: "Run KQL queries against Log Analytics workspaces.",
    detail: "Query Azure Monitor logs with KQL.",
  },
  {
    tabId: "azure-waf",
    label: "WAF",
    summary: "Front Door WAF logs and policy workbench.",
    detail: "Track requests by X-Azure-Ref and inspect WAF policy config.",
  },
  {
    tabId: "azure-functions",
    label: "Functions",
    summary: "Browse and invoke Azure Functions.",
    detail: "List Function Apps and invoke HTTP-triggered functions.",
  },
  {
    tabId: "azure-key-vault",
    label: "Key Vault",
    summary: "Browse and manage Key Vault secrets.",
    detail: "List vaults and secrets.",
  },
  {
    tabId: "azure-cosmos",
    label: "Cosmos DB",
    summary: "Browse Cosmos DB databases and items.",
    detail: "Read-only Cosmos browse.",
  },
  {
    tabId: "azure-postgres",
    label: "PostgreSQL",
    summary: "Azure Database for PostgreSQL Flexible Servers.",
    detail: "List flexible servers and reveal connection strings.",
  },
  {
    tabId: "azure-queues",
    label: "Queues",
    summary: "Browse storage queues and peek messages.",
    detail: "List queues and peek messages.",
  },
  {
    tabId: "azure-entra",
    label: "Entra ID",
    summary: "Browse directory users, groups, and apps.",
    detail: "Read-only Entra directory browse.",
  },
  {
    tabId: "actions",
    label: "Activity",
    summary: "Recent job, log, and refresh history.",
    detail: "Shows the latest backend activity while the workspace shell continues to expand.",
  },
];

const mockWorkspaceBuckets = [
  {
    name: "cloudsprocket-artifacts",
    summary: "Primary artefact bucket for sandbox automation.",
  },
  {
    name: "cloudsprocket-reports",
    summary: "Reporting and export bucket for the sandbox profile.",
  },
];

const mockWorkspaceObjects = [
  {
    key: "reports/weekly-summary.json",
    size: "18 KB",
    modifiedAt: "2026-04-14T09:12:00Z",
    storageClass: "STANDARD",
  },
  {
    key: "uploads/demo-package.zip",
    size: "42 MB",
    modifiedAt: "2026-04-14T08:40:00Z",
    storageClass: "STANDARD",
  },
];

const mockWorkspaceObjectMetadata: Record<string, { label: string; value: string }[]> = {
  "reports/weekly-summary.json": [
    { label: "Bucket", value: "cloudsprocket-artifacts" },
    { label: "Key", value: "reports/weekly-summary.json" },
    { label: "Content Type", value: "application/json" },
    { label: "ETag", value: "demo-etag-001" },
  ],
  "uploads/demo-package.zip": [
    { label: "Bucket", value: "cloudsprocket-artifacts" },
    { label: "Key", value: "uploads/demo-package.zip" },
    { label: "Content Type", value: "application/zip" },
    { label: "ETag", value: "demo-etag-002" },
  ],
};

function mockExportSnippets(bucketName?: string, objectKey?: string) {
  if (!bucketName || !objectKey) {
    return [];
  }
  const s3Uri = `s3://${bucketName}/${objectKey}`;
  return [
    { label: "S3 URI", value: s3Uri },
    { label: "AWS CLI copy command", value: `aws s3 cp "${s3Uri}" .` },
    { label: "AWS CLI presign command", value: `aws s3 presign "${s3Uri}" --expires-in 3600` },
  ];
}

const mockWorkspaceInstances = [
  {
    instanceId: "i-0123456789abcdef0",
    name: "sandbox-app-1",
    state: "running",
    instanceType: "t3.medium",
    availabilityZone: "us-east-1a",
    privateIp: "10.0.14.22",
    vpcId: "vpc-0sandbox001",
    subnetId: "subnet-0app001",
    keyName: "sandbox-key",
    platformDetails: "Linux/UNIX",
    architecture: "x86_64",
    launchTime: "2026-04-14T07:15:00Z",
    securityGroups: ["app-sg (sg-0123456789abcdef0)"],
    tags: [
      { label: "Name", value: "sandbox-app-1" },
      { label: "Environment", value: "sandbox" },
      { label: "Owner", value: "platform" },
    ],
  },
  {
    instanceId: "i-0fedcba9876543210",
    name: "sandbox-worker-1",
    state: "stopped",
    instanceType: "t3.small",
    availabilityZone: "us-east-1b",
    privateIp: "10.0.18.11",
    vpcId: "vpc-0sandbox001",
    subnetId: "subnet-0worker001",
    keyName: "sandbox-key",
    platformDetails: "Linux/UNIX",
    architecture: "x86_64",
    launchTime: "2026-04-13T19:20:00Z",
    securityGroups: ["worker-sg (sg-0fedcba9876543210)"],
    tags: [
      { label: "Name", value: "sandbox-worker-1" },
      { label: "Environment", value: "sandbox" },
      { label: "Owner", value: "platform" },
    ],
  },
];

const mockWorkspaceRegions = ["us-east-1", "eu-west-2"];

const mockWorkspaceSQSQueues = [
  {
    queueName: "process-order",
    queueUrl: "http://localhost:4566/000000000000/process-order",
    approximateNumberOfMessages: 4,
    approximateNumberOfMessagesNotVisible: 1,
    approximateNumberOfMessagesDelayed: 0,
    visibilityTimeout: 30,
    createdTimestamp: 1718452800,
    queueArn: "arn:aws:sqs:us-east-1:000000000000:process-order",
    receiveMessageWaitTimeSeconds: 0,
  },
  {
    queueName: "cloudsprocket-events",
    queueUrl: "http://localhost:4566/000000000000/cloudsprocket-events",
    approximateNumberOfMessages: 0,
    approximateNumberOfMessagesNotVisible: 0,
    visibilityTimeout: 30,
    createdTimestamp: 1718366400,
    queueArn: "arn:aws:sqs:us-east-1:000000000000:cloudsprocket-events",
  },
];

const mockWorkspaceDynamoDBTables = [
  {
    tableName: "cloudsprocket-orders",
    status: "ACTIVE",
    itemCount: 1284,
    tableSizeBytes: 524288,
    billingMode: "PAY_PER_REQUEST",
    hashKey: "orderId",
    rangeKey: "createdAt",
    globalSecondaryIndexes: [
      {
        indexName: "customer-index",
        hashKey: "customerId",
        rangeKey: "createdAt",
        status: "ACTIVE",
      },
    ],
    sampleItems: [
      '{"orderId":"ord-001","customerId":"cust-42","createdAt":"2026-06-14T10:00:00Z","total":49.99}',
      '{"orderId":"ord-002","customerId":"cust-17","createdAt":"2026-06-14T11:30:00Z","total":12.50}',
    ],
  },
  {
    tableName: "cloudsprocket-sessions",
    status: "ACTIVE",
    itemCount: 42,
    tableSizeBytes: 16384,
    billingMode: "PAY_PER_REQUEST",
    hashKey: "sessionId",
    sampleItems: ['{"sessionId":"sess-abc","userId":"user-1","ttl":1718452800}'],
  },
];

const mockWorkspaceSNSTopics = [
  {
    topicArn: "arn:aws:sns:us-east-1:000000000000:order-events",
    topicName: "order-events",
    displayName: "Order events",
    subscriptionsConfirmed: "2",
    subscriptionsPending: "0",
    subscriptions: [
      {
        subscriptionArn: "arn:aws:sns:us-east-1:000000000000:order-events:sub-1",
        protocol: "sqs",
        endpoint: "arn:aws:sqs:us-east-1:000000000000:process-order",
      },
    ],
  },
  {
    topicArn: "arn:aws:sns:us-east-1:000000000000:cloudsprocket-alerts",
    topicName: "cloudsprocket-alerts",
    subscriptionsConfirmed: "1",
  },
];

const mockWorkspaceECSClusters = [
  {
    clusterArn: "arn:aws:ecs:us-east-1:000000000000:cluster/demo",
    clusterName: "demo",
    status: "ACTIVE",
    runningTasksCount: 1,
    activeServicesCount: 1,
  },
];

const mockWorkspaceECSServices = [
  {
    serviceArn: "arn:aws:ecs:us-east-1:000000000000:service/demo/web",
    serviceName: "web",
    status: "ACTIVE",
    desiredCount: 1,
    runningCount: 1,
    launchType: "FARGATE",
  },
];

const mockWorkspaceECSTasks = [
  {
    taskArn: "arn:aws:ecs:us-east-1:000000000000:task/demo/abc123",
    lastStatus: "RUNNING",
    launchType: "FARGATE",
    containers: [{ name: "app", image: "nginx:latest", lastStatus: "RUNNING" }],
  },
];

const mockWorkspaceApiGatewayApis = [
  {
    apiKey: "http:xyz789",
    apiId: "xyz789",
    apiName: "orders-http-api",
    apiType: "HTTP",
    endpoint: "https://xyz789.execute-api.us-east-1.amazonaws.com",
    protocol: "HTTP",
  },
  {
    apiKey: "rest:abc123",
    apiId: "abc123",
    apiName: "legacy-rest-api",
    apiType: "REST",
    endpoint: "https://abc123.execute-api.us-east-1.amazonaws.com",
  },
];

const mockWorkspaceApiGatewayStages = [
  {
    apiKey: "http:xyz789",
    stageName: "$default",
    invokeUrl: "https://xyz789.execute-api.us-east-1.amazonaws.com/$default",
    autoDeploy: true,
  },
  {
    apiKey: "rest:abc123",
    stageName: "prod",
    invokeUrl: "https://abc123.execute-api.us-east-1.amazonaws.com/prod",
    deploymentId: "dep1",
  },
];

const mockWorkspaceSecretsManagerSecrets = [
  {
    arn: "arn:aws:secretsmanager:us-east-1:000000000000:secret:cloudsprocket/db-password-abc",
    name: "cloudsprocket/db-password",
    description: "Application database password",
    lastChangedDate: "2026-07-01T10:00:00Z",
    rotationEnabled: false,
  },
  {
    arn: "arn:aws:secretsmanager:us-east-1:000000000000:secret:cloudsprocket/api-key-xyz",
    name: "cloudsprocket/api-key",
    description: "Outbound API credentials",
    lastChangedDate: "2026-06-15T08:30:00Z",
    rotationEnabled: true,
  },
];

const mockWorkspaceRDSInstances = [
  {
    dbInstanceIdentifier: "cloudsprocket-app-db",
    engine: "postgres",
    engineVersion: "15.4",
    status: "available",
    instanceClass: "db.t3.micro",
    endpointAddress: "cloudsprocket-app-db.rds.localhost",
    endpointPort: 5432,
    availabilityZone: "us-east-1a",
    allocatedStorage: 20,
    multiAz: false,
    storageEncrypted: true,
  },
  {
    dbInstanceIdentifier: "cloudsprocket-analytics-db",
    engine: "mysql",
    engineVersion: "8.0",
    status: "available",
    instanceClass: "db.t3.small",
  },
];

const mockWorkspaceLogGroups = [
  {
    logGroupName: "/aws/lambda/process-order",
    arn: "arn:aws:logs:us-east-1:000000000000:log-group:/aws/lambda/process-order",
    storedBytes: 1048576,
    retentionInDays: 7,
    creationTime: 1718448000000,
    recentEvents: [
      "2026-06-15 10:05:12 START RequestId: abc123",
      "2026-06-15 10:05:12 END RequestId: abc123",
    ],
  },
  {
    logGroupName: "/ecs/cloudsprocket-app",
    storedBytes: 524288,
    retentionInDays: 30,
  },
];

const mockWorkspaceIAMRoles = [
  {
    roleName: "cloudsprocket-lambda-role",
    roleArn: "arn:aws:iam::000000000000:role/cloudsprocket-lambda-role",
    path: "/",
    description: "Lambda execution role for CloudSprocket demos.",
    createDate: "2026-06-01T09:00:00Z",
    attachedPolicies: ["AWSLambdaBasicExecutionRole", "cloudsprocket-data-access"],
  },
  {
    roleName: "cloudsprocket-ecs-task-role",
    roleArn: "arn:aws:iam::000000000000:role/cloudsprocket-ecs-task-role",
    path: "/service/",
    attachedPolicies: ["AmazonECSTaskExecutionRolePolicy"],
  },
];

const mockWorkspaceIAMPolicies = [
  {
    policyName: "cloudsprocket-data-access",
    policyArn: "arn:aws:iam::000000000000:policy/cloudsprocket-data-access",
    attachmentCount: 2,
    updateDate: "2026-06-10T14:30:00Z",
  },
];

const mockWorkspaceLambdaFunctions = [
  {
    functionName: "process-order",
    runtime: "nodejs20.x",
    memorySize: 512,
    lastModified: "2026-06-10T12:00:00Z",
    description: "Handles order processing from SQS",
    state: "Active",
    handler: "index.handler",
    timeout: 30,
    logGroup: "/aws/lambda/process-order",
    recentLogs: ["2026-06-15 10:05:12 START RequestId: abc123", "2026-06-15 10:05:12 END RequestId: abc123"],
  },
  {
    functionName: "resize-image",
    runtime: "python3.12",
    memorySize: 1024,
    lastModified: "2026-06-12T08:30:00Z",
    state: "Active",
  },
];

const mockAzureResourceGroups = [
  {
    name: "rg-marketing-prod",
    location: "uaenorth",
    provisioningState: "Succeeded",
    managedBy: "",
    tags: [
      { label: "Environment", value: "prod" },
      { label: "Owner", value: "marketing" },
    ],
  },
  {
    name: "rg-marketing-dev",
    location: "uaenorth",
    provisioningState: "Succeeded",
    managedBy: "",
    tags: [{ label: "Environment", value: "dev" }],
  },
];

const mockAzureStorageAccounts = [
  {
    name: "devstoreaccount1",
    kind: "StorageV2",
    location: "local",
    blobEndpoint: "http://localhost:4577/devstoreaccount1",
    summary: "floci-az development storage account",
  },
];

const mockAzureBlobContainers = [
  { name: "uploads", lastModified: "2026-06-17T10:00:00Z" },
  { name: "assets", lastModified: "2026-06-16T14:30:00Z" },
];

const mockAzureBlobs = [
  { name: "uploads/readme.txt", size: "128 B", modifiedAt: "2026-06-17T10:00:00Z", contentType: "text/plain" },
  { name: "uploads/logo.png", size: "4.2 KiB", modifiedAt: "2026-06-16T09:15:00Z", contentType: "image/png" },
];

const mockAzureWebApps = [
  {
    name: "mkt-portal",
    resourceGroup: "rg-marketing-prod",
    location: "uaenorth",
    state: "Running",
    defaultHostName: "mkt-portal.azurewebsites.net",
    kind: "app,linux",
    httpsOnly: true,
    appServicePlan: "mkt-portal-plan",
    planSku: "P1v3 (PremiumV3)",
    runtime: "NODE|22-lts",
    outboundIpAddresses: "20.0.0.1,20.0.0.2",
    identityType: "SystemAssigned",
    identityPrincipalId: "principal-guid-1",
  },
];

const mockAzureAppServicePlans = [
  {
    name: "mkt-portal-plan",
    resourceGroup: "rg-marketing-prod",
    location: "uaenorth",
    sku: "P1v3 (PremiumV3)",
    kind: "linux",
    status: "Ready",
    numberOfWorkers: 1,
  },
];

const mockAzureWebAppSettings = [
  { name: "WEBSITE_NODE_DEFAULT_VERSION", value: "~22", slotSetting: false },
  { name: "APPINSIGHTS_INSTRUMENTATIONKEY", value: "secret-key-value", slotSetting: false },
];

const mockAzureWebAppDeploymentSlots = [
  {
    name: "staging",
    status: "Ready",
    defaultHostName: "demo-app-staging.azurewebsites.net",
    trafficPercent: 0,
  },
];

const mockAzureLogAnalyticsWorkspaces = [
  { name: "law-platform", resourceGroup: "rg-marketing-prod", location: "uaenorth", customerId: "law-guid-1" },
  { name: "law-shared", resourceGroup: "rg-shared", location: "westeurope", customerId: "law-guid-2" },
];

const mockAzureBastionHosts = [
  {
    name: "bastion-hub",
    resourceGroup: "rg-network",
    location: "westeurope",
    sku: "Standard",
  },
];

const mockAzureWafLogSchema = {
  mode: "azureDiagnostics",
  tableName: "AzureDiagnostics",
  categories: ["FrontDoorWebApplicationFirewallLog"],
  columns: {
    timeGenerated: "TimeGenerated",
    action: "action_s",
    ruleName: "ruleName_s",
    requestUri: "requestUri_s",
    clientIP: "clientIP_s",
    host: "host_s",
    policyName: "policy_s",
    policyMode: "policyMode_s",
    trackingReference: "trackingReference_s",
    detailsMatches: "details_matches_s",
  },
  detected: true,
  message: "AzureDiagnostics WAF rows detected (mock).",
};

const mockAzureWafPolicies = [
  {
    name: "waf-portal",
    resourceGroup: "rg-marketing-prod",
    location: "global",
    sku: "Premium_AzureFrontDoor",
    mode: "Prevention",
    enabled: true,
  },
];

const mockAzureWafPolicyDetail = {
  name: "waf-portal",
  resourceGroup: "rg-marketing-prod",
  location: "global",
  sku: "Premium_AzureFrontDoor",
  mode: "Prevention",
  enabled: true,
  managedRuleSets: [
    { ruleSetType: "Microsoft_DefaultRuleSet", ruleSetVersion: "2.1", ruleGroupName: "SQLI" },
  ],
  managedRuleOverrides: [{ ruleId: "942100", ruleGroupName: "SQLI", enabled: false }],
  exclusions: [
    { matchVariable: "RequestHeader", selectorMatchOperator: "Equals", selector: "X-Debug" },
  ],
  customRules: [{ name: "AllowHealth", priority: 1, ruleType: "MatchRule", action: "Allow", enabled: true }],
};

const mockAzureWafRuleFireCounts = [
  { ruleName: "Microsoft_DefaultRuleSet-2.1-SQLI-942100", count: 42, action: "Block" },
  { ruleName: "Microsoft_DefaultRuleSet-2.1-XSS-941320", count: 7, action: "Log" },
];

const mockLogAnalyticsHistory: Record<string, { query: string; timespan?: string; ranAt: string }[]> =
  {};
const mockLogAnalyticsSaved: Record<string, { id: string; name: string; query: string; timespan?: string }[]> =
  {};

const mockAzureFunctionApps = [
  { name: "orders-fn", resourceGroup: "rg-marketing-prod", location: "uaenorth", state: "Running", defaultHostName: "orders-fn.azurewebsites.net" },
];

const mockAzureFunctions = [
  { name: "createOrder", trigger: "httpTrigger" },
  { name: "timerCleanup", trigger: "timerTrigger" },
];

const mockAzureKeyVaults = [
  { name: "app-vault", resourceGroup: "rg-marketing-prod", location: "uaenorth", vaultUri: "https://app-vault.vault.azure.net/" },
];

const mockAzureKeyVaultSecrets = [
  { name: "db-password", enabled: true },
  { name: "api-key", enabled: true },
];

const mockSecretValues: Record<string, string> = {
  "db-password": "p@ssw0rd-mock",
  "api-key": "ak-mock-123",
};

const mockAzureCosmosAccounts = [
  { name: "devstoreaccount1", resourceGroup: "rg-marketing-prod", documentEndpoint: "http://localhost:4577/devstoreaccount1-cosmos" },
];

const mockAzureCosmosDatabases = [{ name: "appdb" }];

const mockAzureCosmosContainers = [
  { name: "orders", partitionKey: "/customerId" },
  { name: "users", partitionKey: "/id" },
];

const mockAzureCosmosItems = [
  { id: "order-1", json: '{"id":"order-1","customerId":"c-9","total":42}' },
  { id: "order-2", json: '{"id":"order-2","customerId":"c-3","total":17}' },
];

const mockAzurePostgresServers = [
  {
    name: "lab-dev-pg",
    resourceGroup: "rg-marketing-prod",
    location: "westeurope",
    version: "17",
    administratorLogin: "psqladmin",
    sku: "B_Standard_B1ms",
    storageMb: 32768,
    provisioningState: "Succeeded",
    fqdn: "localhost",
    localHost: "localhost",
    localPort: 54983,
  },
];

const mockAzurePostgresConnection = {
  host: "localhost",
  port: 54983,
  psql: 'psql "host=localhost port=54983 dbname=postgres user=psqladmin password=<password> sslmode=disable"',
  uri: "postgresql://psqladmin:<password>@localhost:54983/postgres?sslmode=disable",
  jdbcUrl:
    "jdbc:postgresql://localhost:54983/postgres?user=psqladmin&password=<password>&sslmode=disable",
  dotNet:
    "Host=localhost;Port=54983;Database=postgres;Username=psqladmin;Password=<password>;SSL Mode=Disable;",
};

const mockAzureFrontDoorProfiles = [
  {
    name: "demo-afd",
    resourceGroup: "demo-rg",
    location: "Global",
    sku: "Standard_AzureFrontDoor",
    wafPolicyName: "demo-waf",
    wafPolicyResourceGroup: "demo-rg",
  },
];

const mockAzureFrontDoorEndpoints = [
  {
    name: "api",
    profileName: "demo-afd",
    resourceGroup: "demo-rg",
    hostName: "api.azureedge.net",
    enabledState: "Enabled",
  },
];

const mockAzureFrontDoorOriginGroups = [
  {
    name: "default",
    profileName: "demo-afd",
    resourceGroup: "demo-rg",
    healthProbe: "/health",
    loadBalancing: "sampleSize=4",
  },
];

const mockAzureFrontDoorOrigins = [
  {
    name: "origin-app",
    originGroupName: "default",
    profileName: "demo-afd",
    resourceGroup: "demo-rg",
    hostName: "app.internal",
    enabledState: "Enabled",
    priority: 1,
    weight: 1000,
  },
];

const mockAzureStorageQueues = [{ name: "jobs" }, { name: "events" }];

const mockAzureQueueMessages = [
  { id: "msg-1", text: "process order 42", dequeueCount: 0, insertionTime: "2026-06-21T10:00:00Z" },
  { id: "msg-2", text: "process order 43", dequeueCount: 1, insertionTime: "2026-06-21T10:01:00Z" },
];

const mockAzureEntraUsers = [
  { displayName: "Ada Lovelace", userPrincipalName: "ada@contoso.com", id: "u-1" },
  { displayName: "Alan Turing", userPrincipalName: "alan@contoso.com", id: "u-2" },
];

const mockAzureEntraGroups = [{ displayName: "Engineers", id: "g-1" }];

const mockAzureEntraApps = [{ displayName: "orders-api", appId: "app-1" }];

const mockAzureVirtualMachines = {
  "rg-marketing-prod": [
    {
      vmId: "/subscriptions/sub-001/resourceGroups/rg-marketing-prod/providers/Microsoft.Compute/virtualMachines/mkt-api-01",
      name: "mkt-api-01",
      resourceGroup: "rg-marketing-prod",
      location: "uaenorth",
      powerState: "VM running",
      provisioningState: "Succeeded",
      size: "Standard_D2s_v5",
      osType: "Linux",
      privateIp: "10.10.2.14",
      publicIp: "20.74.10.10",
      tags: [
        { label: "Tier", value: "api" },
        { label: "Owner", value: "marketing" },
      ],
    },
  ],
  "rg-marketing-dev": [
    {
      vmId: "/subscriptions/sub-001/resourceGroups/rg-marketing-dev/providers/Microsoft.Compute/virtualMachines/mkt-worker-01",
      name: "mkt-worker-01",
      resourceGroup: "rg-marketing-dev",
      location: "uaenorth",
      powerState: "VM deallocated",
      provisioningState: "Succeeded",
      size: "Standard_B2s",
      osType: "Linux",
      privateIp: "10.20.1.9",
      publicIp: "",
      tags: [{ label: "Tier", value: "worker" }],
    },
  ],
};

const mockProfiles: ProfileSummary[] = [
  {
    providerId: "aws",
    profileId: "sandbox",
    displayName: "sandbox",
    summary: "AWS sandbox profile with SSO enabled.",
    sourcePaths: ["C:/Users/Ali/.aws/config", "C:/Users/Ali/.aws/credentials"],
    attributes: [
      { label: "Region", value: "us-east-1" },
      { label: "SSO Start URL", value: "https://example.awsapps.com/start" },
      { label: "Endpoint Url", value: "http://192.168.50.168:4566" },
      { label: "Cloudsprocket Allow Writes", value: "true" },
    ],
    authMethods: [
      { method: "cli", label: "CLI", summary: "AWS CLI detected.", available: true },
      { method: "sso", label: "SSO", summary: "AWS SSO metadata detected.", available: true },
      { method: "local-files", label: "Local Files", summary: "Read-only profile data.", available: true },
    ],
  },
  {
    providerId: "aws",
    profileId: "prod",
    displayName: "prod",
    summary: "AWS production profile without SSO metadata.",
    sourcePaths: ["C:/Users/Ali/.aws/config"],
    attributes: [{ label: "Region", value: "eu-west-1" }],
    authMethods: [
      { method: "cli", label: "CLI", summary: "AWS CLI detected.", available: true },
      { method: "sso", label: "SSO", summary: "No SSO metadata detected.", available: false },
      { method: "local-files", label: "Local Files", summary: "Read-only profile data.", available: true },
    ],
  },
  {
    providerId: "azure",
    profileId: "sub-001",
    displayName: "Marketing Subscription",
    summary: "Azure subscription visibility only in this milestone.",
    sourcePaths: ["C:/Users/Ali/.azure/azureProfile.json"],
    attributes: [
      { label: "Tenant ID", value: "tenant-marketing" },
      { label: "User", value: "ali@example.com" },
    ],
    authMethods: [
      { method: "cli", label: "CLI", summary: "Azure CLI available.", available: true },
      { method: "sso", label: "SSO", summary: "Provider-specific SSO not yet exposed.", available: false },
      { method: "local-files", label: "Local Files", summary: "Read-only profile data.", available: true },
    ],
  },
  {
    providerId: "gcp",
    profileId: "default",
    displayName: "platform-project",
    summary: "GCP configuration visibility only in this milestone.",
    sourcePaths: ["C:/Users/Ali/AppData/Roaming/gcloud/configurations/config_default"],
    attributes: [
      { label: "Project", value: "platform-project" },
      { label: "Account", value: "ali@example.com" },
    ],
    authMethods: [
      { method: "cli", label: "CLI", summary: "gcloud available.", available: true },
      { method: "sso", label: "SSO", summary: "Provider-specific SSO not yet exposed.", available: false },
      { method: "local-files", label: "Local Files", summary: "Read-only profile data.", available: true },
    ],
  },
];

function upsertMockProfile(profile: ProfileSummary): void {
  const index = mockProfiles.findIndex(
    (existing) => existing.providerId === profile.providerId && existing.profileId === profile.profileId,
  );
  if (index >= 0) {
    mockProfiles[index] = profile;
  } else {
    mockProfiles.push(profile);
  }
}

const mockState: MockState = {
  providers: [
    {
      providerId: "aws",
      label: "AWS",
      state: "configured",
      summary: "Local credentials or profile data detected.",
      profileCount: 2,
      commandPath: "C:/Program Files/Amazon/AWSCLIV2/aws.exe",
      locations: ["C:/Users/Ali/.aws/config", "C:/Users/Ali/.aws/credentials"],
    },
    {
      providerId: "azure",
      label: "Azure",
      state: "configured",
      summary: "Azure profile cache detected.",
      profileCount: 1,
      commandPath: "C:/Program Files/Microsoft SDKs/Azure/CLI2/wbin/az.cmd",
      locations: ["C:/Users/Ali/.azure/azureProfile.json"],
    },
    {
      providerId: "gcp",
      label: "GCP",
      state: "configured",
      summary: "gcloud configurations detected.",
      profileCount: 1,
      commandPath: "C:/Program Files/Google/Cloud SDK/google-cloud-sdk/bin/gcloud.cmd",
      locations: ["C:/Users/Ali/AppData/Roaming/gcloud/configurations"],
    },
  ],
  profiles: mockProfiles,
  session: {
    currentProviderId: "aws",
    selectedProfileId: "sandbox",
    selectedAuthMethod: "cli",
    selectedS3BucketName: "cloudsprocket-artifacts",
    selectedS3ObjectKey: "reports/weekly-summary.json",
    s3PrefixFilter: "",
    selectedEc2Region: "us-east-1",
    selectedEc2InstanceId: "i-0123456789abcdef0",
    isLocked: false,
    availableAuthMethods: mockProfiles[0].authMethods,
    workspaceTabs: [],
  },
  logs: [
    {
      id: 1,
      level: "info",
      message: "Rewrite scaffold running with a mock backend bridge in browser mode.",
      timestamp: new Date().toISOString(),
    },
  ],
  settings: {
    platformName: "windows",
    configDir: "C:/Users/Ali/AppData/Local/CloudSprocket",
    databasePath: "C:/Users/Ali/AppData/Local/CloudSprocket/cloudsprocket.db",
    logPath: "C:/Users/Ali/AppData/Local/CloudSprocket/logs/cloudsprocket.log",
    runtimeMode: "cloud",
    localConfigDir: "C:/Users/Ali/AppData/Local/CloudSprocket/local-config",
    emulatorStateDir: "C:/Users/Ali/AppData/Local/CloudSprocket/emulators",
    localStackImage: "localstack/localstack:stable",
    flociAzImage: "floci/floci-az:latest",
  },
  localStackStatus: "stopped",
  flociAzStatus: "stopped",
  flociAzConfigReady: false,
  preferences: {
    disabledProviders: [],
    disabledServices: {},
  } satisfies ServicePreferences,
};

const initialMockSession: SessionSnapshot = {
  currentProviderId: "aws",
  selectedProfileId: "sandbox",
  selectedAuthMethod: "cli",
  isLocked: false,
  availableAuthMethods: mockProfiles[0].authMethods,
  workspaceTabs: [],
};

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function nextMockLogId(): number {
  return mockState.logs.reduce((max, entry) => Math.max(max, entry.id), 0) + 1;
}

function currentProfile(): ProfileSummary | undefined {
  const providerId = mockState.session.isLocked
    ? mockState.session.lockedProviderId
    : mockState.session.currentProviderId;
  const profileId = mockState.session.isLocked
    ? mockState.session.lockedProfileId
    : mockState.session.selectedProfileId;
  return mockState.profiles.find(
    (profile) =>
      profile.providerId === providerId &&
      profile.profileId === profileId,
  );
}

function currentProvider(): ProviderSummary | undefined {
  const providerId = mockState.session.isLocked
    ? mockState.session.lockedProviderId
    : mockState.session.currentProviderId;
  return mockState.providers.find(
    (provider) => provider.providerId === providerId,
  );
}

function rebuildSessionDerivedState(): void {
  const profile = currentProfile();
  mockState.session.availableAuthMethods = profile?.authMethods ?? [];
  if (
    mockState.session.selectedAuthMethod &&
    !mockState.session.availableAuthMethods.some(
      (method) =>
        method.method === mockState.session.selectedAuthMethod && method.available,
    )
  ) {
    mockState.session.selectedAuthMethod =
      mockState.session.availableAuthMethods.find((method) => method.available)?.method;
  }
  const providerId = mockState.session.isLocked
    ? mockState.session.lockedProviderId
    : mockState.session.currentProviderId;
  mockState.session.workspaceTabs = !mockState.session.isLocked
    ? []
    : filterMockWorkspaceTabs(
        providerId === "azure" ? mockAzureWorkspaceTabs : mockWorkspaceTabs,
        providerId ?? "aws",
      );
}

function emitMockEvent<K extends BackendEventName>(
  eventName: K,
  payload: BackendEventMap[K],
): void {
  const listeners = mockListeners.get(eventName);
  if (!listeners) {
    return;
  }
  listeners.forEach((listener) => {
    listener(payload as BackendEventMap[BackendEventName]);
  });
}

function emitStateChanged(): void {
  emitMockEvent("state.changed", {
    providers: mockState.providers,
    profiles: mockState.profiles.filter(
      (profile) => profile.providerId === mockState.session.currentProviderId,
    ),
    session: mockState.session,
  });
}

function appendLog(level: ActivityLogEntry["level"], message: string): void {
  const entry: ActivityLogEntry = {
    id: nextMockLogId(),
    level,
    message,
    timestamp: new Date().toISOString(),
  };
  mockState.logs = [entry, ...mockState.logs].slice(0, 50);
  emitMockEvent("log.appended", entry);
}

function setCurrentProvider(providerId: string): void {
  mockState.session.currentProviderId = providerId;
  const firstProfile = mockState.profiles.find(
    (profile) => profile.providerId === providerId,
  );
  mockState.session.selectedProfileId = firstProfile?.profileId;
  rebuildSessionDerivedState();
}

function filteredProfiles(providerId?: string): ProfileSummary[] {
  if (!providerId) {
    return mockState.profiles;
  }
  return mockState.profiles.filter((profile) => profile.providerId === providerId);
}

const mockServiceCatalogue: ServiceCatalogEntry[] = [
  {
    providerId: "aws",
    serviceId: "s3",
    label: "S3",
    summary: "Bucket and object workbench.",
    detail: "Presigned URLs, uploads, validation, and bucket browsing.",
    category: "service",
    inventoryScope: "s3",
    enabled: true,
  },
  {
    providerId: "aws",
    serviceId: "ec2",
    label: "EC2",
    summary: "Fleet and instance operations.",
    detail: "Instance inventory and lifecycle actions.",
    category: "service",
    inventoryScope: "ec2",
    enabled: true,
  },
  {
    providerId: "azure",
    serviceId: "azure-storage",
    label: "Storage",
    summary: "Blob storage accounts, containers, and objects.",
    detail: "Browse storage accounts and blob containers.",
    category: "service",
    inventoryScope: "storage",
    enabled: true,
  },
];

function mockPreferencesState(): ServicePreferences {
  return mockState.preferences;
}

function countMockCatalogueResources(
  workspace: WorkspaceSnapshot,
  providerId: string,
  serviceId: string,
): number {
  if (providerId === "aws") {
    switch (serviceId) {
      case "s3":
        return workspace.s3Buckets.length;
      case "ec2":
        return workspace.ec2Instances.length;
      case "lambda":
        return workspace.lambdaFunctions.length;
      case "dynamodb":
        return workspace.dynamodbTables.length;
      case "sqs":
        return workspace.sqsQueues.length;
      case "sns":
        return workspace.snsTopics.length;
      case "rds":
        return workspace.rdsInstances.length;
      case "ecs":
        return workspace.ecsClusters.length;
      case "apigateway":
        return workspace.apiGatewayApis.length;
      case "secrets":
        return workspace.secretsManagerSecrets.length;
      case "logs":
        return workspace.logGroups.length;
      case "iam":
        return workspace.iamRoles.length + workspace.iamPolicies.length;
      default:
        return 0;
    }
  }
  if (providerId === "azure") {
    switch (serviceId) {
      case "azure-overview":
      case "azure-resource-groups":
        return workspace.azureResourceGroups.length;
      case "azure-vms":
        return workspace.azureVirtualMachines.length;
      case "azure-storage":
        return workspace.azureStorageAccounts.length;
      default:
        return 0;
    }
  }
  return 0;
}

function buildMockHiddenResourcesSnapshot(): HiddenResourcesSnapshot {
  if (!mockState.session.isLocked) {
    return { hits: [] };
  }
  const providerId = mockState.session.lockedProviderId;
  if (!providerId) {
    return { hits: [] };
  }
  const preferences = mockPreferencesState();
  const workspace = buildMockWorkspace();
  const hits: HiddenResourceHit[] = [];
  for (const entry of mockServiceCatalogue) {
    if (entry.providerId !== providerId) {
      continue;
    }
    if (isServiceEnabled(preferences, entry.providerId, entry.serviceId)) {
      continue;
    }
    const resourceCount = countMockCatalogueResources(
      workspace,
      entry.providerId,
      entry.serviceId,
    );
    if (resourceCount <= 0) {
      continue;
    }
    hits.push({
      providerId: entry.providerId,
      serviceId: entry.serviceId,
      label: entry.label,
      resourceCount,
    });
  }
  return { hits };
}

function buildMockPreferencesSnapshot(update?: ServicePreferences): PreferencesSnapshot {
  if (update) {
    mockState.preferences = {
      disabledProviders: [...update.disabledProviders],
      disabledServices: Object.fromEntries(
        Object.entries(update.disabledServices).map(([providerId, serviceIds]) => [
          providerId,
          [...serviceIds],
        ]),
      ),
    };
  }
  const preferences = mockPreferencesState();
  return {
    preferences,
    catalogue: mockServiceCatalogue.map((entry) => ({
      ...entry,
      enabled: isServiceEnabled(preferences, entry.providerId, entry.serviceId),
    })),
  };
}

function filterMockWorkspaceTabs(tabs: WorkspaceTab[], providerId: string): WorkspaceTab[] {
  const preferences = mockPreferencesState();
  if (!isProviderEnabled(preferences, providerId)) {
    return tabs.filter((tab) =>
      ["overview", "virtualisation", "actions"].includes(tab.tabId),
    );
  }
  return tabs.filter(
    (tab) =>
      ["overview", "virtualisation", "actions"].includes(tab.tabId) ||
      isServiceEnabled(preferences, providerId, tab.tabId),
  );
}

function buildMockWorkspace(): WorkspaceSnapshot {
  const provider = currentProvider();
  const profile = currentProfile();
  const isAWSWorkspace = provider?.providerId === "aws";
  const isAzureWorkspace = provider?.providerId === "azure";
  const selectedS3BucketName = isAWSWorkspace
    ? mockState.session.selectedS3BucketName ?? mockWorkspaceBuckets[0]?.name
    : undefined;
  const filteredObjects = isAWSWorkspace
    ? mockWorkspaceObjects.filter((object) =>
        mockState.session.s3PrefixFilter
          ? object.key.startsWith(mockState.session.s3PrefixFilter)
          : true,
      )
    : [];
  const selectedS3ObjectKey =
    mockState.session.selectedS3ObjectKey ?? filteredObjects[0]?.key;
  const selectedAzureResourceGroup = isAzureWorkspace
    ? mockState.session.selectedAzureResourceGroup ?? mockAzureResourceGroups[0]?.name
    : undefined;
  const azureVirtualMachines = isAzureWorkspace && selectedAzureResourceGroup
    ? mockAzureVirtualMachines[selectedAzureResourceGroup as keyof typeof mockAzureVirtualMachines] ?? []
    : [];
  const selectedAzureVmId = isAzureWorkspace
    ? mockState.session.selectedAzureVmId ?? azureVirtualMachines[0]?.vmId
    : undefined;

  return {
    provider,
    profile,
    authMethod: mockState.session.selectedAuthMethod,
    runtimeSettings: mockState.settings,
    environmentDiagnostics: [
      { label: "Platform", value: "windows" },
      { label: "AWS Config", value: "C:/Users/Ali/.aws/config (available)" },
      { label: "AWS Credentials", value: "C:/Users/Ali/.aws/credentials (available)", sensitive: true },
      { label: "Azure Profile", value: "C:/Users/Ali/.azure/azureProfile.json (available)" },
      { label: "Local Config Directory", value: `${mockState.settings.localConfigDir} (available)` },
      { label: "Emulator State Directory", value: `${mockState.settings.emulatorStateDir} (available)` },
      { label: "AWS CLI", value: "C:/Program Files/Amazon/AWSCLIV2/aws.exe" },
      { label: "Write Policy", value: "Writes enabled for local endpoint profile" },
    ],
    dockerDiagnostics: {
      engineState: "available",
      summary: "Docker engine endpoint detected. Active container control is not wired into this slice yet.",
      contextName: "desktop-linux",
      host: "npipe:////./pipe/docker_engine",
      details: [
        { label: "Detection", value: "DOCKER_HOST" },
        { label: "Host", value: "npipe:////./pipe/docker_engine" },
        { label: "Context", value: "desktop-linux" },
      ],
    },
    dockerRuntime: {
      reachable: true,
      host: "npipe:////./pipe/docker_engine",
      hostSource: "DOCKER_HOST",
      contextName: "desktop-linux",
      serverVersion: "28.5.1",
      apiVersion: "1.51",
      operatingSystem: "Docker Desktop",
      architecture: "x86_64",
      engineName: "docker",
      resourceOwnership: {
        labelKey: "com.cloudsprocket.managed",
        labelValue: "true",
        projectLabelKey: "com.cloudsprocket.project",
        projectName: "cloud-sprocket",
        summary: "Only CloudSprocket-managed Docker resources are eligible for future lifecycle control.",
      },
      summary: "Docker engine is reachable and ready for managed runtime operations.",
      details: [
        { label: "Host Source", value: "DOCKER_HOST" },
        { label: "Host", value: "npipe:////./pipe/docker_engine" },
        { label: "Context", value: "desktop-linux" },
        { label: "Server Version", value: "28.5.1" },
        { label: "API Version", value: "1.51" },
        { label: "Operating System", value: "Docker Desktop" },
        { label: "Architecture", value: "x86_64" },
      ],
    },
    dockerResources: [
      {
        resourceId: "ctr-001",
        kind: "container",
        name: "cloudsprocket-localstack",
        state: "running",
        summary: "CloudSprocket-managed emulator container.",
        owned: true,
        details: [
          { label: "Image", value: mockState.settings.localStackImage },
          { label: "Status", value: "Up 10 seconds" },
        ],
      },
      {
        resourceId: "ctr-002",
        kind: "container",
        name: "cloudsprocket-floci-az",
        state: mockState.flociAzStatus === "running" ? "running" : "exited",
        summary: "CloudSprocket-managed Azure emulator container.",
        owned: true,
        details: [
          { label: "Image", value: mockState.settings.flociAzImage },
          { label: "Status", value: mockState.flociAzStatus === "running" ? "Up 10 seconds" : "Exited" },
        ],
      },
      {
        resourceId: "net-001",
        kind: "network",
        name: "cloudsprocket-net",
        state: "local",
        summary: "bridge network managed by CloudSprocket.",
        owned: true,
        details: [
          { label: "Driver", value: "bridge" },
          { label: "Scope", value: "local" },
        ],
      },
    ],
    emulatorSummaries: [
      {
        emulatorId: "localstack",
        providerId: "aws",
        label: "LocalStack",
        kind: "docker",
        status: mockState.localStackStatus,
        summary:
          mockState.localStackStatus === "running"
            ? "LocalStack is running at http://localhost:4566."
            : "LocalStack is ready to start after preparing the managed profile.",
        details: [
          { label: "Image", value: mockState.settings.localStackImage },
          { label: "Endpoint", value: "http://localhost:4566" },
          { label: "Managed Profile", value: "cloudsprocket-localstack" },
          { label: "Managed Config Root", value: "C:/Users/Ali/AppData/Local/CloudSprocket/local-config/aws" },
        ],
      },
      {
        emulatorId: "floci-az",
        providerId: "azure",
        label: "floci-az",
        kind: "docker",
        status: mockState.flociAzStatus,
        summary: mockState.flociAzStatus === "running"
          ? "floci-az is running at http://localhost:4577."
          : "floci-az is ready to start after preparing the managed env file.",
        details: [
          { label: "Image", value: mockState.settings.flociAzImage },
          { label: "Managed Config Root", value: "C:/Users/Ali/AppData/Local/CloudSprocket/local-config/azure" },
        ],
      },
    ],
    localConfigArtifacts: [
      {
        artifactId: "aws-local-config",
        providerId: "aws",
        label: "AWS Local Config",
        path: "C:/Users/Ali/AppData/Local/CloudSprocket/local-config/aws/config",
        status: "not-created",
        managed: true,
        summary: "App-managed AWS local profile configuration will be written here.",
      },
      {
        artifactId: "aws-local-credentials",
        providerId: "aws",
        label: "AWS Local Credentials",
        path: "C:/Users/Ali/AppData/Local/CloudSprocket/local-config/aws/credentials",
        status: "not-created",
        managed: true,
        summary: "App-managed AWS local dummy credentials will be written here.",
      },
      {
        artifactId: "azure-local-env",
        providerId: "azure",
        label: "Azure Local Env File",
        path: "C:/Users/Ali/AppData/Local/CloudSprocket/local-config/azure/floci-az.env",
        status: mockState.flociAzConfigReady ? "available" : "not-created",
        managed: true,
        summary: mockState.flociAzConfigReady
          ? "App-managed floci-az env file is prepared."
          : "App-managed Azure local connection strings and env values will be written here.",
      },
    ],
    awsEndpointUrl: isAWSWorkspace ? "http://192.168.50.168:4566" : undefined,
    awsWriteCapable: isAWSWorkspace && mockState.session.isLocked,
    awsWriteModeEnabled:
      isAWSWorkspace && mockState.session.isLocked && Boolean(mockState.session.awsWriteModeEnabled),
    awsWritesEnabled:
      isAWSWorkspace &&
      mockState.session.isLocked &&
      Boolean(mockState.session.awsWriteModeEnabled),
    azureEndpointUrl: isAzureWorkspace ? "http://localhost:4577" : undefined,
    azureWriteCapable: isAzureWorkspace && mockState.session.isLocked,
    azureWriteModeEnabled:
      isAzureWorkspace && mockState.session.isLocked && Boolean(mockState.session.azureWriteModeEnabled),
    azureWritesEnabled:
      isAzureWorkspace &&
      mockState.session.isLocked &&
      Boolean(mockState.session.azureWriteModeEnabled),
    selectedAzureResourceGroup,
    selectedAzureVmId,
    azureStatusMessage: isAzureWorkspace
      ? azureVirtualMachines.length > 0
        ? `Loaded ${azureVirtualMachines.length} Azure virtual machines from ${selectedAzureResourceGroup}.`
        : `No Azure virtual machines were returned for ${selectedAzureResourceGroup}.`
      : undefined,
    azureResourceGroups: isAzureWorkspace ? mockAzureResourceGroups : [],
    azureVirtualMachines: isAzureWorkspace ? azureVirtualMachines : [],
    selectedAzureStorageAccount: isAzureWorkspace
      ? mockState.session.selectedAzureStorageAccount ?? mockAzureStorageAccounts[0]?.name
      : undefined,
    selectedAzureBlobContainer: isAzureWorkspace
      ? mockState.session.selectedAzureBlobContainer ?? mockAzureBlobContainers[0]?.name
      : undefined,
    selectedAzureBlobName: isAzureWorkspace ? mockState.session.selectedAzureBlobName : undefined,
    azureBlobPrefixFilter: mockState.session.azureBlobPrefixFilter,
    azureStorageStatusMessage: isAzureWorkspace
      ? `Loaded ${mockAzureBlobs.length} blobs from ${mockState.session.selectedAzureStorageAccount ?? mockAzureStorageAccounts[0]?.name}/${mockState.session.selectedAzureBlobContainer ?? mockAzureBlobContainers[0]?.name}.`
      : undefined,
    azureStorageAccounts: isAzureWorkspace ? mockAzureStorageAccounts : [],
    azureBlobContainers: isAzureWorkspace ? mockAzureBlobContainers : [],
    azureBlobs: isAzureWorkspace ? mockAzureBlobs : [],
    azureBlobMetadata: isAzureWorkspace && mockState.session.selectedAzureBlobName
      ? [
          { label: "Name", value: mockState.session.selectedAzureBlobName },
          { label: "Size", value: "128 B" },
          { label: "Content Type", value: "text/plain" },
        ]
      : [],
    selectedAzureWebAppName: isAzureWorkspace
      ? mockState.session.selectedAzureWebAppName ?? mockAzureWebApps[0]?.name
      : undefined,
    selectedAzureWebAppSlot: isAzureWorkspace ? mockState.session.selectedAzureWebAppSlot : undefined,
    azureAppServiceStatusMessage: isAzureWorkspace
      ? `Loaded ${mockAzureWebApps.length} App Service web apps from ${selectedAzureResourceGroup}.`
      : undefined,
    azureWebApps: isAzureWorkspace ? mockAzureWebApps : [],
    azureWebAppActiveDetail:
      isAzureWorkspace && mockState.session.selectedAzureWebAppSlot
        ? {
            ...mockAzureWebApps[0],
            defaultHostName: `demo-app-${mockState.session.selectedAzureWebAppSlot}.azurewebsites.net`,
            state: "Running",
          }
        : isAzureWorkspace
          ? mockAzureWebApps[0]
          : undefined,
    azureAppServicePlans: isAzureWorkspace ? mockAzureAppServicePlans : [],
    azureWebAppSettings: isAzureWorkspace ? mockAzureWebAppSettings : [],
    azureWebAppDeploymentSlots:
      isAzureWorkspace && mockState.session.selectedAzureWebAppName
        ? mockAzureWebAppDeploymentSlots
        : isAzureWorkspace
          ? []
          : [],
    selectedAzureLogWorkspace: isAzureWorkspace
      ? mockState.session.selectedAzureLogWorkspace ?? mockAzureLogAnalyticsWorkspaces[0]?.name
      : undefined,
    azureLogAnalyticsStatusMessage: isAzureWorkspace
      ? `Loaded ${mockAzureLogAnalyticsWorkspaces.length} Log Analytics workspace(s). Local KQL is a subset of Azure KQL.`
      : undefined,
    azureLogAnalyticsWorkspaces: isAzureWorkspace ? mockAzureLogAnalyticsWorkspaces : [],
    selectedAzureWafPolicy: isAzureWorkspace
      ? mockState.session.selectedAzureWafPolicy ?? mockAzureWafPolicies[0]?.name
      : undefined,
    azureWafLogSchema: isAzureWorkspace ? mockAzureWafLogSchema : undefined,
    azureWafStatusMessage: isAzureWorkspace
      ? `Loaded ${mockAzureWafPolicies.length} Front Door WAF polic${mockAzureWafPolicies.length === 1 ? "y" : "ies"}.`
      : undefined,
    azureWafPolicies: isAzureWorkspace ? mockAzureWafPolicies : [],
    azureWafPolicyDetail: isAzureWorkspace ? mockAzureWafPolicyDetail : undefined,
    azureWafRuleFireCounts: isAzureWorkspace ? mockAzureWafRuleFireCounts : [],
    selectedAzureFunctionApp: isAzureWorkspace
      ? mockState.session.selectedAzureFunctionApp ?? mockAzureFunctionApps[0]?.name
      : undefined,
    selectedAzureFunction: isAzureWorkspace ? mockState.session.selectedAzureFunction : undefined,
    azureFunctionsStatusMessage: isAzureWorkspace
      ? `Loaded ${mockAzureFunctionApps.length} Function App(s).`
      : undefined,
    azureFunctionApps: isAzureWorkspace ? mockAzureFunctionApps : [],
    azureFunctions: isAzureWorkspace ? mockAzureFunctions : [],
    selectedAzureKeyVault: isAzureWorkspace
      ? mockState.session.selectedAzureKeyVault ?? mockAzureKeyVaults[0]?.name
      : undefined,
    selectedAzureSecret: isAzureWorkspace ? mockState.session.selectedAzureSecret : undefined,
    azureKeyVaultStatusMessage: isAzureWorkspace
      ? `Loaded ${mockAzureKeyVaults.length} Key Vault(s).`
      : undefined,
    azureKeyVaults: isAzureWorkspace ? mockAzureKeyVaults : [],
    azureKeyVaultSecrets: isAzureWorkspace ? mockAzureKeyVaultSecrets : [],
    selectedAzureCosmosAccount: isAzureWorkspace
      ? mockState.session.selectedAzureCosmosAccount ?? mockAzureCosmosAccounts[0]?.name
      : undefined,
    selectedAzureCosmosDatabase: isAzureWorkspace
      ? mockState.session.selectedAzureCosmosDatabase ?? mockAzureCosmosDatabases[0]?.name
      : undefined,
    selectedAzureCosmosContainer: isAzureWorkspace ? mockState.session.selectedAzureCosmosContainer : undefined,
    azureCosmosStatusMessage: isAzureWorkspace
      ? `Loaded ${mockAzureCosmosAccounts.length} Cosmos account(s).`
      : undefined,
    azureCosmosAccounts: isAzureWorkspace ? mockAzureCosmosAccounts : [],
    azureCosmosDatabases: isAzureWorkspace ? mockAzureCosmosDatabases : [],
    azureCosmosContainers: isAzureWorkspace ? mockAzureCosmosContainers : [],
    azureCosmosItems: isAzureWorkspace ? mockAzureCosmosItems : [],
    selectedAzurePostgresServer: isAzureWorkspace
      ? mockState.session.selectedAzurePostgresServer ?? mockAzurePostgresServers[0]?.name
      : undefined,
    azurePostgresStatusMessage: isAzureWorkspace
      ? `Loaded ${mockAzurePostgresServers.length} PostgreSQL server(s).`
      : undefined,
    azurePostgresServers: isAzureWorkspace ? mockAzurePostgresServers : [],
    azurePostgresConnection: isAzureWorkspace ? mockAzurePostgresConnection : undefined,
    selectedAzureFrontDoorProfile: isAzureWorkspace
      ? mockState.session.selectedAzureFrontDoorProfile ?? mockAzureFrontDoorProfiles[0]?.name
      : undefined,
    selectedAzureFrontDoorEndpoint: isAzureWorkspace
      ? mockState.session.selectedAzureFrontDoorEndpoint
      : undefined,
    selectedAzureFrontDoorOriginGroup: isAzureWorkspace
      ? mockState.session.selectedAzureFrontDoorOriginGroup
      : undefined,
    azureFrontDoorStatusMessage: isAzureWorkspace
      ? `Loaded ${mockAzureFrontDoorProfiles.length} Front Door profile(s).`
      : undefined,
    azureFrontDoorProfiles: isAzureWorkspace ? mockAzureFrontDoorProfiles : [],
    azureFrontDoorEndpoints: isAzureWorkspace ? mockAzureFrontDoorEndpoints : [],
    azureFrontDoorOriginGroups: isAzureWorkspace ? mockAzureFrontDoorOriginGroups : [],
    azureFrontDoorOrigins: isAzureWorkspace
      && mockState.session.selectedAzureFrontDoorOriginGroup
      ? mockAzureFrontDoorOrigins
      : isAzureWorkspace
        ? []
        : [],
    selectedAzureQueue: isAzureWorkspace ? mockState.session.selectedAzureQueue : undefined,
    azureQueuesStatusMessage: isAzureWorkspace
      ? `Loaded ${mockAzureStorageQueues.length} queue(s).`
      : undefined,
    azureStorageQueues: isAzureWorkspace ? mockAzureStorageQueues : [],
    azureQueueMessages: isAzureWorkspace && mockState.session.selectedAzureQueue ? mockAzureQueueMessages : [],
    azureEntraStatusMessage: isAzureWorkspace
      ? `Loaded ${mockAzureEntraUsers.length} user(s), ${mockAzureEntraGroups.length} group(s), ${mockAzureEntraApps.length} app registration(s).`
      : undefined,
    azureEntraUsers: isAzureWorkspace ? mockAzureEntraUsers : [],
    azureEntraGroups: isAzureWorkspace ? mockAzureEntraGroups : [],
    azureEntraApps: isAzureWorkspace ? mockAzureEntraApps : [],
    selectedS3BucketName,
    selectedS3ObjectKey,
    s3PrefixFilter: mockState.session.s3PrefixFilter,
    s3StatusMessage: isAWSWorkspace
      ? `Loaded ${filteredObjects.length} objects from ${selectedS3BucketName}.`
      : "S3 inventory is only available for open AWS workspaces.",
    s3Buckets: isAWSWorkspace ? mockWorkspaceBuckets : [],
    s3Objects: filteredObjects,
    s3ObjectMetadata: selectedS3ObjectKey
      ? mockWorkspaceObjectMetadata[selectedS3ObjectKey] ?? []
      : [],
    s3ExportSnippets: mockExportSnippets(selectedS3BucketName, selectedS3ObjectKey),
    selectedEc2Region: isAWSWorkspace ? mockState.session.selectedEc2Region ?? mockWorkspaceRegions[0] : undefined,
    selectedEc2InstanceId: isAWSWorkspace
      ? mockState.session.selectedEc2InstanceId ?? mockWorkspaceInstances[0]?.instanceId
      : undefined,
    ec2StatusMessage: isAWSWorkspace
      ? `Loaded ${mockWorkspaceInstances.length} EC2 instances from ${mockState.session.selectedEc2Region ?? mockWorkspaceRegions[0]}.`
      : "EC2 inventory is only available for open AWS workspaces.",
    ec2Regions: isAWSWorkspace ? mockWorkspaceRegions : [],
    ec2Instances: isAWSWorkspace ? mockWorkspaceInstances : [],
    selectedLambdaRegion: isAWSWorkspace ? mockState.session.selectedLambdaRegion ?? mockWorkspaceRegions[0] : undefined,
    selectedLambdaFunctionName: isAWSWorkspace ? mockState.session.selectedLambdaFunctionName ?? mockWorkspaceLambdaFunctions[0]?.functionName : undefined,
    lambdaStatusMessage: isAWSWorkspace
      ? `Loaded ${mockWorkspaceLambdaFunctions.length} Lambda functions from ${mockState.session.selectedLambdaRegion ?? mockWorkspaceRegions[0]}.`
      : "Lambda inventory is only available for open AWS workspaces.",
    lambdaRegions: isAWSWorkspace ? mockWorkspaceRegions : [],
    lambdaFunctions: isAWSWorkspace ? mockWorkspaceLambdaFunctions : [],
    selectedDynamodbRegion: isAWSWorkspace
      ? mockState.session.selectedDynamodbRegion ?? mockWorkspaceRegions[0]
      : undefined,
    selectedDynamodbTableName: isAWSWorkspace
      ? mockState.session.selectedDynamodbTableName ?? mockWorkspaceDynamoDBTables[0]?.tableName
      : undefined,
    dynamodbStatusMessage: isAWSWorkspace
      ? `Loaded ${mockWorkspaceDynamoDBTables.length} DynamoDB tables from ${mockState.session.selectedDynamodbRegion ?? mockWorkspaceRegions[0]}.`
      : "DynamoDB inventory is only available for open AWS workspaces.",
    dynamodbRegions: isAWSWorkspace ? mockWorkspaceRegions : [],
    dynamodbTables: isAWSWorkspace ? mockWorkspaceDynamoDBTables : [],
    selectedSqsRegion: isAWSWorkspace
      ? mockState.session.selectedSqsRegion ?? mockWorkspaceRegions[0]
      : undefined,
    selectedSqsQueueUrl: isAWSWorkspace
      ? mockState.session.selectedSqsQueueUrl ?? mockWorkspaceSQSQueues[0]?.queueUrl
      : undefined,
    sqsStatusMessage: isAWSWorkspace
      ? `Loaded ${mockWorkspaceSQSQueues.length} SQS queues from ${mockState.session.selectedSqsRegion ?? mockWorkspaceRegions[0]}.`
      : "SQS inventory is only available for open AWS workspaces.",
    sqsRegions: isAWSWorkspace ? mockWorkspaceRegions : [],
    sqsQueues: isAWSWorkspace ? mockWorkspaceSQSQueues : [],
    selectedSnsRegion: isAWSWorkspace
      ? mockState.session.selectedSnsRegion ?? mockWorkspaceRegions[0]
      : undefined,
    selectedSnsTopicArn: isAWSWorkspace
      ? mockState.session.selectedSnsTopicArn ?? mockWorkspaceSNSTopics[0]?.topicArn
      : undefined,
    snsStatusMessage: isAWSWorkspace
      ? `Loaded ${mockWorkspaceSNSTopics.length} SNS topics from ${mockState.session.selectedSnsRegion ?? mockWorkspaceRegions[0]}.`
      : "SNS inventory is only available for open AWS workspaces.",
    snsRegions: isAWSWorkspace ? mockWorkspaceRegions : [],
    snsTopics: isAWSWorkspace ? mockWorkspaceSNSTopics : [],
    selectedRdsRegion: isAWSWorkspace
      ? mockState.session.selectedRdsRegion ?? mockWorkspaceRegions[0]
      : undefined,
    selectedRdsInstanceId: isAWSWorkspace
      ? mockState.session.selectedRdsInstanceId ?? mockWorkspaceRDSInstances[0]?.dbInstanceIdentifier
      : undefined,
    rdsStatusMessage: isAWSWorkspace
      ? `Loaded ${mockWorkspaceRDSInstances.length} RDS instances from ${mockState.session.selectedRdsRegion ?? mockWorkspaceRegions[0]}.`
      : "RDS inventory is only available for open AWS workspaces.",
    rdsRegions: isAWSWorkspace ? mockWorkspaceRegions : [],
    rdsInstances: isAWSWorkspace ? mockWorkspaceRDSInstances : [],
    selectedEcsRegion: isAWSWorkspace
      ? mockState.session.selectedEcsRegion ?? mockWorkspaceRegions[0]
      : undefined,
    selectedEcsClusterArn: isAWSWorkspace
      ? mockState.session.selectedEcsClusterArn ?? mockWorkspaceECSClusters[0]?.clusterArn
      : undefined,
    selectedEcsServiceArn: isAWSWorkspace
      ? mockState.session.selectedEcsServiceArn ?? mockWorkspaceECSServices[0]?.serviceArn
      : undefined,
    selectedEcsTaskArn: isAWSWorkspace
      ? mockState.session.selectedEcsTaskArn ?? mockWorkspaceECSTasks[0]?.taskArn
      : undefined,
    ecsStatusMessage: isAWSWorkspace
      ? `Loaded ${mockWorkspaceECSClusters.length} ECS clusters from ${mockState.session.selectedEcsRegion ?? mockWorkspaceRegions[0]}.`
      : "ECS inventory is only available for open AWS workspaces.",
    ecsRegions: isAWSWorkspace ? mockWorkspaceRegions : [],
    ecsClusters: isAWSWorkspace ? mockWorkspaceECSClusters : [],
    ecsServices: isAWSWorkspace ? mockWorkspaceECSServices : [],
    ecsTasks: isAWSWorkspace ? mockWorkspaceECSTasks : [],
    selectedApiGatewayRegion: isAWSWorkspace
      ? mockState.session.selectedApiGatewayRegion ?? mockWorkspaceRegions[0]
      : undefined,
    selectedApiGatewayApiKey: isAWSWorkspace
      ? mockState.session.selectedApiGatewayApiKey ?? mockWorkspaceApiGatewayApis[0]?.apiKey
      : undefined,
    apiGatewayStatusMessage: isAWSWorkspace
      ? `Loaded ${mockWorkspaceApiGatewayApis.length} APIs from ${mockState.session.selectedApiGatewayRegion ?? mockWorkspaceRegions[0]}.`
      : "API Gateway inventory is only available for open AWS workspaces.",
    apiGatewayRegions: isAWSWorkspace ? mockWorkspaceRegions : [],
    apiGatewayApis: isAWSWorkspace ? mockWorkspaceApiGatewayApis : [],
    apiGatewayStages: isAWSWorkspace ? mockWorkspaceApiGatewayStages : [],
    selectedSecretsManagerRegion: isAWSWorkspace
      ? mockState.session.selectedSecretsManagerRegion ?? mockWorkspaceRegions[0]
      : undefined,
    selectedSecretsManagerName: isAWSWorkspace
      ? mockState.session.selectedSecretsManagerName ?? mockWorkspaceSecretsManagerSecrets[0]?.name
      : undefined,
    secretsManagerStatusMessage: isAWSWorkspace
      ? `Loaded ${mockWorkspaceSecretsManagerSecrets.length} secrets from ${mockState.session.selectedSecretsManagerRegion ?? mockWorkspaceRegions[0]}.`
      : "Secrets Manager inventory is only available for open AWS workspaces.",
    secretsManagerRegions: isAWSWorkspace ? mockWorkspaceRegions : [],
    secretsManagerSecrets: isAWSWorkspace ? mockWorkspaceSecretsManagerSecrets : [],
    selectedLogsRegion: isAWSWorkspace
      ? mockState.session.selectedLogsRegion ?? mockWorkspaceRegions[0]
      : undefined,
    selectedLogGroupName: isAWSWorkspace
      ? mockState.session.selectedLogGroupName ?? mockWorkspaceLogGroups[0]?.logGroupName
      : undefined,
    logsStatusMessage: isAWSWorkspace
      ? `Loaded ${mockWorkspaceLogGroups.length} log groups from ${mockState.session.selectedLogsRegion ?? mockWorkspaceRegions[0]}.`
      : "CloudWatch Logs inventory is only available for open AWS workspaces.",
    logsRegions: isAWSWorkspace ? mockWorkspaceRegions : [],
    logGroups: isAWSWorkspace ? mockWorkspaceLogGroups : [],
    selectedIamRoleName: isAWSWorkspace
      ? mockState.session.selectedIamRoleName ?? mockWorkspaceIAMRoles[0]?.roleName
      : undefined,
    iamStatusMessage: isAWSWorkspace
      ? `Loaded ${mockWorkspaceIAMRoles.length} IAM roles and ${mockWorkspaceIAMPolicies.length} customer-managed policies.`
      : "IAM inventory is only available for open AWS workspaces.",
    iamRoles: isAWSWorkspace ? mockWorkspaceIAMRoles : [],
    iamPolicies: isAWSWorkspace ? mockWorkspaceIAMPolicies : [],
  };
}

function handleMockRequest<T>(
  method: string,
  params: Record<string, unknown>,
): Promise<T> {
  switch (method) {
    case "providers.list":
      return Promise.resolve(
        mockState.providers.filter((provider) =>
          isProviderEnabled(mockPreferencesState(), provider.providerId),
        ) as T,
      );
    case "profiles.list":
      return Promise.resolve(filteredProfiles(params.providerId as string | undefined) as T);
    case "session.get":
      rebuildSessionDerivedState();
      return Promise.resolve(mockState.session as T);
    case "workspace.get":
      rebuildSessionDerivedState();
      return Promise.resolve(buildMockWorkspace() as T);
    case "aws.inventory.get":
      rebuildSessionDerivedState();
      return Promise.resolve(buildMockWorkspace() as T);
    case "azure.inventory.get":
      rebuildSessionDerivedState();
      return Promise.resolve(buildMockWorkspace() as T);
    case "runtime.get": {
      const workspace = buildMockWorkspace();
      return Promise.resolve({
        dockerRuntime: workspace.dockerRuntime,
        dockerResources: workspace.dockerResources,
        emulatorSummaries: workspace.emulatorSummaries,
        dockerDiagnostics: workspace.dockerDiagnostics,
      } as T);
    }
    case "docker.runtime.get":
      return Promise.resolve(buildMockWorkspace().dockerRuntime as T);
    case "docker.resources.list":
      return Promise.resolve(buildMockWorkspace().dockerResources as T);
    case "emulators.list":
      return Promise.resolve([
        {
          emulatorId: "localstack",
          providerId: "aws",
          label: "LocalStack",
          kind: "docker",
          status: "not-configured" as EmulatorStatus,
          summary: "Click Prepare Profile to set up LocalStack access.",
          details: [
            { label: "Image", value: mockState.settings.localStackImage },
            { label: "Port", value: "4566" },
            { label: "Managed Profile", value: "cloudsprocket-localstack" },
          ],
        },
        {
          emulatorId: "floci-az",
          providerId: "azure",
          label: "floci-az",
          kind: "docker",
          status: mockState.flociAzStatus,
          summary: mockState.flociAzStatus === "running"
            ? "floci-az is running at http://localhost:4577."
            : "Click Prepare Config to set up floci-az access.",
          details: [
            { label: "Image", value: mockState.settings.flociAzImage },
            { label: "Status", value: "Planned" },
          ],
        },
      ] as T);
    case "emulators.prepareProfile":
      if (params.emulatorId === "floci-az") {
        appendLog("info", "Preparing floci-az managed env file...");
        mockState.flociAzConfigReady = true;
        upsertMockProfile({
          providerId: "azure",
          profileId: "cloudsprocket-floci-az",
          displayName: "CloudSprocket floci-az (local)",
          summary: "Local Azure subscription targeting floci-az at http://localhost:4577.",
          sourcePaths: ["C:/Users/Ali/.azure/azureProfile.json"],
          attributes: [
            { label: "Subscription ID", value: "cloudsprocket-floci-az" },
            { label: "Endpoint", value: "http://localhost:4577" },
          ],
          authMethods: [
            { method: "cli", label: "CLI", summary: "Azure CLI available.", available: true },
            { method: "sso", label: "SSO", summary: "Provider-specific SSO not yet exposed.", available: false },
            { method: "local-files", label: "Local Files", summary: "Read-only profile data.", available: true },
          ],
        });
        return Promise.resolve({
          emulatorId: "floci-az",
          action: "prepareProfile",
          state: "succeeded",
          summary: "floci-az managed env file is prepared.",
          status: {
            emulatorId: "floci-az",
            providerId: "azure",
            label: "floci-az",
            kind: "docker",
            status: mockState.flociAzStatus,
            summary: "floci-az managed env file is prepared.",
            details: [],
          },
        } as T);
      }
      appendLog("info", "Preparing LocalStack managed profile...");
      upsertMockProfile({
        providerId: "aws",
        profileId: "cloudsprocket-localstack",
        displayName: "cloudsprocket-localstack",
        summary: "Local AWS profile targeting LocalStack at http://localhost:4566.",
        sourcePaths: ["C:/Users/Ali/.aws/config", "C:/Users/Ali/.aws/credentials"],
        attributes: [
          { label: "Region", value: "us-east-1" },
          { label: "Endpoint Url", value: "http://localhost:4566" },
          { label: "Cloudsprocket Allow Writes", value: "true" },
        ],
        authMethods: [
          { method: "cli", label: "CLI", summary: "AWS CLI detected.", available: true },
          { method: "sso", label: "SSO", summary: "No SSO metadata detected.", available: false },
          { method: "local-files", label: "Local Files", summary: "Read-only profile data.", available: true },
        ],
      });
      return Promise.resolve({
        emulatorId: "localstack",
        action: "prepareProfile",
        state: "succeeded",
        summary: "LocalStack managed profile is prepared.",
        status: {
          emulatorId: "localstack",
          providerId: "aws",
          label: "LocalStack",
          kind: "docker",
          status: mockState.localStackStatus,
          summary: "LocalStack managed profile is prepared.",
          details: [],
        },
      } as T);
    case "emulators.start":
      if (params.emulatorId === "floci-az") {
        mockState.flociAzStatus = "running";
        appendLog("success", "Started floci-az.");
        return Promise.resolve({
          emulatorId: "floci-az",
          action: "start",
          state: "succeeded",
          summary: "floci-az is running at http://localhost:4577.",
          status: {
            emulatorId: "floci-az",
            providerId: "azure",
            label: "floci-az",
            kind: "docker",
            status: "running",
            summary: "floci-az is running at http://localhost:4577.",
            details: [],
          },
        } as T);
      }
      mockState.localStackStatus = "running";
      appendLog("success", "Started LocalStack.");
      return Promise.resolve({
        emulatorId: "localstack",
        action: "start",
        state: "succeeded",
        summary: "LocalStack is running at http://localhost:4566.",
        status: {
          emulatorId: "localstack",
          providerId: "aws",
          label: "LocalStack",
          kind: "docker",
          status: "running",
          summary: "LocalStack is running at http://localhost:4566.",
          details: [],
        },
      } as T);
    case "emulators.stop":
      if (params.emulatorId === "floci-az") {
        mockState.flociAzStatus = "stopped";
        appendLog("info", "Stopped floci-az.");
        return Promise.resolve({
          emulatorId: "floci-az",
          action: "stop",
          state: "succeeded",
          summary: "floci-az container is present but not running.",
          status: {
            emulatorId: "floci-az",
            providerId: "azure",
            label: "floci-az",
            kind: "docker",
            status: "stopped",
            summary: "floci-az container is present but not running.",
            details: [],
          },
        } as T);
      }
      mockState.localStackStatus = "stopped";
      appendLog("info", "Stopped LocalStack.");
      return Promise.resolve({
        emulatorId: "localstack",
        action: "stop",
        state: "succeeded",
        summary: "LocalStack container is present but not running.",
        status: {
          emulatorId: "localstack",
          providerId: "aws",
          label: "LocalStack",
          kind: "docker",
          status: "stopped",
          summary: "LocalStack container is present but not running.",
          details: [],
        },
      } as T);
    case "emulators.logs":
      if (params.emulatorId === "floci-az") {
        return Promise.resolve({
          emulatorId: "floci-az",
          lines: mockState.flociAzStatus === "running"
            ? [
              "floci-az ready.",
              "Serving Azure APIs on http://0.0.0.0:4577.",
            ]
            : [],
          summary: mockState.flociAzStatus === "running"
            ? "Showing the latest 2 floci-az log lines."
            : "No managed floci-az container is running.",
        } as T);
      }
      return Promise.resolve({
        emulatorId: "localstack",
        lines: mockState.localStackStatus === "running"
          ? [
            "LocalStack supervisor started.",
            "Ready.",
            "Serving edge on http://0.0.0.0:4566.",
          ]
          : [],
        summary: mockState.localStackStatus === "running"
          ? "Showing the latest 3 LocalStack log lines."
          : "No managed LocalStack container is running.",
      } as T);
    case "aws.s3.selectBucket":
      mockState.session.selectedS3BucketName = String(params.bucketName ?? "");
      mockState.session.selectedS3ObjectKey = undefined;
      appendLog("info", `Selected S3 bucket ${params.bucketName}.`);
      return Promise.resolve(buildMockWorkspace() as T);
    case "aws.s3.selectObject":
      mockState.session.selectedS3ObjectKey = String(params.objectKey ?? "");
      appendLog("info", `Selected S3 object ${params.objectKey}.`);
      return Promise.resolve(buildMockWorkspace() as T);
    case "aws.s3.setPrefixFilter":
      mockState.session.s3PrefixFilter = String(params.prefix ?? "");
      mockState.session.selectedS3ObjectKey = undefined;
      appendLog("info", `Updated S3 prefix filter to ${params.prefix ?? ""}.`);
      return Promise.resolve(buildMockWorkspace() as T);
    case "aws.s3.uploadObject": {
      const objectKey = String(params.objectKey ?? "");
      const bucketName = mockState.session.selectedS3BucketName ?? mockWorkspaceBuckets[0]?.name;
      const job: JobStatus = {
        jobId: `job-${Date.now()}`,
        label: "S3 Upload",
        status: "queued",
        message: `Uploading ${params.sourcePath} to s3://${bucketName}/${objectKey}.`,
      };
      setTimeout(() => {
        mockState.session.selectedS3ObjectKey = objectKey;
        appendLog("success", `Uploaded ${objectKey} to s3://${bucketName}/${objectKey}.`);
        emitMockEvent("job.updated", {
          ...job,
          status: "completed",
          message: `Uploaded ${objectKey} to s3://${bucketName}/${objectKey}.`,
          completedAt: new Date().toISOString(),
          result: {
            bucketName,
            objectKey,
            destinationUri: `s3://${bucketName}/${objectKey}`,
          },
        });
      }, 30);
      return Promise.resolve(job as T);
    }
    case "aws.s3.presignObject": {
      const objectKey = mockState.session.selectedS3ObjectKey ?? mockWorkspaceObjects[0]?.key;
      const bucketName = mockState.session.selectedS3BucketName ?? mockWorkspaceBuckets[0]?.name;
      const durationSeconds = Number(params.durationSeconds ?? 3600);
      const job: JobStatus = {
        jobId: `job-${Date.now()}`,
        label: "S3 Signed URL",
        status: "queued",
        message: `Generating a signed URL for ${objectKey}.`,
      };
      setTimeout(() => {
        emitMockEvent("job.updated", {
          ...job,
          status: "completed",
          message: `Generated a signed URL for ${objectKey}.`,
          completedAt: new Date().toISOString(),
          result: {
            bucketName,
            objectKey,
            url: `https://${bucketName}.s3.amazonaws.com/${objectKey}?X-Amz-Signature=mock`,
            durationSeconds,
            expiresAt: new Date(Date.now() + durationSeconds * 1000).toISOString(),
            effectiveWarning:
              "If the profile uses temporary credentials, the URL can stop working before this nominal expiry.",
          },
        });
      }, 30);
      return Promise.resolve(job as T);
    }
    case "aws.s3.analyseUrl": {
      const url = String(params.url ?? "");
      let host = "Unavailable";
      try {
        host = new URL(url).host;
      } catch {
        host = "Invalid URL";
      }
      return Promise.resolve({
        summary: url.includes("X-Amz-Expires")
          ? "Nominal expiry is visible in the signed URL."
          : "This URL does not expose AWS presign expiry fields. Live validation is still available.",
        detailFields: [
          { label: "Host", value: host },
          { label: "Signature Type", value: url.includes("X-Amz-Expires") ? "AWS SigV4 presigned URL" : "No AWS presign expiry fields detected" },
        ],
      } as T);
    }
    case "aws.s3.validateUrl": {
      const url = String(params.url ?? "");
      const job: JobStatus = {
        jobId: `job-${Date.now()}`,
        label: "S3 URL Validation",
        status: "queued",
        message: "Validating the pasted URL.",
      };
      setTimeout(() => {
        emitMockEvent("job.updated", {
          ...job,
          status: "completed",
          message: "Live validation succeeded with HTTP 206.",
          completedAt: new Date().toISOString(),
          result: {
            url,
            succeeded: true,
            summary: "Live validation succeeded with HTTP 206.",
            detailFields: [
              { label: "HTTP Status", value: "206 Partial Content" },
              { label: "Content Type", value: "application/octet-stream" },
            ],
          },
        });
      }, 30);
      return Promise.resolve(job as T);
    }
    case "aws.ec2.selectRegion":
      mockState.session.selectedEc2Region = String(params.region ?? "");
      mockState.session.selectedEc2InstanceId = undefined;
      appendLog("info", `Selected EC2 region ${params.region}.`);
      return Promise.resolve(buildMockWorkspace() as T);
    case "aws.ec2.selectInstance":
      mockState.session.selectedEc2InstanceId = String(params.instanceId ?? "");
      appendLog("info", `Selected EC2 instance ${params.instanceId}.`);
      return Promise.resolve(buildMockWorkspace() as T);
    case "aws.ec2.invokeAction": {
      const action = String(params.action ?? "");
      const instanceId =
        String(params.instanceId ?? "") ||
        mockState.session.selectedEc2InstanceId ||
        mockWorkspaceInstances[0]?.instanceId;
      const region = mockState.session.selectedEc2Region ?? mockWorkspaceRegions[0];
      const job: JobStatus = {
        jobId: `job-${Date.now()}`,
        label: "EC2 Action",
        status: "queued",
        message: `Queueing EC2 ${action} for ${instanceId} in ${region}.`,
      };
      setTimeout(() => {
        appendLog("success", `Requested EC2 ${action} for ${instanceId} in ${region}.`);
        emitMockEvent("job.updated", {
          ...job,
          status: "completed",
          message: `Requested EC2 ${action} for ${instanceId}.`,
          completedAt: new Date().toISOString(),
        });
      }, 30);
      return Promise.resolve(job as T);
    }
    case "aws.dynamodb.selectRegion":
      mockState.session.selectedDynamodbRegion = String(params.region ?? "");
      mockState.session.selectedDynamodbTableName = undefined;
      appendLog("info", `Selected DynamoDB region ${params.region}.`);
      return Promise.resolve(buildMockWorkspace() as T);
    case "aws.dynamodb.selectTable":
      mockState.session.selectedDynamodbTableName = String(params.tableName ?? "");
      appendLog("info", `Selected DynamoDB table ${params.tableName}.`);
      return Promise.resolve(buildMockWorkspace() as T);
    case "aws.sqs.selectRegion":
      mockState.session.selectedSqsRegion = String(params.region ?? "");
      mockState.session.selectedSqsQueueUrl = undefined;
      appendLog("info", `Selected SQS region ${params.region}.`);
      return Promise.resolve(buildMockWorkspace() as T);
    case "aws.sqs.selectQueue":
      mockState.session.selectedSqsQueueUrl = String(params.queueUrl ?? "");
      appendLog("info", `Selected SQS queue ${params.queueUrl}.`);
      return Promise.resolve(buildMockWorkspace() as T);
    case "aws.sqs.peek": {
      const queueUrl = String(params.queueUrl ?? mockState.session.selectedSqsQueueUrl ?? "");
      const queue =
        mockWorkspaceSQSQueues.find((candidate) => candidate.queueUrl === queueUrl) ??
        mockWorkspaceSQSQueues[0];
      return Promise.resolve({
        queueUrl: queue.queueUrl,
        summary: "Peeked 1 messages without deleting them.",
        messages: [
          {
            messageId: "mock-msg-001",
            body: JSON.stringify({ orderId: "ord-001", status: "pending" }),
            sentTimestamp: 1718452800,
            approximateReceiveCount: 1,
          },
        ],
      } as T);
    }
    case "aws.sqs.sendMessage":
      return Promise.resolve({
        queueUrl: String(params.queueUrl ?? ""),
        messageId: "mock-sent-001",
        summary: "Sent message mock-sent-001 to the queue.",
      } as T);
    case "aws.sqs.createQueue": {
      const queueName = String(params.queueName ?? "new-queue");
      mockWorkspaceSQSQueues.push({
        queueName,
        queueUrl: `http://localhost:4566/000000000000/${queueName}`,
        approximateNumberOfMessages: 0,
        approximateNumberOfMessagesNotVisible: 0,
        approximateNumberOfMessagesDelayed: 0,
        visibilityTimeout: 30,
        createdTimestamp: Math.floor(Date.now() / 1000),
        queueArn: `arn:aws:sqs:us-east-1:000000000000:${queueName}`,
        receiveMessageWaitTimeSeconds: 0,
      });
      mockState.session.selectedSqsQueueUrl = `http://localhost:4566/000000000000/${queueName}`;
      appendLog("success", `Created SQS queue ${queueName}.`);
      return Promise.resolve(buildMockWorkspace() as T);
    }
    case "aws.sns.selectRegion":
      mockState.session.selectedSnsRegion = String(params.region ?? "");
      mockState.session.selectedSnsTopicArn = undefined;
      appendLog("info", `Selected SNS region ${params.region}.`);
      return Promise.resolve(buildMockWorkspace() as T);
    case "aws.sns.selectTopic":
      mockState.session.selectedSnsTopicArn = String(params.topicArn ?? "");
      appendLog("info", `Selected SNS topic ${params.topicArn}.`);
      return Promise.resolve(buildMockWorkspace() as T);
    case "aws.sns.publish":
      return Promise.resolve({
        topicArn: String(params.topicArn ?? ""),
        messageId: "mock-publish-001",
        summary: "Published message mock-publish-001 to the topic.",
      } as T);
    case "aws.sns.createTopic": {
      const topicName = String(params.topicName ?? "new-topic");
      const topicArn = `arn:aws:sns:eu-west-1:000000000000:${topicName}`;
      mockWorkspaceSNSTopics.push({
        topicArn,
        topicName,
        displayName: topicName,
        subscriptionsConfirmed: "0",
        subscriptionsPending: "0",
        subscriptions: [],
      });
      mockState.session.selectedSnsTopicArn = topicArn;
      appendLog("success", `Created SNS topic ${topicName}.`);
      return Promise.resolve(buildMockWorkspace() as T);
    }
    case "aws.dynamodb.putItem":
    case "aws.dynamodb.deleteItem":
      appendLog("success", String(params.tableName ?? "table") + " updated.");
      return Promise.resolve(buildMockWorkspace() as T);
    case "aws.rds.selectRegion":
      mockState.session.selectedRdsRegion = String(params.region ?? "");
      mockState.session.selectedRdsInstanceId = undefined;
      appendLog("info", `Selected RDS region ${params.region}.`);
      return Promise.resolve(buildMockWorkspace() as T);
    case "aws.rds.selectInstance":
      mockState.session.selectedRdsInstanceId = String(params.instanceId ?? "");
      appendLog("info", `Selected RDS instance ${params.instanceId}.`);
      return Promise.resolve(buildMockWorkspace() as T);
    case "aws.ecs.selectRegion":
      mockState.session.selectedEcsRegion = String(params.region ?? "");
      mockState.session.selectedEcsClusterArn = undefined;
      mockState.session.selectedEcsServiceArn = undefined;
      mockState.session.selectedEcsTaskArn = undefined;
      appendLog("info", `Selected ECS region ${params.region}.`);
      return Promise.resolve(buildMockWorkspace() as T);
    case "aws.ecs.selectCluster":
      mockState.session.selectedEcsClusterArn = String(params.clusterArn ?? "");
      mockState.session.selectedEcsServiceArn = undefined;
      mockState.session.selectedEcsTaskArn = undefined;
      appendLog("info", `Selected ECS cluster ${params.clusterArn}.`);
      return Promise.resolve(buildMockWorkspace() as T);
    case "aws.ecs.selectService":
      mockState.session.selectedEcsServiceArn = String(params.serviceArn ?? "");
      mockState.session.selectedEcsTaskArn = undefined;
      appendLog("info", `Selected ECS service ${params.serviceArn}.`);
      return Promise.resolve(buildMockWorkspace() as T);
    case "aws.ecs.selectTask":
      mockState.session.selectedEcsTaskArn = String(params.taskArn ?? "");
      appendLog("info", `Selected ECS task ${params.taskArn}.`);
      return Promise.resolve(buildMockWorkspace() as T);
    case "aws.apigateway.selectRegion":
      mockState.session.selectedApiGatewayRegion = String(params.region ?? "");
      mockState.session.selectedApiGatewayApiKey = undefined;
      appendLog("info", `Selected API Gateway region ${params.region}.`);
      return Promise.resolve(buildMockWorkspace() as T);
    case "aws.apigateway.selectApi":
      mockState.session.selectedApiGatewayApiKey = String(params.apiKey ?? "");
      appendLog("info", `Selected API Gateway API ${params.apiKey}.`);
      return Promise.resolve(buildMockWorkspace() as T);
    case "aws.secrets.selectRegion":
      mockState.session.selectedSecretsManagerRegion = String(params.region ?? "");
      mockState.session.selectedSecretsManagerName = undefined;
      appendLog("info", `Selected Secrets Manager region ${params.region}.`);
      return Promise.resolve(buildMockWorkspace() as T);
    case "aws.secrets.selectSecret":
      mockState.session.selectedSecretsManagerName = String(params.secretName ?? "");
      appendLog("info", `Selected secret ${params.secretName}.`);
      return Promise.resolve(buildMockWorkspace() as T);
    case "aws.secrets.reveal": {
      const secretName = String(params.secretName ?? "");
      const mockValues: Record<string, string> = {
        "cloudsprocket/db-password": "postgres://app:local-dev@localhost:5432/cloudsprocket",
        "cloudsprocket/api-key": "mock-api-key-12345",
      };
      if (!mockState.session.awsWriteModeEnabled) {
        return Promise.reject(new Error("Turn on write mode from the top bar to reveal secret values."));
      }
      return Promise.resolve({ value: mockValues[secretName] ?? "mock-secret-value" } as T);
    }
    case "aws.logs.selectRegion":
      mockState.session.selectedLogsRegion = String(params.region ?? "");
      mockState.session.selectedLogGroupName = undefined;
      appendLog("info", `Selected CloudWatch Logs region ${params.region}.`);
      return Promise.resolve(buildMockWorkspace() as T);
    case "aws.logs.selectLogGroup":
      mockState.session.selectedLogGroupName = String(params.logGroupName ?? "");
      appendLog("info", `Selected log group ${params.logGroupName}.`);
      return Promise.resolve(buildMockWorkspace() as T);
    case "aws.iam.selectRole":
      mockState.session.selectedIamRoleName = String(params.roleName ?? "");
      appendLog("info", `Selected IAM role ${params.roleName}.`);
      return Promise.resolve(buildMockWorkspace() as T);
    case "aws.lambda.selectRegion":
      mockState.session.selectedLambdaRegion = String(params.region ?? "");
      mockState.session.selectedLambdaFunctionName = undefined;
      appendLog("info", `Selected Lambda region ${params.region}.`);
      return Promise.resolve(buildMockWorkspace() as T);
    case "aws.lambda.selectFunction":
      mockState.session.selectedLambdaFunctionName = String(params.functionName ?? "");
      appendLog("info", `Selected Lambda function ${params.functionName}.`);
      return Promise.resolve(buildMockWorkspace() as T);
    case "aws.lambda.describe": {
      const name = String(params.functionName ?? mockState.session.selectedLambdaFunctionName ?? "");
      const fn = mockWorkspaceLambdaFunctions.find((f) => f.functionName === name) || mockWorkspaceLambdaFunctions[0];
      return Promise.resolve((fn || {}) as T);
    }
    case "aws.lambda.invoke": {
      const name = String(params.functionName ?? "");
      const payload = params.payload ? JSON.stringify(params.payload) : "{}";
      const result: AwsLambdaInvokeResult = {
        statusCode: 200,
        executedVersion: "$LATEST",
        logResult: "START RequestId: mock-123\nEND RequestId: mock-123\nREPORT ...",
        payload: `{"echoed": ${payload}}`,
      };
      appendLog("success", `Invoked Lambda ${name} (mock).`);
      return Promise.resolve(result as T);
    }
    case "aws.lambda.create": {
      const functionName = String(params.functionName ?? "").trim();
      const runtime = String(params.runtime ?? "nodejs20.x");
      const memorySize = Number(params.memorySize ?? 128);
      const timeout = Number(params.timeout ?? 30);
      const handler = String(params.handler ?? "index.handler");
      const description = String(params.description ?? "");
      const handlerSource = String(params.handlerSource ?? "").trim();
      const zipSourcePath = String(params.zipSourcePath ?? "").trim();
      if (!functionName) {
        return Promise.reject(new Error("function name is required"));
      }
      if (handlerSource && zipSourcePath) {
        return Promise.reject(new Error("provide either inline handler source or a zip file, not both"));
      }
      if (zipSourcePath && !handler) {
        return Promise.reject(new Error("handler is required when using a zip file"));
      }
      if (mockWorkspaceLambdaFunctions.some((fn) => fn.functionName === functionName)) {
        return Promise.reject(new Error(`function ${functionName} already exists`));
      }
      mockWorkspaceLambdaFunctions.push({
        functionName,
        runtime,
        memorySize,
        timeout,
        handler,
        description: description || "",
        state: "Active",
        lastModified: new Date().toISOString(),
        logGroup: `/aws/lambda/${functionName}`,
        recentLogs: [],
      });
      mockWorkspaceLambdaFunctions.sort((a, b) => a.functionName.localeCompare(b.functionName));
      mockState.session.selectedLambdaFunctionName = functionName;
      appendLog("success", `Created Lambda function ${functionName} (mock).`);
      return Promise.resolve(buildMockWorkspace() as T);
    }
    case "azure.selectResourceGroup":
      mockState.session.selectedAzureResourceGroup = String(params.resourceGroup ?? "");
      mockState.session.selectedAzureVmId = undefined;
      appendLog("info", `Selected Azure resource group ${params.resourceGroup}.`);
      return Promise.resolve(buildMockWorkspace() as T);
    case "azure.selectVirtualMachine":
      mockState.session.selectedAzureVmId = String(params.vmId ?? "");
      appendLog("info", `Selected Azure virtual machine ${params.vmId}.`);
      return Promise.resolve(buildMockWorkspace() as T);
    case "azure.resourceGroups.create": {
      const name = String(params.name ?? "").trim();
      if (!name) {
        return Promise.reject(new Error("resource group name is required"));
      }
      if (!mockState.session.azureWriteModeEnabled) {
        return Promise.reject(new Error("resource group create requires write mode to be enabled for this Azure workspace"));
      }
      mockAzureResourceGroups.push({
        name,
        location: String(params.location ?? "westeurope"),
        provisioningState: "Succeeded",
        managedBy: "",
        tags: [],
      });
      mockState.session.selectedAzureResourceGroup = name;
      mockState.session.selectedAzureVmId = undefined;
      appendLog("success", `Created Azure resource group ${name} (mock).`);
      return Promise.resolve(buildMockWorkspace() as T);
    }
    case "azure.bastion.list":
      return Promise.resolve({
        hosts: mockAzureBastionHosts,
        statusMessage: `Loaded ${mockAzureBastionHosts.length} Bastion host(s) (mock).`,
      } as T);
    case "azure.bastion.connect": {
      const bastionName = String(params.bastionName ?? "");
      const bastionResourceGroup = String(params.bastionResourceGroup ?? "");
      const vmId = String(params.vmId ?? "");
      const username = String(params.username ?? "azureuser");
      const authType = String(params.authType ?? "password");
      const sshKeyPath = String(params.sshKeyPath ?? "");
      const launch = Boolean(params.launch);
      const resourceGroup = mockState.session.selectedAzureResourceGroup ?? mockAzureResourceGroups[0]?.name;
      const vms = resourceGroup
        ? mockAzureVirtualMachines[resourceGroup as keyof typeof mockAzureVirtualMachines] ?? []
        : [];
      const vm = vms.find((entry) => entry.vmId === vmId) ?? vms[0];
      if (!bastionName || !bastionResourceGroup) {
        return Promise.reject(new Error("select a Bastion host before connecting"));
      }
      if (!vm?.vmId) {
        return Promise.reject(new Error("select a virtual machine before connecting via Bastion"));
      }
      const isWindows = String(vm.osType ?? "").toLowerCase() === "windows";
      const protocol = isWindows ? "rdp" : "ssh";
      const args = isWindows
        ? [
            "network",
            "bastion",
            "rdp",
            "--name",
            bastionName,
            "--resource-group",
            bastionResourceGroup,
            "--target-resource-id",
            vm.vmId,
          ]
        : [
            "network",
            "bastion",
            "ssh",
            "--name",
            bastionName,
            "--resource-group",
            bastionResourceGroup,
            "--target-resource-id",
            vm.vmId,
            "--auth-type",
            authType,
            ...(authType === "ssh-key"
              ? ["--username", username, "--ssh-key", sshKeyPath]
              : authType === "password"
                ? ["--username", username]
                : []),
          ];
      const command = `az ${args.join(" ")}`;
      if (launch) {
        appendLog("success", `Launched Bastion ${protocol} session to ${vm.name} (mock).`);
      } else {
        appendLog("success", `Built Bastion ${protocol} command for ${vm.name} (mock).`);
      }
      return Promise.resolve({
        command,
        launched: launch,
        protocol,
      } as T);
    }
    case "azure.virtualMachines.invokeAction": {
      if (!mockState.session.azureWriteModeEnabled) {
        return Promise.reject(new Error("virtual machine actions require write mode to be enabled for this Azure workspace"));
      }
      const vmId = String(params.vmId ?? "");
      const action = String(params.action ?? "");
      const resourceGroup = mockState.session.selectedAzureResourceGroup ?? mockAzureResourceGroups[0]?.name;
      const vms = resourceGroup
        ? mockAzureVirtualMachines[resourceGroup as keyof typeof mockAzureVirtualMachines] ?? []
        : [];
      const vm = vms.find((entry) => entry.vmId === vmId);
      if (vm) {
        if (action === "start") {
          vm.powerState = "VM running";
        } else if (action === "powerOff" || action === "deallocate") {
          vm.powerState = action === "deallocate" ? "VM deallocated" : "VM stopped";
        }
      }
      appendLog("success", `Invoked ${action} on Azure virtual machine ${vm?.name ?? vmId} (mock).`);
      return Promise.resolve(buildMockWorkspace() as T);
    }
    case "azure.webApps.select":
      mockState.session.selectedAzureWebAppName = String(params.appName ?? "");
      mockState.session.selectedAzureWebAppSlot = "";
      return Promise.resolve(buildMockWorkspace() as T);
    case "azure.webApps.selectSlot":
      mockState.session.selectedAzureWebAppSlot = String(params.slot ?? "");
      return Promise.resolve(buildMockWorkspace() as T);
    case "azure.webApps.createSlot": {
      if (!mockState.session.azureWriteModeEnabled) {
        return Promise.reject(
          new Error("deployment slot create requires write mode to be enabled for this Azure workspace"),
        );
      }
      const slotName = String(params.slotName ?? "").trim();
      if (!slotName) {
        return Promise.reject(new Error("a deployment slot name is required"));
      }
      if (!mockAzureWebAppDeploymentSlots.some((slot) => slot.name === slotName)) {
        mockAzureWebAppDeploymentSlots.push({
          name: slotName,
          status: "Ready",
          defaultHostName: `demo-app-${slotName}.azurewebsites.net`,
          trafficPercent: 0,
        });
      }
      mockState.session.selectedAzureWebAppSlot = slotName;
      appendLog("success", `Created deployment slot ${slotName} (mock).`);
      return Promise.resolve(buildMockWorkspace() as T);
    }
    case "azure.webApps.swapSlots": {
      if (!mockState.session.azureWriteModeEnabled) {
        return Promise.reject(
          new Error("deployment slot swap requires write mode to be enabled for this Azure workspace"),
        );
      }
      const slotName = String(params.slotName ?? "").trim();
      if (!slotName) {
        return Promise.reject(new Error("select a non-production deployment slot before swapping"));
      }
      mockState.session.selectedAzureWebAppSlot = "";
      appendLog("success", `Swapped production with deployment slot ${slotName} (mock).`);
      return Promise.resolve(buildMockWorkspace() as T);
    }
    case "azure.webApps.setSetting": {
      if (!mockState.session.azureWriteModeEnabled) {
        return Promise.reject(
          new Error("updating app settings requires write mode to be enabled for this Azure workspace"),
        );
      }
      const name = String(params.name ?? "").trim();
      const value = String(params.value ?? "");
      const slotSetting = Boolean(params.slotSetting);
      const existing = mockAzureWebAppSettings.find((entry) => entry.name === name);
      if (existing) {
        existing.value = value;
        existing.slotSetting = slotSetting;
      } else {
        mockAzureWebAppSettings.push({ name, value, slotSetting });
      }
      mockAzureWebAppSettings.sort((left, right) => left.name.localeCompare(right.name));
      appendLog("success", `Set application setting ${name} (mock).`);
      return Promise.resolve(buildMockWorkspace() as T);
    }
    case "azure.webApps.deleteSetting": {
      if (!mockState.session.azureWriteModeEnabled) {
        return Promise.reject(
          new Error("deleting app settings requires write mode to be enabled for this Azure workspace"),
        );
      }
      const name = String(params.name ?? "").trim();
      const index = mockAzureWebAppSettings.findIndex((entry) => entry.name === name);
      if (index >= 0) {
        mockAzureWebAppSettings.splice(index, 1);
      }
      appendLog("success", `Deleted application setting ${name} (mock).`);
      return Promise.resolve(buildMockWorkspace() as T);
    }
    case "azure.webApps.invokeAction": {
      if (!mockState.session.azureWriteModeEnabled) {
        return Promise.reject(
          new Error("web app actions require write mode to be enabled for this Azure workspace"),
        );
      }
      const action = String(params.action ?? "");
      const appName = String(params.appName ?? mockState.session.selectedAzureWebAppName ?? "");
      const app = mockAzureWebApps.find((entry) => entry.name === appName);
      if (app) {
        if (action === "start") {
          app.state = "Running";
        } else if (action === "stop") {
          app.state = "Stopped";
        }
      }
      appendLog("success", `Invoked ${action} on App Service web app ${appName} (mock).`);
      return Promise.resolve(buildMockWorkspace() as T);
    }
    case "azure.logAnalytics.selectWorkspace":
      mockState.session.selectedAzureLogWorkspace = String(params.workspace ?? "");
      return Promise.resolve({ workspace: mockState.session.selectedAzureLogWorkspace } as T);
    case "azure.logAnalytics.query": {
      const queryText = String(params.query ?? "");
      const workspaceName = String(params.workspace ?? mockState.session.selectedAzureLogWorkspace ?? "");
      appendLog("success", `Ran Log Analytics query (mock): ${queryText.slice(0, 40)}`);
      if (workspaceName && queryText.trim()) {
        const history = mockLogAnalyticsHistory[workspaceName] ?? [];
        mockLogAnalyticsHistory[workspaceName] = [
          { query: queryText, timespan: String(params.timespan ?? ""), ranAt: new Date().toISOString() },
          ...history.filter((entry) => entry.query !== queryText).slice(0, 49),
        ];
      }
      return Promise.resolve({
        columns: [
          "TimeGenerated",
          "action_s",
          "ruleName_s",
          "trackingReference_s",
          "details_matches_s",
        ],
        rows: [
          [
            "2026-06-21T10:00:00Z",
            "Block",
            "Microsoft_DefaultRuleSet-2.1-SQLI-942100",
            "20260619T211623Z-abc123",
            '{"matches":[{"matchVariableName":"QueryParamValue:q","matchVariableValue":"\' or 1=1"}]}',
          ],
          [
            "2026-06-21T10:01:00Z",
            "Log",
            "Microsoft_DefaultRuleSet-2.1-XSS-941320",
            "20260619T211700Z-def456",
            '{"matches":[{"matchVariableName":"RequestHeader:User-Agent","matchVariableValue":"sqlmap"}]}',
          ],
        ],
        durationMs: 142,
        truncated: false,
      } as T);
    }
    case "azure.logAnalytics.history.list": {
      const workspaceName = String(params.workspace ?? "");
      return Promise.resolve((mockLogAnalyticsHistory[workspaceName] ?? []) as T);
    }
    case "azure.logAnalytics.saved.list": {
      const workspaceName = String(params.workspace ?? "");
      return Promise.resolve((mockLogAnalyticsSaved[workspaceName] ?? []) as T);
    }
    case "azure.logAnalytics.saved.save": {
      const workspaceName = String(params.workspace ?? "");
      const name = String(params.name ?? "").trim();
      const queryText = String(params.query ?? "").trim();
      const id = String(params.id ?? `saved-${Date.now()}`);
      const entry = {
        id,
        name,
        query: queryText,
        timespan: String(params.timespan ?? ""),
      };
      const saved = mockLogAnalyticsSaved[workspaceName] ?? [];
      const updated = saved.some((item) => item.id === id)
        ? saved.map((item) => (item.id === id ? entry : item))
        : [...saved, entry];
      mockLogAnalyticsSaved[workspaceName] = updated;
      return Promise.resolve(entry as T);
    }
    case "azure.logAnalytics.saved.delete": {
      const workspaceName = String(params.workspace ?? "");
      const id = String(params.id ?? "");
      mockLogAnalyticsSaved[workspaceName] = (mockLogAnalyticsSaved[workspaceName] ?? []).filter(
        (item) => item.id !== id,
      );
      return Promise.resolve({ deleted: true } as T);
    }
    case "azure.logAnalytics.tables.list":
      return Promise.resolve([
        { name: "AzureDiagnostics", columns: ["TimeGenerated", "Category", "action_s"] },
        { name: "AppEvents", columns: ["TimeGenerated", "Level", "Message"] },
        { name: "Heartbeat", columns: ["TimeGenerated", "Category"] },
      ] as T);
    case "azure.waf.logs.schema":
      return Promise.resolve(mockAzureWafLogSchema as T);
    case "azure.waf.refresh":
      return Promise.resolve(buildMockWorkspace() as T);
    case "azure.waf.selectPolicy":
      mockState.session.selectedAzureWafPolicy = String(params.policyName ?? "");
      return Promise.resolve(buildMockWorkspace() as T);
    case "azure.waf.config.setMode": {
      if (!mockState.session.azureWriteModeEnabled) {
        return Promise.reject(new Error("enable Azure write mode before applying WAF changes"));
      }
      const mode = String(params.mode ?? "");
      mockAzureWafPolicyDetail.mode = mode;
      const policy = mockAzureWafPolicies.find((item) => item.name === mockAzureWafPolicyDetail.name);
      if (policy) policy.mode = mode;
      appendLog("success", `Updated WAF policy mode to ${mode} (mock).`);
      return Promise.resolve(buildMockWorkspace() as T);
    }
    case "azure.waf.config.setManagedRule": {
      if (!mockState.session.azureWriteModeEnabled) {
        return Promise.reject(new Error("enable Azure write mode before applying WAF changes"));
      }
      const ruleId = String(params.ruleId ?? "");
      const enabled = Boolean(params.enabled);
      const override = mockAzureWafPolicyDetail.managedRuleOverrides.find((item) => item.ruleId === ruleId);
      if (override) override.enabled = enabled;
      appendLog("success", `${enabled ? "Enabled" : "Disabled"} WAF rule ${ruleId} (mock).`);
      return Promise.resolve(buildMockWorkspace() as T);
    }
    case "azure.waf.config.removeExclusion": {
      if (!mockState.session.azureWriteModeEnabled) {
        return Promise.reject(new Error("enable Azure write mode before applying WAF changes"));
      }
      const exclusion = params.exclusion as {
        matchVariable?: string;
        selectorMatchOperator?: string;
        selector?: string;
      };
      mockAzureWafPolicyDetail.exclusions = mockAzureWafPolicyDetail.exclusions.filter(
        (item) =>
          !(
            item.matchVariable === exclusion?.matchVariable &&
            item.selectorMatchOperator === exclusion?.selectorMatchOperator &&
            item.selector === exclusion?.selector
          ),
      );
      appendLog("success", "Removed WAF exclusion (mock).");
      return Promise.resolve(buildMockWorkspace() as T);
    }
    case "azure.waf.config.addExclusion": {
      if (!mockState.session.azureWriteModeEnabled) {
        return Promise.reject(new Error("enable Azure write mode before applying WAF changes"));
      }
      const exclusion = params.exclusion as {
        matchVariable?: string;
        selectorMatchOperator?: string;
        selector?: string;
      };
      if (exclusion?.matchVariable) {
        mockAzureWafPolicyDetail.exclusions.push({
          matchVariable: exclusion.matchVariable,
          selectorMatchOperator: exclusion.selectorMatchOperator ?? "Equals",
          selector: exclusion.selector ?? "",
        });
      }
      appendLog("success", "Added WAF exclusion (mock).");
      return Promise.resolve(buildMockWorkspace() as T);
    }
    case "azure.functions.selectApp":
      mockState.session.selectedAzureFunctionApp = String(params.appName ?? "");
      mockState.session.selectedAzureFunction = "";
      return Promise.resolve(buildMockWorkspace() as T);
    case "azure.functions.selectFunction":
      mockState.session.selectedAzureFunction = String(params.functionName ?? "");
      return Promise.resolve(buildMockWorkspace() as T);
    case "azure.functions.invoke": {
      if (!mockState.session.azureWriteModeEnabled) {
        return Promise.reject(new Error("invoking a function requires write mode to be enabled for this Azure workspace"));
      }
      appendLog("success", `Invoked Azure function ${String(params.functionName ?? "")} (mock).`);
      return Promise.resolve({ statusCode: 200, body: '{"ok":true}' } as T);
    }
    case "azure.keyVault.selectVault":
      mockState.session.selectedAzureKeyVault = String(params.vaultName ?? "");
      mockState.session.selectedAzureSecret = "";
      return Promise.resolve(buildMockWorkspace() as T);
    case "azure.keyVault.selectSecret":
      mockState.session.selectedAzureSecret = String(params.secretName ?? "");
      return Promise.resolve(buildMockWorkspace() as T);
    case "azure.keyVault.revealSecret": {
      const name = String(params.secretName ?? "");
      return Promise.resolve({ value: mockSecretValues[name] ?? "(no value)" } as T);
    }
    case "azure.keyVault.setSecret": {
      if (!mockState.session.azureWriteModeEnabled) {
        return Promise.reject(new Error("setting a secret requires write mode to be enabled for this Azure workspace"));
      }
      const name = String(params.secretName ?? "").trim();
      if (name && !mockAzureKeyVaultSecrets.some((secret) => secret.name === name)) {
        mockAzureKeyVaultSecrets.push({ name, enabled: true });
      }
      mockSecretValues[name] = String(params.value ?? "");
      mockState.session.selectedAzureSecret = name;
      appendLog("success", `Set Key Vault secret ${name} (mock).`);
      return Promise.resolve(buildMockWorkspace() as T);
    }
    case "azure.cosmos.selectAccount":
      mockState.session.selectedAzureCosmosAccount = String(params.account ?? "");
      mockState.session.selectedAzureCosmosDatabase = "";
      mockState.session.selectedAzureCosmosContainer = "";
      return Promise.resolve(buildMockWorkspace() as T);
    case "azure.cosmos.selectDatabase":
      mockState.session.selectedAzureCosmosDatabase = String(params.database ?? "");
      mockState.session.selectedAzureCosmosContainer = "";
      return Promise.resolve(buildMockWorkspace() as T);
    case "azure.cosmos.selectContainer":
      mockState.session.selectedAzureCosmosContainer = String(params.container ?? "");
      return Promise.resolve(buildMockWorkspace() as T);
    case "azure.postgres.selectServer":
      mockState.session.selectedAzurePostgresServer = String(params.server ?? "");
      return Promise.resolve(buildMockWorkspace() as T);
    case "azure.frontDoor.selectProfile":
      mockState.session.selectedAzureFrontDoorProfile = String(params.profile ?? "");
      mockState.session.selectedAzureFrontDoorEndpoint = "";
      mockState.session.selectedAzureFrontDoorOriginGroup = "";
      return Promise.resolve(buildMockWorkspace() as T);
    case "azure.frontDoor.selectEndpoint":
      mockState.session.selectedAzureFrontDoorEndpoint = String(params.endpoint ?? "");
      return Promise.resolve(buildMockWorkspace() as T);
    case "azure.frontDoor.selectOriginGroup":
      mockState.session.selectedAzureFrontDoorOriginGroup = String(params.originGroup ?? "");
      return Promise.resolve(buildMockWorkspace() as T);
    case "azure.frontDoor.refresh":
      return Promise.resolve(buildMockWorkspace() as T);
    case "azure.frontDoor.purgeCache": {
      if (!mockState.session.azureWriteModeEnabled) {
        return Promise.reject(
          new Error("Front Door cache purge requires write mode to be enabled for this Azure workspace"),
        );
      }
      const endpointName = String(params.endpointName ?? "");
      appendLog("success", `Purged Front Door cache for ${endpointName} (mock).`);
      return Promise.resolve(buildMockWorkspace() as T);
    }
    case "azure.queues.selectQueue":
      mockState.session.selectedAzureQueue = String(params.queue ?? "");
      return Promise.resolve(buildMockWorkspace() as T);
    case "azure.webApps.create": {
      if (!mockState.session.azureWriteModeEnabled) {
        return Promise.reject(new Error("web app create requires write mode to be enabled for this Azure workspace"));
      }
      const appName = String(params.appName ?? "").trim();
      const resourceGroup = String(params.resourceGroup ?? "").trim();
      const existingPlanName = String(params.existingPlanName ?? "").trim();
      const newPlanName = String(params.newPlanName ?? "").trim();
      const planSku = String(params.planSku ?? "F1").trim() || "F1";
      const planName = existingPlanName || newPlanName || `${appName}-plan`;
      mockAzureWebApps.push({
        name: appName,
        resourceGroup,
        location: String(params.location ?? "westeurope"),
        state: "Running",
        defaultHostName: `${appName}.azurewebsites.net`,
        kind: "app,linux",
        httpsOnly: true,
        appServicePlan: planName,
        planSku: existingPlanName ? "Existing plan" : `${planSku} (Linux)`,
        runtime: String(params.runtime ?? "NODE:22-lts"),
        outboundIpAddresses: "",
        identityType: "",
        identityPrincipalId: "",
      });
      mockState.session.selectedAzureResourceGroup = resourceGroup;
      mockState.session.selectedAzureWebAppName = appName;
      appendLog("success", `Created App Service web app ${appName} (mock).`);
      return Promise.resolve(buildMockWorkspace() as T);
    }
    case "azure.storage.createAccount": {
      if (!mockState.session.azureWriteModeEnabled) {
        return Promise.reject(new Error("storage account create requires write mode to be enabled for this Azure workspace"));
      }
      const accountName = String(params.accountName ?? "").trim().toLowerCase();
      mockAzureStorageAccounts.push({
        name: accountName,
        kind: "StorageV2",
        location: String(params.location ?? "westeurope"),
        blobEndpoint: `http://localhost:4577/${accountName}`,
        summary: "User-created storage account",
      });
      mockState.session.selectedAzureStorageAccount = accountName;
      mockState.session.selectedAzureBlobContainer = undefined;
      mockState.session.selectedAzureBlobName = undefined;
      appendLog("success", `Created storage account ${accountName} (mock).`);
      return Promise.resolve(buildMockWorkspace() as T);
    }
    case "azure.resourceGroups.delete": {
      const name = String(params.name ?? "").trim();
      if (!mockState.session.azureWriteModeEnabled) {
        return Promise.reject(new Error("resource group delete requires write mode to be enabled for this Azure workspace"));
      }
      const index = mockAzureResourceGroups.findIndex((group) => group.name === name);
      if (index >= 0) {
        mockAzureResourceGroups.splice(index, 1);
      }
      if (mockState.session.selectedAzureResourceGroup === name) {
        mockState.session.selectedAzureResourceGroup = undefined;
        mockState.session.selectedAzureVmId = undefined;
      }
      appendLog("success", `Deleted Azure resource group ${name} (mock).`);
      return Promise.resolve(buildMockWorkspace() as T);
    }
    case "azure.storage.selectAccount":
      mockState.session.selectedAzureStorageAccount = String(params.accountName ?? "");
      mockState.session.selectedAzureBlobContainer = undefined;
      mockState.session.selectedAzureBlobName = undefined;
      return Promise.resolve(buildMockWorkspace() as T);
    case "azure.storage.selectContainer":
      mockState.session.selectedAzureBlobContainer = String(params.containerName ?? "");
      mockState.session.selectedAzureBlobName = undefined;
      return Promise.resolve(buildMockWorkspace() as T);
    case "azure.storage.selectBlob":
      mockState.session.selectedAzureBlobName = String(params.blobName ?? "");
      return Promise.resolve(buildMockWorkspace() as T);
    case "azure.storage.setPrefixFilter":
      mockState.session.azureBlobPrefixFilter = String(params.prefix ?? "");
      mockState.session.selectedAzureBlobName = undefined;
      return Promise.resolve(buildMockWorkspace() as T);
    case "azure.storage.createContainer": {
      if (!mockState.session.azureWriteModeEnabled) {
        return Promise.reject(new Error("blob container create requires write mode to be enabled for this Azure workspace"));
      }
      const containerName = String(params.containerName ?? "").trim();
      mockAzureBlobContainers.push({ name: containerName, lastModified: new Date().toISOString() });
      mockState.session.selectedAzureBlobContainer = containerName;
      return Promise.resolve(buildMockWorkspace() as T);
    }
    case "azure.storage.uploadBlob": {
      if (!mockState.session.azureWriteModeEnabled) {
        return Promise.reject(new Error("blob upload requires write mode to be enabled for this Azure workspace"));
      }
      const blobName = String(params.blobName ?? "").trim();
      mockAzureBlobs.push({ name: blobName, size: "1 KiB", modifiedAt: new Date().toISOString(), contentType: "application/octet-stream" });
      mockState.session.selectedAzureBlobName = blobName;
      return Promise.resolve({ workspace: buildMockWorkspace() } as T);
    }
    case "azure.storage.deleteBlob": {
      if (!mockState.session.azureWriteModeEnabled) {
        return Promise.reject(new Error("blob delete requires write mode to be enabled for this Azure workspace"));
      }
      const blobName = String(params.blobName ?? "").trim();
      const blobIndex = mockAzureBlobs.findIndex((blob) => blob.name === blobName);
      if (blobIndex >= 0) {
        mockAzureBlobs.splice(blobIndex, 1);
      }
      if (mockState.session.selectedAzureBlobName === blobName) {
        mockState.session.selectedAzureBlobName = undefined;
      }
      return Promise.resolve(buildMockWorkspace() as T);
    }
    case "session.selectProvider":
      setCurrentProvider(String(params.providerId ?? ""));
      emitStateChanged();
      appendLog("info", `Selected provider ${params.providerId}.`);
      return Promise.resolve(mockState.session as T);
    case "session.selectProfile":
      mockState.session.currentProviderId = String(params.providerId ?? "");
      mockState.session.selectedProfileId = String(params.profileId ?? "");
      rebuildSessionDerivedState();
      emitStateChanged();
      appendLog("info", `Selected profile ${params.profileId}.`);
      return Promise.resolve(mockState.session as T);
    case "session.selectAuthMethod":
      mockState.session.selectedAuthMethod = params.authMethod as AuthMethod;
      rebuildSessionDerivedState();
      emitStateChanged();
      appendLog("info", `Selected auth method ${params.authMethod}.`);
      return Promise.resolve(mockState.session as T);
    case "session.setWriteMode":
      if (!mockState.session.isLocked) {
        return Promise.reject(new Error("open a locked workspace before changing write mode"));
      }
      if (mockState.session.lockedProviderId === "aws") {
        if (params.enabled && !buildMockWorkspace().awsWriteCapable) {
          return Promise.reject(
            new Error(
              "this profile cannot enable write mode: configure a local endpoint_url and cloudsprocket_allow_writes = true",
            ),
          );
        }
        mockState.session.awsWriteModeEnabled = Boolean(params.enabled);
      } else if (mockState.session.lockedProviderId === "azure") {
        if (params.enabled && !buildMockWorkspace().azureWriteCapable) {
          return Promise.reject(new Error("this Azure profile cannot enable write mode"));
        }
        mockState.session.azureWriteModeEnabled = Boolean(params.enabled);
      } else {
        return Promise.reject(new Error("write mode is only available for locked AWS or Azure workspaces"));
      }
      appendLog(
        params.enabled ? "warning" : "info",
        params.enabled ? "Write mode enabled for this workspace session." : "Write mode disabled for this workspace session.",
      );
      emitStateChanged();
      return Promise.resolve(mockState.session as T);
    case "session.lock":
      mockState.session.isLocked = true;
      mockState.session.awsWriteModeEnabled = false;
      mockState.session.azureWriteModeEnabled = false;
      mockState.session.lockedProviderId = mockState.session.currentProviderId;
      mockState.session.lockedProfileId = mockState.session.selectedProfileId;
      mockState.session.lockedAuthMethod = mockState.session.selectedAuthMethod;
      rebuildSessionDerivedState();
      emitStateChanged();
      appendLog(
        "success",
        `Locked ${mockState.session.lockedProviderId?.toUpperCase()} session for ${mockState.session.lockedProfileId}.`,
      );
      return Promise.resolve(mockState.session as T);
    case "session.unlock":
      mockState.session.isLocked = false;
      mockState.session.awsWriteModeEnabled = false;
      mockState.session.azureWriteModeEnabled = false;
      mockState.session.lockedProviderId = undefined;
      mockState.session.lockedProfileId = undefined;
      mockState.session.lockedAuthMethod = undefined;
      mockState.session.selectedAzureResourceGroup = undefined;
      mockState.session.selectedAzureVmId = undefined;
      mockState.session.selectedAzureStorageAccount = undefined;
      mockState.session.selectedAzureBlobContainer = undefined;
      mockState.session.selectedAzureBlobName = undefined;
      mockState.session.azureBlobPrefixFilter = undefined;
      rebuildSessionDerivedState();
      emitStateChanged();
      appendLog("info", "Unlocked the active cloud session.");
      return Promise.resolve(mockState.session as T);
    case "logs.list":
      return Promise.resolve(
        mockState.logs.slice(0, Number(params.limit ?? 50)) as T,
      );
    case "app.settings.get":
      return Promise.resolve(mockState.settings as T);
    case "preferences.get":
      return Promise.resolve(buildMockPreferencesSnapshot() as T);
    case "preferences.update": {
      const snapshot = buildMockPreferencesSnapshot(params as unknown as ServicePreferences);
      rebuildSessionDerivedState();
      return Promise.resolve(snapshot as T);
    }
    case "preferences.hiddenResources.get":
      rebuildSessionDerivedState();
      return Promise.resolve(buildMockHiddenResourcesSnapshot() as T);
    case "app.reset":
      if (String(params.confirmation ?? "") !== "RESET") {
        return Promise.reject(new Error("type RESET to confirm the app reset"));
      }
      mockState.session = {
        ...initialMockSession,
        availableAuthMethods: [...initialMockSession.availableAuthMethods],
        workspaceTabs: [],
      };
      mockState.preferences = {
        disabledProviders: [],
        disabledServices: {},
      };
      mockState.logs = [];
      mockState.localStackStatus = "not-configured";
      mockState.flociAzStatus = "not-configured";
      mockState.flociAzConfigReady = false;
      clearDebugLogs();
      rebuildSessionDerivedState();
      emitStateChanged();
      const resetResult = {
        summary: "CloudSprocket app state has been reset. External AWS, Azure, and GCP config files were not touched.",
        resetPaths: [
          mockState.settings.localConfigDir,
          mockState.settings.emulatorStateDir,
        ],
        skippedPaths: [],
      } satisfies AppResetResult;
      return Promise.resolve(resetResult as T);
    case "actions.invoke": {
      const job: JobStatus = {
        jobId: `job-${Date.now()}`,
        label: "Refresh Discovery",
        status: "queued",
        message: "Refreshing provider discovery and session state.",
      };
      setTimeout(() => {
        emitMockEvent("job.updated", {
          ...job,
          status: "running",
          message: "Refreshing provider discovery.",
        });
      }, 10);
      setTimeout(() => {
        appendLog("success", "Discovery refresh completed.");
        emitStateChanged();
        emitMockEvent("job.updated", {
          ...job,
          status: "completed",
          message: "Refresh completed.",
          completedAt: new Date().toISOString(),
        });
      }, 30);
      return Promise.resolve(job as T);
    }
    case "recipes.list":
      return Promise.resolve(mockRecipes.map((recipe) => recipe.manifest) as T);
    case "recipes.get":
      return mockGetRecipe(params.recipeId as string) as Promise<T>;
    case "tofu.status":
      return Promise.resolve({ available: true, version: "1.12.2", path: "(bundled)" } as T);
    case "tofu.install": {
      const job: JobStatus = { jobId: `job-${Date.now()}`, label: "Install OpenTofu", status: "queued", message: "Preparing." };
      setTimeout(() => emitMockEvent("job.updated", { ...job, status: "completed", message: "OpenTofu 1.12.2 is ready.", completedAt: new Date().toISOString() }), 20);
      return Promise.resolve(job as T);
    }
    case "deployments.list":
      return Promise.resolve([...mockDeployments] as T);
    case "deployments.get":
      return mockGetDeployment(params.deploymentId as string) as Promise<T>;
    case "deployments.plan":
      return mockPlanDeployment(params) as Promise<T>;
    case "deployments.apply":
      return mockRunDeployment(params.deploymentId as string, "apply") as Promise<T>;
    case "deployments.destroy":
      return mockRunDeployment(params.deploymentId as string, "destroy") as Promise<T>;
    case "deployments.cancel":
      return mockCancelDeployment(params.deploymentId as string) as Promise<T>;
    case "deployments.delete":
      return mockDeleteDeployment(params.deploymentId as string) as Promise<T>;
    case "deployments.retryPostApply":
      return mockRetryPostApply(params.deploymentId as string) as Promise<T>;
    default:
      return Promise.reject(new Error(`Mock backend method not implemented: ${method}`));
  }
}

// --- IaC recipes & deployments: client wrappers + browser mock --------------

export async function listRecipes(): Promise<RecipeManifest[]> {
  return backendRequest<RecipeManifest[]>("recipes.list");
}

export async function getRecipe(recipeId: string): Promise<Recipe> {
  return backendRequest<Recipe>("recipes.get", { recipeId });
}

export async function getTofuStatus(): Promise<TofuStatus> {
  return backendRequest<TofuStatus>("tofu.status");
}

export async function installTofu(): Promise<JobStatus> {
  return backendRequest<JobStatus>("tofu.install");
}

export async function listDeployments(): Promise<Deployment[]> {
  return backendRequest<Deployment[]>("deployments.list");
}

export async function getDeployment(deploymentId: string): Promise<Deployment> {
  return backendRequest<Deployment>("deployments.get", { deploymentId });
}

export interface PlanDeploymentRequest {
  recipeId: string;
  name: string;
  providerId: string;
  profileId: string;
  local: boolean;
  runtimeId?: string;
  variables: Record<string, unknown>;
}

export async function planDeployment(request: PlanDeploymentRequest): Promise<DeploymentJob> {
  return backendRequest<DeploymentJob>("deployments.plan", { ...request });
}

export async function applyDeployment(deploymentId: string): Promise<DeploymentJob> {
  return backendRequest<DeploymentJob>("deployments.apply", { deploymentId });
}

export async function destroyDeployment(deploymentId: string): Promise<DeploymentJob> {
  return backendRequest<DeploymentJob>("deployments.destroy", { deploymentId });
}

export async function cancelDeployment(deploymentId: string): Promise<void> {
  await backendRequest("deployments.cancel", { deploymentId });
}

export async function deleteDeployment(deploymentId: string): Promise<void> {
  await backendRequest("deployments.delete", { deploymentId });
}

export async function retryPostApplyDeployment(deploymentId: string): Promise<DeploymentJob> {
  return backendRequest<DeploymentJob>("deployments.retryPostApply", { deploymentId });
}

// openExternalUrl opens a URL in the user's default browser. The Tauri webview
// blocks plain <a target="_blank"> navigation, so deployment output links must
// go through the opener plugin; in browser/dev we fall back to window.open.
export async function openExternalUrl(url: string): Promise<void> {
  if (isTauriRuntime()) {
    await openUrl(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

const mockRecipes: Recipe[] = [
  {
    manifest: {
      apiVersion: "cloudsprocket.recipe/v1",
      id: "serverless-fullstack-aws",
      kind: "app-deploy",
      version: "0.2.0",
      name: "Serverless full-stack (AWS)",
      summary: "Static frontend on S3, a Node API on Lambda behind API Gateway, and a DynamoDB table.",
      description: "A serverless full-stack starter that runs on LocalStack's free tier and ships unchanged to real AWS.",
      providers: ["aws"],
      tags: ["serverless", "fullstack", "aws", "starter"],
      engine: { type: "opentofu", minVersion: "1.6.0" },
      local: { runtimes: [{ id: "localstack" }] },
      superpowers: { iamPolicyStream: true },
    },
    variables: [
      { name: "app_name", type: "string", description: "Lowercase name prefix used for every resource.", default: "myapp", required: false, group: "Application", widget: "text", help: "Lowercase name prefix used for every resource." },
      { name: "environment", type: "string", description: "Deployment environment.", default: "dev", required: false, group: "Application", widget: "select", options: ["dev", "staging", "prod"] },
      { name: "aws_region", type: "string", description: "AWS region to deploy into.", default: "us-east-1", required: false, group: "Application", widget: "text" },
      { name: "backend_source_dir", type: "string", description: "Directory containing your Node backend.", default: "./sample-api", required: false, group: "Application code", widget: "directory", help: "Folder with your Node backend handler.handler export. Leave default for the sample API." },
      { name: "frontend_dist_dir", type: "string", description: "Directory of your built static frontend.", default: "./sample-site", required: false, group: "Application code", widget: "directory", help: "Folder of your built static frontend. Leave default for the sample site." },
      { name: "lambda_memory_mb", type: "number", description: "Memory for the API Lambda, in megabytes.", default: 256, required: false, group: "Backend", widget: "number", help: "Memory for the API Lambda, in megabytes." },
      { name: "enable_point_in_time_recovery", type: "bool", description: "Enable DynamoDB point-in-time recovery.", default: false, required: false, group: "Database", widget: "switch" },
      { name: "tags", type: "map(string)", description: "Extra tags applied to every resource.", default: {}, required: false, group: "Advanced", widget: "textarea", help: "Extra tags as a JSON object." },
    ],
    outputs: [
      { name: "api_endpoint", description: "Base URL of the backend HTTP API.", primary: true },
      { name: "frontend_website_endpoint", description: "Static website endpoint for the frontend.", primary: true },
      { name: "frontend_bucket", description: "S3 bucket hosting the static frontend." },
      { name: "dynamodb_table", description: "DynamoDB table backing the application." },
    ],
  },
  {
    manifest: {
      apiVersion: "cloudsprocket.recipe/v1",
      id: "container-fullstack-aws",
      kind: "app-deploy",
      version: "0.2.0",
      name: "Container full-stack (AWS)",
      summary: "A Node container on ECS Fargate behind an ALB, a Postgres RDS database, and a CloudFront frontend.",
      description: "The traditional shape. Uses ECS, RDS, ELBv2 and CloudFront, which only emulate on LocalStack Pro.",
      providers: ["aws"],
      tags: ["container", "fullstack", "aws", "ecs", "rds"],
      engine: { type: "opentofu", minVersion: "1.6.0" },
      local: { runtimes: [{ id: "localstack", requiresPro: true }] },
      superpowers: { iamPolicyStream: true },
    },
    variables: [
      { name: "app_name", type: "string", default: "myapp", required: false, group: "Application", widget: "text" },
      { name: "environment", type: "string", default: "dev", required: false, group: "Application", widget: "select", options: ["dev", "staging", "prod"] },
      { name: "aws_region", type: "string", default: "us-east-1", required: false, group: "Application", widget: "text" },
      { name: "container_image", type: "string", default: "public.ecr.aws/docker/library/nginx:stable-alpine", required: false, group: "Backend container", widget: "text", help: "Container image for the backend service. Default serves HTTP on port 80." },
      { name: "container_port", type: "number", default: 80, required: false, group: "Backend container", widget: "number" },
      { name: "desired_count", type: "number", default: 2, required: false, group: "Backend container", widget: "number" },
      { name: "db_username", type: "string", default: "appuser", required: false, group: "Database", widget: "text" },
      { name: "db_password", type: "string", default: "changeme-please", required: false, sensitive: true, group: "Database", widget: "password" },
      { name: "frontend_dist_dir", type: "string", default: "./sample-site", required: false, group: "Frontend", widget: "directory", help: "Folder of your built static frontend. Leave default for the sample frontend." },
    ],
    outputs: [
      { name: "alb_dns_name", description: "Public DNS of the load balancer.", primary: true },
      { name: "frontend_url", description: "CloudFront URL.", primary: true },
      { name: "frontend_website_endpoint", description: "Direct S3 static website endpoint for the frontend." },
      { name: "database_endpoint", description: "Postgres endpoint." },
      { name: "ecs_cluster", description: "ECS cluster name." },
    ],
  },
  {
    manifest: {
      apiVersion: "cloudsprocket.recipe/v1",
      id: "static-site-aws",
      kind: "app-deploy",
      version: "0.2.0",
      name: "Static website (AWS S3)",
      summary: "A static website served from an S3 bucket, with your built site uploaded automatically.",
      description: "An S3 static website recipe that runs on LocalStack's free tier and can deploy to real AWS.",
      providers: ["aws"],
      tags: ["static", "website", "s3", "aws", "starter"],
      engine: { type: "opentofu", minVersion: "1.6.0" },
      local: { runtimes: [{ id: "localstack" }] },
      superpowers: { iamPolicyStream: true },
    },
    variables: [
      { name: "app_name", type: "string", description: "Lowercase name prefix used for every resource.", default: "mysite", required: false, group: "Application", widget: "text", help: "Lowercase name prefix used for every resource." },
      { name: "environment", type: "string", description: "Deployment environment.", default: "dev", required: false, group: "Application", widget: "select", options: ["dev", "staging", "prod"] },
      { name: "aws_region", type: "string", description: "AWS region to deploy into.", default: "us-east-1", required: false, group: "Application", widget: "text" },
      { name: "frontend_dist_dir", type: "string", description: "Directory of your built static site.", default: "./sample-site", required: false, group: "Website content", widget: "directory", help: "Folder of your built static site. Leave default for the sample site." },
      { name: "tags", type: "map(string)", description: "Extra tags applied to every resource.", default: {}, required: false, group: "Advanced", widget: "textarea", help: "Extra tags as a JSON object." },
    ],
    outputs: [
      { name: "website_endpoint", description: "Static website endpoint for the site.", primary: true },
      { name: "bucket_name", description: "S3 bucket hosting the static website." },
    ],
  },
  {
    manifest: {
      apiVersion: "cloudsprocket.recipe/v1",
      id: "scheduled-job-aws",
      version: "0.1.0",
      name: "Scheduled job (AWS EventBridge + Lambda)",
      summary: "A Node Lambda invoked on a schedule by an EventBridge rule.",
      description: "A recurring background job recipe that runs on LocalStack's free tier and can deploy to real AWS.",
      providers: ["aws"],
      tags: ["scheduled", "cron", "lambda", "eventbridge", "aws"],
      engine: { type: "opentofu", minVersion: "1.6.0" },
      local: { emulator: "localstack" },
    },
    variables: [
      { name: "app_name", type: "string", description: "Lowercase name prefix used for every resource.", default: "myjob", required: false, group: "Application", widget: "text", help: "Lowercase name prefix used for every resource." },
      { name: "environment", type: "string", description: "Deployment environment.", default: "dev", required: false, group: "Application", widget: "select", options: ["dev", "staging", "prod"] },
      { name: "aws_region", type: "string", description: "AWS region to deploy into.", default: "us-east-1", required: false, group: "Application", widget: "text" },
      { name: "schedule_expression", type: "string", description: "EventBridge schedule expression.", default: "rate(5 minutes)", required: false, group: "Schedule", widget: "text", help: "EventBridge schedule, for example rate(5 minutes)." },
      { name: "backend_source_dir", type: "string", description: "Directory containing your Node job.", default: "./sample-job", required: false, group: "Job code", widget: "directory", help: "Folder with your Node job handler.handler export. Leave default for the sample job." },
      { name: "lambda_memory_mb", type: "number", description: "Memory for the job Lambda, in megabytes.", default: 128, required: false, group: "Job code", widget: "number", help: "Memory for the job Lambda, in megabytes." },
      { name: "tags", type: "map(string)", description: "Extra tags applied to every resource.", default: {}, required: false, group: "Advanced", widget: "textarea", help: "Extra tags as a JSON object." },
    ],
    outputs: [
      { name: "lambda_function_name", description: "Name of the scheduled job Lambda.", primary: true },
      { name: "schedule_rule_name", description: "Name of the EventBridge rule driving the schedule." },
    ],
  },
];

const mockDeployments: Deployment[] = [];

function mockGetRecipe(recipeId: string): Promise<Recipe> {
  const recipe = mockRecipes.find((entry) => entry.manifest.id === recipeId);
  return recipe ? Promise.resolve(recipe) : Promise.reject(new Error(`recipe ${recipeId} not found`));
}

function mockGetDeployment(deploymentId: string): Promise<Deployment> {
  const deployment = mockDeployments.find((entry) => entry.id === deploymentId);
  return deployment ? Promise.resolve(deployment) : Promise.reject(new Error(`deployment ${deploymentId} not found`));
}

function mockSetStatus(deployment: Deployment, status: Deployment["status"]): void {
  deployment.status = status;
  deployment.updatedAt = new Date().toISOString();
  emitMockEvent("deployment.changed", { ...deployment });
}

function mockPlanDeployment(params: Record<string, unknown>): Promise<DeploymentJob> {
  const now = new Date().toISOString();
  const deployment: Deployment = {
    id: `dep-${Date.now()}`,
    recipeId: String(params.recipeId ?? ""),
    name: String(params.name || params.recipeId || "deployment"),
    providerId: String(params.providerId ?? ""),
    profileId: String(params.profileId ?? ""),
    local: Boolean(params.local),
    variables: (params.variables as Record<string, unknown>) ?? {},
    status: "pending",
    createdAt: now,
    updatedAt: now,
  };
  mockDeployments.unshift(deployment);
  const job: JobStatus = { jobId: `job-${Date.now()}`, label: `Plan ${deployment.name}`, status: "queued", message: "Planning." };
  const log = (line: string) => emitMockEvent("deployment.log", { deploymentId: deployment.id, jobId: job.jobId, line });

  setTimeout(() => {
    mockSetStatus(deployment, "planning");
    emitMockEvent("job.updated", { ...job, status: "running", message: `Planning ${deployment.name}.` });
    log("Initializing the backend...");
    log("Initializing provider plugins...");
    log("Terraform will perform the following actions:");
    log("Plan: 10 to add, 0 to change, 0 to destroy.");
    deployment.plan = {
      add: 10,
      change: 0,
      destroy: 0,
      changes: [
        { address: "aws_s3_bucket.frontend", type: "aws_s3_bucket", name: "frontend", actions: ["create"] },
        { address: "aws_dynamodb_table.data", type: "aws_dynamodb_table", name: "data", actions: ["create"] },
        { address: "aws_lambda_function.api", type: "aws_lambda_function", name: "api", actions: ["create"] },
        { address: "aws_apigatewayv2_api.http", type: "aws_apigatewayv2_api", name: "http", actions: ["create"] },
      ],
    };
    mockSetStatus(deployment, "planned");
    emitMockEvent("job.updated", { ...job, status: "completed", message: "Plan ready: +10 ~0 -0.", completedAt: new Date().toISOString() });
  }, 60);
  return Promise.resolve({ deployment, job });
}

function mockRunDeployment(deploymentId: string, action: "apply" | "destroy"): Promise<DeploymentJob> {
  const deployment = mockDeployments.find((entry) => entry.id === deploymentId);
  if (!deployment) {
    return Promise.reject(new Error(`deployment ${deploymentId} not found`));
  }
  const label = action === "apply" ? `Apply ${deployment.name}` : `Destroy ${deployment.name}`;
  const job: JobStatus = { jobId: `job-${Date.now()}`, label, status: "queued", message: `${label}.` };
  const log = (line: string) => emitMockEvent("deployment.log", { deploymentId: deployment.id, jobId: job.jobId, line });

  setTimeout(() => {
    if (action === "destroy") {
      mockSetStatus(deployment, "destroying");
      emitMockEvent("job.updated", { ...job, status: "running", message: `Destroying ${deployment.name}.` });
      log("Destroying... aws_s3_bucket.frontend");
      deployment.outputs = undefined;
      mockSetStatus(deployment, "destroyed");
      emitMockEvent("job.updated", { ...job, status: "completed", message: `${deployment.name} destroyed.`, completedAt: new Date().toISOString() });
      return;
    }
    mockSetStatus(deployment, "applying");
    emitMockEvent("job.updated", { ...job, status: "running", message: `Applying ${deployment.name}.` });
    log("Applying... aws_s3_bucket.frontend: Creating...");
    log("Apply complete! Resources: 10 added, 0 changed, 0 destroyed.");
    const appName = String(deployment.variables.app_name ?? "myapp");
    const env = String(deployment.variables.environment ?? "dev");
    if (deployment.recipeId === "static-site-aws") {
      deployment.outputs = [
        { name: "website_endpoint", value: `http://${appName}-${env}-site.s3-website.localhost:4566` },
        { name: "bucket_name", value: `${appName}-${env}-site` },
      ];
    } else if (deployment.recipeId === "scheduled-job-aws") {
      deployment.outputs = [
        { name: "lambda_function_name", value: `${appName}-${env}-job` },
        { name: "schedule_rule_name", value: `${appName}-${env}-schedule` },
      ];
    } else if (deployment.recipeId === "container-fullstack-aws") {
      deployment.outputs = [
        { name: "alb_dns_name", value: `${appName}-${env}.elb.localhost:4566` },
        { name: "frontend_url", value: `http://${appName}-${env}.cloudfront.localhost:4566` },
        { name: "database_endpoint", value: `${appName}-${env}.rds.localhost:4566` },
        { name: "database_password", value: String(deployment.variables.db_password ?? "changeme-please"), sensitive: true },
        { name: "ecs_cluster", value: `${appName}-${env}-cluster` },
      ];
    } else {
      deployment.outputs = [
        { name: "api_endpoint", value: `http://localhost:4566/restapis/${appName}-${env}` },
        { name: "frontend_website_endpoint", value: `http://${appName}-${env}-frontend.s3-website.localhost:4566` },
        { name: "frontend_bucket", value: `${appName}-${env}-frontend` },
        { name: "dynamodb_table", value: `${appName}-${env}-data` },
      ];
    }
    mockSetStatus(deployment, "applied");
    emitMockEvent("job.updated", { ...job, status: "completed", message: `${deployment.name} deployed.`, completedAt: new Date().toISOString() });
  }, 80);
  return Promise.resolve({ deployment, job });
}

const inFlightStatuses: Deployment["status"][] = ["pending", "planning", "applying", "destroying"];

function mockRetryPostApply(deploymentId: string): Promise<DeploymentJob> {
  const deployment = mockDeployments.find((entry) => entry.id === deploymentId);
  if (!deployment) {
    return Promise.reject(new Error(`deployment ${deploymentId} not found`));
  }
  const job: JobStatus = {
    jobId: `job-${Date.now()}`,
    label: `Retry post-apply ${deployment.name}`,
    status: "queued",
    message: "Retrying post-apply steps.",
  };
  setTimeout(() => {
    deployment.postApplyError = undefined;
    emitMockEvent("job.updated", {
      ...job,
      status: "completed",
      message: `Post-apply steps completed for ${deployment.name}.`,
      completedAt: new Date().toISOString(),
    });
    emitMockEvent("deployment.changed", { ...deployment });
  }, 40);
  return Promise.resolve({ deployment, job });
}

function mockCancelDeployment(deploymentId: string): Promise<{ cancelled: boolean }> {
  const deployment = mockDeployments.find((entry) => entry.id === deploymentId);
  if (!deployment) {
    return Promise.reject(new Error(`deployment ${deploymentId} not found`));
  }
  if (!inFlightStatuses.includes(deployment.status)) {
    return Promise.reject(new Error("no operation is currently running for this deployment"));
  }
  mockSetStatus(deployment, "cancelled");
  return Promise.resolve({ cancelled: true });
}

function mockDeleteDeployment(deploymentId: string): Promise<{ deleted: boolean }> {
  const index = mockDeployments.findIndex((entry) => entry.id === deploymentId);
  if (index < 0) {
    return Promise.reject(new Error(`deployment ${deploymentId} not found`));
  }
  const status = mockDeployments[index].status;
  if (status === "planning" || status === "applying" || status === "destroying") {
    return Promise.reject(new Error("this deployment is still running; stop it before removing it"));
  }
  if (status === "applied") {
    return Promise.reject(new Error("this deployment still has live resources; destroy it before removing it"));
  }
  mockDeployments.splice(index, 1);
  return Promise.resolve({ deleted: true });
}

export async function backendRequest<T>(
  method: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  const requestId = Math.floor(Math.random() * 1000000);
  addDebugLog({
    timestamp: new Date().toISOString(),
    type: "request",
    method,
    payload: { requestId, params },
  });

  if (!isTauriRuntime()) {
    try {
      const result = await handleMockRequest<T>(method, params);
      addDebugLog({
        timestamp: new Date().toISOString(),
        type: "response",
        method,
        payload: { requestId, result: truncateDebugPayload(result) },
      });
      return result;
    } catch (error) {
      addDebugLog({
        timestamp: new Date().toISOString(),
        type: "error",
        method,
        payload: { requestId, error: error instanceof Error ? error.message : String(error) },
      });
      throw error;
    }
  }

  try {
    const result = await invoke<T>("backend_request", { method, params });
    addDebugLog({
      timestamp: new Date().toISOString(),
      type: "response",
      method,
      payload: { requestId, result: truncateDebugPayload(result) },
    });
    return result;
  } catch (error) {
    addDebugLog({
      timestamp: new Date().toISOString(),
      type: "error",
      method,
      payload: { requestId, error: error instanceof Error ? error.message : String(error) },
    });
    throw error;
  }
}

export async function subscribeToBackendEvent<K extends BackendEventName>(
  eventName: K,
  handler: (payload: BackendEventMap[K]) => void,
): Promise<() => void> {
  const wrappedHandler = (payload: BackendEventMap[K]) => {
    addDebugLog({
      timestamp: new Date().toISOString(),
      type: "event",
      method: eventName,
      payload,
    });
    handler(payload);
  };

  if (isTauriRuntime()) {
    const unlisten = await listen<BackendEventMap[K]>(tauriEventName(eventName), (event) => {
      wrappedHandler(event.payload);
    });
    return () => {
      unlisten();
    };
  }

  const listeners =
    mockListeners.get(eventName) ??
    new Set<(payload: BackendEventMap[BackendEventName]) => void>();
  listeners.add(wrappedHandler as (payload: BackendEventMap[BackendEventName]) => void);
  mockListeners.set(eventName, listeners);

  return () => {
    listeners.delete(wrappedHandler as (payload: BackendEventMap[BackendEventName]) => void);
  };
}
