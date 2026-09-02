// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

/**
 * Browser-only backend mock for Vite UI development without Tauri.
 *
 * Loaded only via dynamic import() from backend-ipc when
 * __ENABLE_BROWSER_MOCK__ is true and the runtime is not Tauri.
 * Production Tauri builds define __ENABLE_BROWSER_MOCK__ as false so this
 * module is tree-shaken out of the main bundle entirely.
 */

import type {
  ActionCapability,
  AppResetResult,
  ActivityLogEntry,
  AppSettingsSnapshot,
  AuthMethod,
  AwsInventoryScope,
  AwsInventorySlice,
  Deployment,
  DeploymentJob,
  DeploymentLogEvent,
  EmulatorStatus,
  HiddenResourceHit,
  HiddenResourcesSnapshot,
  JobStatus,
  LabRunActionResult,
  LabSession,
  LabSpec,
  LabStepAction,
  PreferencesSnapshot,
  ProfileSummary,
  ProviderSummary,
  Recipe,
  RecipeManifest,
  ServiceCatalogEntry,
  ServicePreferences,
  SessionSnapshot,
  StateChangedPayload,
  TofuStatus,
  WorkspaceSnapshot,
  WorkspaceTab,
  AwsLambdaInvokeResult,
  AwsDynamoDBQueryResult,
  DriftReport,
  GcpCloudFunction,
  GcpComputeInstance,
  GcpGkeCluster,
  GcpStorageBucket,
  GcpStorageObject,
} from "../types/backend";
import { awsInventoryScopeForTab } from "./aws-inventory";
import {
  applyDeploymentRejectedReason,
  deleteDeploymentRejectedReason,
  driftCheckRejectedReason,
  mockAwsWriteRejectedReason,
  retryPostApplyRejectedReason,
  updateDeploymentRejectedReason,
} from "./mock-rpc-policy";
import {
  isProviderEnabled,
  isServiceEnabled,
} from "./service-preferences";
// Value import only for app.reset clearing the shared debug ring buffer.
// This does not pull the mock into Tauri production graphs: mock is only
// reached via dynamic import from backend-ipc when __ENABLE_BROWSER_MOCK__.
import { clearDebugLogs } from "./backend-ipc";

// Local copies of IPC event names / drift result (avoids a type-only cycle).
type BackendEventName =
  | "state.changed"
  | "job.updated"
  | "log.appended"
  | "deployment.log"
  | "deployment.changed"
  | "lab.changed";

type CheckDriftResult = {
  deployment: Deployment;
  drift: DriftReport;
};

type BackendEventMap = {
  "state.changed": StateChangedPayload;
  "job.updated": JobStatus;
  "log.appended": ActivityLogEntry;
  "deployment.log": DeploymentLogEvent;
  "deployment.changed": Deployment;
  "lab.changed": LabSession;
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
    category: "service",
    domain: "storage",
  },
  {
    tabId: "ec2",
    label: "EC2",
    summary: "Fleet and instance operations.",
    detail: "Instance inventory and lifecycle actions are being ported.",
    category: "service",
    domain: "compute",
  },
  {
    tabId: "lambda",
    label: "Lambda",
    summary: "Function inventory, configuration, logs and safe test invoke.",
    detail: "List functions by region, view config and recent CloudWatch logs, perform test invokes.",
    category: "service",
    domain: "compute",
  },
  {
    tabId: "dynamodb",
    label: "DynamoDB",
    summary: "Table inventory and read-only item preview.",
    detail: "List tables by region, inspect keys and GSIs, and scan the first items read-only.",
    category: "service",
    domain: "database",
  },
  {
    tabId: "sqs",
    label: "SQS",
    summary: "Queue inventory, depth metrics, and safe message peek.",
    detail: "List queues by region, inspect depth and in-flight counts, and peek messages without deleting them.",
    category: "service",
    domain: "integration",
  },
  {
    tabId: "sns",
    label: "SNS",
    summary: "Topic inventory and subscription preview.",
    detail: "List topics by region and inspect subscriptions read-only.",
    category: "service",
    domain: "integration",
  },
  {
    tabId: "rds",
    label: "RDS",
    summary: "Database instance inventory.",
    detail: "List RDS instances by region with engine, status, and endpoint details.",
    category: "service",
    domain: "database",
  },
  {
    tabId: "logs",
    label: "Logs",
    summary: "CloudWatch Logs group inventory and recent events.",
    detail: "Browse log groups by region and tail recent events read-only.",
    category: "service",
    domain: "observability",
  },
  {
    tabId: "iam",
    label: "IAM",
    summary: "Role and policy inventory.",
    detail: "Inspect IAM roles and customer-managed policies created in this account.",
    category: "service",
    domain: "security",
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

/** Live GCP catalogue tabs (not coming_soon). Mirrors backend gcpServiceCatalog. */
const mockGcpWorkspaceTabs: WorkspaceTab[] = [
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
    tabId: "gcp-overview",
    label: "GCP",
    summary: "Project context and readiness.",
    detail: "Surfaces the open GCP configuration details while provider-specific inventory is ported.",
    category: "workspace",
  },
  {
    tabId: "gcp-storage",
    label: "Cloud Storage",
    summary: "GCS buckets and object browser via gcloud.",
    detail:
      "Lists Cloud Storage buckets for the open gcloud configuration and project, and browses objects under a selected prefix.",
    category: "service",
    domain: "storage",
  },
  {
    tabId: "gcp-compute",
    label: "Compute Engine",
    summary: "VM instance inventory via gcloud.",
    detail:
      "Lists Compute Engine instances for the open gcloud configuration and project. Start and stop when write mode is on.",
    category: "service",
    domain: "compute",
  },
  {
    tabId: "gcp-functions",
    label: "Cloud Functions",
    summary: "Function inventory via gcloud (1st and 2nd gen).",
    detail:
      "Lists Cloud Functions for the open gcloud configuration and project. Invoke when write mode is on.",
    category: "service",
    domain: "compute",
  },
  {
    tabId: "gcp-gke",
    label: "GKE",
    summary: "Kubernetes cluster inventory via gcloud.",
    detail:
      "Lists Google Kubernetes Engine clusters for the open gcloud configuration and project.",
    category: "service",
    domain: "compute",
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
    sampleItemsNextToken: "mock-ddb-page-2",
    sampleItemsHasMore: true,
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

const mockGcpStorageBuckets: GcpStorageBucket[] = [
  {
    name: "platform-artifacts",
    location: "US",
    locationType: "multi-region",
    storageClass: "STANDARD",
    createdAt: "2026-01-12T09:00:00Z",
    summary: "Primary artefact bucket.",
  },
  {
    name: "platform-logs",
    location: "europe-west1",
    locationType: "region",
    storageClass: "NEARLINE",
    createdAt: "2026-02-01T12:00:00Z",
    summary: "Regional logs bucket.",
  },
];

let mockGcpStorageObjects: GcpStorageObject[] = [
  { key: "docs/", isFolder: true, size: "Folder" },
  {
    key: "docs/readme.txt",
    size: "12 B",
    updated: "2026-08-01T10:00:00Z",
    contentType: "text/plain",
  },
  {
    key: "uploads/package.zip",
    size: "4.2 MB",
    updated: "2026-08-02T08:15:00Z",
    contentType: "application/zip",
  },
];

let mockGcpStorageObjectsHasMore = true;
let mockGcpStorageObjectsNextToken: string | undefined = "mock-gcs-page-2";

const mockGcpComputeInstances: GcpComputeInstance[] = [
  {
    name: "web-1",
    zone: "us-central1-a",
    machineType: "e2-micro",
    status: "RUNNING",
    internalIp: "10.0.0.2",
    externalIp: "203.0.113.5",
    createdAt: "2026-03-01T10:00:00Z",
  },
  {
    name: "batch-1",
    zone: "europe-west1-b",
    machineType: "e2-standard-2",
    status: "TERMINATED",
    internalIp: "10.0.0.3",
    createdAt: "2026-03-02T11:00:00Z",
  },
];

const mockGcpFunctions: GcpCloudFunction[] = [
  {
    name: "hello-http",
    region: "us-central1",
    runtime: "nodejs20",
    status: "ACTIVE",
    generation: "2nd gen",
    trigger: "HTTPS",
    url: "https://hello-http-xxxxx-uc.a.run.app",
  },
  {
    name: "process-upload",
    region: "europe-west1",
    runtime: "python311",
    status: "ACTIVE",
    generation: "1st gen",
    trigger: "google.storage.object.finalize",
  },
];

const mockGcpGkeClusters: GcpGkeCluster[] = [
  {
    name: "prod-gke",
    location: "us-central1",
    status: "RUNNING",
    masterVersion: "1.29.4-gke.1043002",
    nodeCount: 3,
    mode: "Autopilot",
    endpoint: "203.0.113.20",
  },
  {
    name: "dev-gke",
    location: "europe-west1-b",
    status: "RUNNING",
    masterVersion: "1.28.11-gke.1019001",
    nodeCount: 2,
    mode: "Standard",
    endpoint: "203.0.113.21",
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

const mockWorkspaceEKSClusters = [
  {
    clusterArn: "arn:aws:eks:us-east-1:000000000000:cluster/demo",
    clusterName: "demo",
    status: "ACTIVE",
    version: "1.29",
    platformVersion: "eks.5",
    endpoint: "https://demo.eks.us-east-1.amazonaws.com",
  },
];

const mockWorkspaceEKSNodeGroups = [
  {
    nodeGroupArn: "arn:aws:eks:us-east-1:000000000000:nodegroup/demo/workers",
    nodeGroupName: "workers",
    status: "ACTIVE",
    desiredSize: 2,
    instanceTypes: ["m5.large"],
    capacityType: "ON_DEMAND",
  },
];

const mockWorkspaceCloudFormationStacks = [
  {
    stackId: "arn:aws:cloudformation:us-east-1:000000000000:stack/demo/abc",
    stackName: "demo",
    stackStatus: "CREATE_COMPLETE",
    creationTime: "2026-03-01T12:00:00Z",
  },
];

const mockWorkspaceCloudFormationStackEvents = [
  {
    eventId: "evt-1",
    timestamp: "2026-03-01T12:05:00Z",
    logicalResourceId: "MyBucket",
    resourceStatus: "CREATE_COMPLETE",
    resourceType: "AWS::S3::Bucket",
  },
];

const mockWorkspaceEventBridgeBuses = [
  {
    name: "default",
    arn: "arn:aws:events:us-east-1:000000000000:event-bus/default",
  },
];

const mockWorkspaceEventBridgeRules = [
  {
    name: "hourly",
    state: "ENABLED",
    scheduleExpression: "rate(1 hour)",
    description: "Hourly trigger",
  },
];

const mockWorkspaceRoute53HostedZones = [
  {
    hostedZoneId: "/hostedzone/Z123",
    name: "example.com.",
    recordCount: 2,
    privateZone: false,
    comment: "Demo zone",
  },
];

const mockWorkspaceRoute53ResourceRecordSets = [
  {
    name: "www.example.com.",
    type: "A",
    ttl: 300,
    values: ["203.0.113.10"],
  },
];

const mockWorkspaceElbLoadBalancers = [
  {
    loadBalancerArn: "arn:aws:elasticloadbalancing:us-east-1:123:loadbalancer/app/demo-alb/abc",
    loadBalancerName: "demo-alb",
    dnsName: "demo-alb.elb.localhost:4566",
    type: "application",
    scheme: "internet-facing",
    state: "active",
    vpcId: "vpc-123",
  },
];

const mockWorkspaceElbTargetGroups = [
  {
    targetGroupArn: "arn:aws:elasticloadbalancing:us-east-1:123:targetgroup/demo-tg/abc",
    targetGroupName: "demo-tg",
    protocol: "HTTP",
    port: 8080,
    targetType: "ip",
    healthCheckPath: "/health",
  },
];

const mockWorkspaceKmsKeyId = "1234abcd-5678-90ef-ghij-klmnopqrstuv";

const mockWorkspaceKmsKeys = [
  {
    keyId: mockWorkspaceKmsKeyId,
    arn: `arn:aws:kms:us-east-1:123:key/${mockWorkspaceKmsKeyId}`,
    description: "Demo encryption key",
    keyUsage: "ENCRYPT_DECRYPT",
    keyState: "Enabled",
    keySpec: "SYMMETRIC_DEFAULT",
    origin: "AWS_KMS",
    enabled: true,
  },
];

const mockWorkspaceKmsAliases = [
  {
    aliasName: "alias/demo-key",
    aliasArn: "arn:aws:kms:us-east-1:123:alias/demo-key",
    targetKeyId: mockWorkspaceKmsKeyId,
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

function nextMockLogId(): number {
  return mockState.logs.reduce((max, entry) => Math.max(max, entry.id), 0) + 1;
}

function mockAwsWriteTargetIsLocal(profile: ProfileSummary | undefined): boolean {
  if (!profile) {
    return false;
  }
  const endpoint = profile.attributes
    .find((field) => field.label.toLowerCase().includes("endpoint"))
    ?.value?.trim()
    .toLowerCase();
  if (!endpoint) {
    return false;
  }
  return (
    endpoint.includes("localstack") ||
    endpoint.includes("localhost") ||
    endpoint.includes("127.0.0.1") ||
    /https?:\/\/192\.168\./.test(endpoint)
  );
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
  const tabSource =
    providerId === "azure"
      ? mockAzureWorkspaceTabs
      : providerId === "gcp"
        ? mockGcpWorkspaceTabs
        : mockWorkspaceTabs;
  mockState.session.workspaceTabs = !mockState.session.isLocked
    ? []
    : filterMockWorkspaceTabs(tabSource, providerId ?? "aws");
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

function clearMockWorkspaceSelections(): void {
  // Mirror the daemon's session.selectProvider / selectProfile selection clears
  // (unlock is session.unlock only; F-011).
  mockState.session.selectedAzureResourceGroup = undefined;
  mockState.session.selectedAzureVmId = undefined;
  mockState.session.selectedS3BucketName = undefined;
  mockState.session.selectedS3ObjectKey = undefined;
  mockState.session.s3PrefixFilter = "";
  mockState.session.selectedEc2Region = undefined;
  mockState.session.selectedEc2InstanceId = undefined;
  mockState.session.selectedGcpStorageBucket = undefined;
  mockState.session.gcpStoragePrefixFilter = undefined;
  mockState.session.selectedGcpFunction = undefined;
  mockState.session.selectedGcpComputeInstance = undefined;
}

function mockWriteModeCapability(
  actionId: string,
  label: string,
  writesEnabled: boolean,
): ActionCapability {
  return {
    actionId,
    label,
    enabled: writesEnabled,
    reason: writesEnabled
      ? undefined
      : "Turn on write mode from the top bar to run mutating actions.",
    reasonCode: writesEnabled ? undefined : "write_mode_required",
  };
}

function buildMockActionCapabilities(
  providerId: string | undefined,
  writesEnabled: boolean,
): Record<string, ActionCapability[]> {
  if (providerId === "gcp") {
    return {
      storage: [
        mockWriteModeCapability("uploadObject", "Upload object", writesEnabled),
        mockWriteModeCapability("deleteObject", "Delete object", writesEnabled),
      ],
      compute: [
        mockWriteModeCapability("startInstance", "Start instance", writesEnabled),
        mockWriteModeCapability("stopInstance", "Stop instance", writesEnabled),
      ],
      functions: [mockWriteModeCapability("invoke", "Invoke function", writesEnabled)],
    };
  }
  if (providerId === "aws") {
    return {
      rds: [
        mockWriteModeCapability("startInstance", "Start instance", writesEnabled),
        mockWriteModeCapability("stopInstance", "Stop instance", writesEnabled),
        mockWriteModeCapability("rebootInstance", "Reboot instance", writesEnabled),
      ],
      ecs: [
        mockWriteModeCapability("forceNewDeployment", "Force new deployment", writesEnabled),
      ],
      dynamodb: [
        mockWriteModeCapability("putItem", "Put item", writesEnabled),
        mockWriteModeCapability("deleteItem", "Delete item", writesEnabled),
      ],
    };
  }
  if (providerId === "azure") {
    return {
      queues: [mockWriteModeCapability("purge", "Purge queue", writesEnabled)],
      keyvault: [
        mockWriteModeCapability("setSecret", "Set secret", writesEnabled),
        mockWriteModeCapability("revealSecret", "Reveal secret", writesEnabled),
      ],
    };
  }
  return {};
}

const sessionLockedForSelectMessage =
  "Close the active workspace with session.unlock before changing provider or profile.";

function setCurrentProvider(providerId: string): void {
  // Real daemon refuses select while locked (F-011); unlock is session.unlock.
  if (mockState.session.isLocked) {
    throw new Error(sessionLockedForSelectMessage);
  }
  mockState.session.currentProviderId = providerId;
  mockState.session.selectedProfileId = undefined;
  mockState.session.selectedAuthMethod = undefined;
  clearMockWorkspaceSelections();
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
  {
    providerId: "gcp",
    serviceId: "gcp-storage",
    label: "Cloud Storage",
    summary: "GCS buckets and object browser via gcloud.",
    detail: "Lists Cloud Storage buckets and browses objects under a selected prefix.",
    category: "service",
    domain: "storage",
    inventoryScope: "gcs",
    enabled: true,
  },
  {
    providerId: "gcp",
    serviceId: "gcp-compute",
    label: "Compute Engine",
    summary: "VM instance inventory via gcloud.",
    detail: "Lists Compute Engine instances for the open gcloud configuration.",
    category: "service",
    domain: "compute",
    inventoryScope: "gce",
    enabled: true,
  },
  {
    providerId: "gcp",
    serviceId: "gcp-functions",
    label: "Cloud Functions",
    summary: "Function inventory via gcloud (1st and 2nd gen).",
    detail: "Lists Cloud Functions for the open gcloud configuration.",
    category: "service",
    domain: "compute",
    inventoryScope: "gcf",
    enabled: true,
  },
  {
    providerId: "gcp",
    serviceId: "gcp-gke",
    label: "GKE",
    summary: "Kubernetes cluster inventory via gcloud.",
    detail: "Lists Google Kubernetes Engine clusters.",
    category: "service",
    domain: "compute",
    inventoryScope: "gke",
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
      case "eks":
        return workspace.eksClusters.length;
      case "cloudformation":
        return workspace.cloudFormationStacks.length;
      case "eventbridge":
        return workspace.eventBridgeBuses.length;
      case "route53":
        return workspace.route53HostedZones.length;
      case "elb":
        return workspace.elbLoadBalancers.length;
      case "kms":
        return workspace.kmsKeys.length;
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
  if (providerId === "gcp") {
    switch (serviceId) {
      case "gcp-storage":
        return (workspace.gcpStorageBuckets ?? []).length;
      case "gcp-compute":
        return (workspace.gcpComputeInstances ?? []).length;
      case "gcp-functions":
        return (workspace.gcpFunctions ?? []).length;
      case "gcp-gke":
        return (workspace.gcpGkeClusters ?? []).length;
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
  const isGcpWorkspace = provider?.providerId === "gcp";
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
    awsWriteTargetIsLocal:
      isAWSWorkspace && mockState.session.isLocked && mockAwsWriteTargetIsLocal(profile),
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
    gcpWriteCapable: isGcpWorkspace && mockState.session.isLocked,
    gcpWriteModeEnabled:
      isGcpWorkspace && mockState.session.isLocked && Boolean(mockState.session.gcpWriteModeEnabled),
    gcpWritesEnabled:
      isGcpWorkspace &&
      mockState.session.isLocked &&
      Boolean(mockState.session.gcpWriteModeEnabled),
    actionCapabilities: buildMockActionCapabilities(
      provider?.providerId,
      isGcpWorkspace
        ? Boolean(
            isGcpWorkspace &&
              mockState.session.isLocked &&
              Boolean(mockState.session.gcpWriteModeEnabled),
          )
        : isAzureWorkspace
          ? Boolean(
              mockState.session.isLocked && Boolean(mockState.session.azureWriteModeEnabled),
            )
          : Boolean(mockState.session.isLocked && Boolean(mockState.session.awsWriteModeEnabled)),
    ),
    selectedGcpStorageBucket: isGcpWorkspace
      ? mockState.session.selectedGcpStorageBucket ?? mockGcpStorageBuckets[0]?.name
      : undefined,
    gcpStoragePrefixFilter: isGcpWorkspace ? mockState.session.gcpStoragePrefixFilter ?? "" : undefined,
    gcpStorageStatusMessage: isGcpWorkspace
      ? mockState.session.selectedGcpStorageBucket || mockGcpStorageBuckets[0]
        ? `Loaded ${mockGcpStorageObjects.length} object(s) from ${
            mockState.session.selectedGcpStorageBucket ?? mockGcpStorageBuckets[0]?.name
          }.`
        : `Loaded ${mockGcpStorageBuckets.length} Cloud Storage bucket(s) via gcloud.`
      : undefined,
    gcpStorageBuckets: isGcpWorkspace ? mockGcpStorageBuckets : [],
    gcpStorageObjects: isGcpWorkspace ? mockGcpStorageObjects : [],
    gcpStorageObjectsNextToken: isGcpWorkspace ? mockGcpStorageObjectsNextToken : undefined,
    gcpStorageObjectsHasMore: isGcpWorkspace ? mockGcpStorageObjectsHasMore : undefined,
    selectedGcpComputeInstance: isGcpWorkspace
      ? mockState.session.selectedGcpComputeInstance ?? mockGcpComputeInstances[0]?.name
      : undefined,
    gcpComputeStatusMessage: isGcpWorkspace
      ? `Loaded ${mockGcpComputeInstances.length} Compute Engine instance(s) via gcloud.`
      : undefined,
    gcpComputeInstances: isGcpWorkspace ? mockGcpComputeInstances : [],
    selectedGcpFunction: isGcpWorkspace ? mockState.session.selectedGcpFunction : undefined,
    gcpFunctionsStatusMessage: isGcpWorkspace
      ? `Loaded ${mockGcpFunctions.length} Cloud Function(s) via gcloud.`
      : undefined,
    gcpFunctions: isGcpWorkspace ? mockGcpFunctions : [],
    gcpGkeStatusMessage: isGcpWorkspace
      ? `Loaded ${mockGcpGkeClusters.length} GKE cluster(s) via gcloud.`
      : undefined,
    gcpGkeClusters: isGcpWorkspace ? mockGcpGkeClusters : [],
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
    azureInventory: isAzureWorkspace
      ? {
          storage: { loaded: true },
          webapps: { loaded: true },
          loganalytics: { loaded: true },
          waf: { loaded: true },
          frontdoor: { loaded: true, detailLoaded: true },
          functions: { loaded: true },
          keyvault: { loaded: true },
          cosmos: { loaded: true },
          postgres: { loaded: true },
          queues: { loaded: true },
          entra: { loaded: true },
        }
      : undefined,
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
    selectedEksRegion: isAWSWorkspace
      ? mockState.session.selectedEksRegion ?? mockWorkspaceRegions[0]
      : undefined,
    selectedEksClusterName: isAWSWorkspace
      ? mockState.session.selectedEksClusterName ?? mockWorkspaceEKSClusters[0]?.clusterName
      : undefined,
    eksStatusMessage: isAWSWorkspace
      ? `Loaded ${mockWorkspaceEKSClusters.length} EKS clusters from ${mockState.session.selectedEksRegion ?? mockWorkspaceRegions[0]}.`
      : "EKS inventory is only available for open AWS workspaces.",
    eksRegions: isAWSWorkspace ? mockWorkspaceRegions : [],
    eksClusters: isAWSWorkspace ? mockWorkspaceEKSClusters : [],
    eksNodeGroups: isAWSWorkspace ? mockWorkspaceEKSNodeGroups : [],
    selectedCloudFormationRegion: isAWSWorkspace
      ? mockState.session.selectedCloudFormationRegion ?? mockWorkspaceRegions[0]
      : undefined,
    selectedCloudFormationStackName: isAWSWorkspace
      ? mockState.session.selectedCloudFormationStackName ?? mockWorkspaceCloudFormationStacks[0]?.stackName
      : undefined,
    cloudFormationStatusMessage: isAWSWorkspace
      ? `Loaded ${mockWorkspaceCloudFormationStacks.length} CloudFormation stacks from ${mockState.session.selectedCloudFormationRegion ?? mockWorkspaceRegions[0]}.`
      : "CloudFormation inventory is only available for open AWS workspaces.",
    cloudFormationRegions: isAWSWorkspace ? mockWorkspaceRegions : [],
    cloudFormationStacks: isAWSWorkspace ? mockWorkspaceCloudFormationStacks : [],
    cloudFormationStackEvents: isAWSWorkspace ? mockWorkspaceCloudFormationStackEvents : [],
    selectedEventBridgeRegion: isAWSWorkspace
      ? mockState.session.selectedEventBridgeRegion ?? mockWorkspaceRegions[0]
      : undefined,
    selectedEventBridgeBusName: isAWSWorkspace
      ? mockState.session.selectedEventBridgeBusName ?? mockWorkspaceEventBridgeBuses[0]?.name
      : undefined,
    eventBridgeStatusMessage: isAWSWorkspace
      ? `Loaded ${mockWorkspaceEventBridgeBuses.length} EventBridge buses from ${mockState.session.selectedEventBridgeRegion ?? mockWorkspaceRegions[0]}.`
      : "EventBridge inventory is only available for open AWS workspaces.",
    eventBridgeRegions: isAWSWorkspace ? mockWorkspaceRegions : [],
    eventBridgeBuses: isAWSWorkspace ? mockWorkspaceEventBridgeBuses : [],
    eventBridgeRules: isAWSWorkspace ? mockWorkspaceEventBridgeRules : [],
    selectedRoute53HostedZoneId: isAWSWorkspace
      ? mockState.session.selectedRoute53HostedZoneId ?? mockWorkspaceRoute53HostedZones[0]?.hostedZoneId
      : undefined,
    route53StatusMessage: isAWSWorkspace
      ? `Loaded ${mockWorkspaceRoute53HostedZones.length} Route 53 hosted zones.`
      : "Route 53 inventory is only available for open AWS workspaces.",
    route53HostedZones: isAWSWorkspace ? mockWorkspaceRoute53HostedZones : [],
    route53ResourceRecordSets: isAWSWorkspace ? mockWorkspaceRoute53ResourceRecordSets : [],
    selectedElbRegion: isAWSWorkspace
      ? mockState.session.selectedElbRegion ?? mockWorkspaceRegions[0]
      : undefined,
    selectedElbLoadBalancerArn: isAWSWorkspace
      ? mockState.session.selectedElbLoadBalancerArn ?? mockWorkspaceElbLoadBalancers[0]?.loadBalancerArn
      : undefined,
    elbStatusMessage: isAWSWorkspace
      ? `Loaded ${mockWorkspaceElbLoadBalancers.length} load balancers from ${mockState.session.selectedElbRegion ?? mockWorkspaceRegions[0]}.`
      : "Load balancer inventory is only available for open AWS workspaces.",
    elbRegions: isAWSWorkspace ? mockWorkspaceRegions : [],
    elbLoadBalancers: isAWSWorkspace ? mockWorkspaceElbLoadBalancers : [],
    elbTargetGroups: isAWSWorkspace ? mockWorkspaceElbTargetGroups : [],
    selectedKmsRegion: isAWSWorkspace
      ? mockState.session.selectedKmsRegion ?? mockWorkspaceRegions[0]
      : undefined,
    selectedKmsKeyId: isAWSWorkspace
      ? mockState.session.selectedKmsKeyId ?? mockWorkspaceKmsKeys[0]?.keyId
      : undefined,
    kmsStatusMessage: isAWSWorkspace
      ? `Loaded ${mockWorkspaceKmsKeys.length} KMS keys from ${mockState.session.selectedKmsRegion ?? mockWorkspaceRegions[0]}.`
      : "KMS inventory is only available for open AWS workspaces.",
    kmsRegions: isAWSWorkspace ? mockWorkspaceRegions : [],
    kmsKeys: isAWSWorkspace ? mockWorkspaceKmsKeys : [],
    kmsAliases: isAWSWorkspace ? mockWorkspaceKmsAliases : [],
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

function buildMockAwsInventorySlice(scope: AwsInventoryScope): AwsInventorySlice {
  const workspace = buildMockWorkspace();
  switch (scope) {
    case "s3":
      return {
        providerId: "aws",
        scope,
        payload: {
          selectedS3BucketName: workspace.selectedS3BucketName,
          selectedS3ObjectKey: workspace.selectedS3ObjectKey,
          s3PrefixFilter: workspace.s3PrefixFilter,
          s3StatusMessage: workspace.s3StatusMessage,
          s3Buckets: workspace.s3Buckets,
          s3Objects: workspace.s3Objects,
          s3ObjectsNextToken: workspace.s3ObjectsNextToken,
          s3ObjectsHasMore: workspace.s3ObjectsHasMore,
          s3ObjectMetadata: workspace.s3ObjectMetadata,
          s3ExportSnippets: workspace.s3ExportSnippets,
        },
      };
    case "ec2":
      return {
        providerId: "aws",
        scope,
        payload: {
          selectedEc2Region: workspace.selectedEc2Region,
          selectedEc2InstanceId: workspace.selectedEc2InstanceId,
          ec2StatusMessage: workspace.ec2StatusMessage,
          ec2Regions: workspace.ec2Regions,
          ec2Instances: workspace.ec2Instances,
        },
      };
    case "lambda":
      return {
        providerId: "aws",
        scope,
        payload: {
          selectedLambdaRegion: workspace.selectedLambdaRegion,
          selectedLambdaFunctionName: workspace.selectedLambdaFunctionName,
          lambdaStatusMessage: workspace.lambdaStatusMessage,
          lambdaRegions: workspace.lambdaRegions,
          lambdaFunctions: workspace.lambdaFunctions,
        },
      };
    case "dynamodb":
      return {
        providerId: "aws",
        scope,
        payload: {
          selectedDynamodbRegion: workspace.selectedDynamodbRegion,
          selectedDynamodbTableName: workspace.selectedDynamodbTableName,
          dynamodbStatusMessage: workspace.dynamodbStatusMessage,
          dynamodbRegions: workspace.dynamodbRegions,
          dynamodbTables: workspace.dynamodbTables,
        },
      };
    case "sqs":
      return {
        providerId: "aws",
        scope,
        payload: {
          selectedSqsRegion: workspace.selectedSqsRegion,
          selectedSqsQueueUrl: workspace.selectedSqsQueueUrl,
          sqsStatusMessage: workspace.sqsStatusMessage,
          sqsRegions: workspace.sqsRegions,
          sqsQueues: workspace.sqsQueues,
        },
      };
    case "sns":
      return {
        providerId: "aws",
        scope,
        payload: {
          selectedSnsRegion: workspace.selectedSnsRegion,
          selectedSnsTopicArn: workspace.selectedSnsTopicArn,
          snsStatusMessage: workspace.snsStatusMessage,
          snsRegions: workspace.snsRegions,
          snsTopics: workspace.snsTopics,
        },
      };
    case "rds":
      return {
        providerId: "aws",
        scope,
        payload: {
          selectedRdsRegion: workspace.selectedRdsRegion,
          selectedRdsInstanceId: workspace.selectedRdsInstanceId,
          rdsStatusMessage: workspace.rdsStatusMessage,
          rdsRegions: workspace.rdsRegions,
          rdsInstances: workspace.rdsInstances,
        },
      };
    case "ecs":
      return {
        providerId: "aws",
        scope,
        payload: {
          selectedEcsRegion: workspace.selectedEcsRegion,
          selectedEcsClusterArn: workspace.selectedEcsClusterArn,
          selectedEcsServiceArn: workspace.selectedEcsServiceArn,
          selectedEcsTaskArn: workspace.selectedEcsTaskArn,
          ecsStatusMessage: workspace.ecsStatusMessage,
          ecsRegions: workspace.ecsRegions,
          ecsClusters: workspace.ecsClusters,
          ecsServices: workspace.ecsServices,
          ecsTasks: workspace.ecsTasks,
        },
      };
    case "eks":
      return {
        providerId: "aws",
        scope,
        payload: {
          selectedEksRegion: workspace.selectedEksRegion,
          selectedEksClusterName: workspace.selectedEksClusterName,
          eksStatusMessage: workspace.eksStatusMessage,
          eksRegions: workspace.eksRegions,
          eksClusters: workspace.eksClusters,
          eksNodeGroups: workspace.eksNodeGroups,
        },
      };
    case "cloudformation":
      return {
        providerId: "aws",
        scope,
        payload: {
          selectedCloudFormationRegion: workspace.selectedCloudFormationRegion,
          selectedCloudFormationStackName: workspace.selectedCloudFormationStackName,
          cloudFormationStatusMessage: workspace.cloudFormationStatusMessage,
          cloudFormationRegions: workspace.cloudFormationRegions,
          cloudFormationStacks: workspace.cloudFormationStacks,
          cloudFormationStackEvents: workspace.cloudFormationStackEvents,
        },
      };
    case "eventbridge":
      return {
        providerId: "aws",
        scope,
        payload: {
          selectedEventBridgeRegion: workspace.selectedEventBridgeRegion,
          selectedEventBridgeBusName: workspace.selectedEventBridgeBusName,
          eventBridgeStatusMessage: workspace.eventBridgeStatusMessage,
          eventBridgeRegions: workspace.eventBridgeRegions,
          eventBridgeBuses: workspace.eventBridgeBuses,
          eventBridgeRules: workspace.eventBridgeRules,
        },
      };
    case "route53":
      return {
        providerId: "aws",
        scope,
        payload: {
          selectedRoute53HostedZoneId: workspace.selectedRoute53HostedZoneId,
          route53StatusMessage: workspace.route53StatusMessage,
          route53HostedZones: workspace.route53HostedZones,
          route53ResourceRecordSets: workspace.route53ResourceRecordSets,
        },
      };
    case "elb":
      return {
        providerId: "aws",
        scope,
        payload: {
          selectedElbRegion: workspace.selectedElbRegion,
          selectedElbLoadBalancerArn: workspace.selectedElbLoadBalancerArn,
          elbStatusMessage: workspace.elbStatusMessage,
          elbRegions: workspace.elbRegions,
          elbLoadBalancers: workspace.elbLoadBalancers,
          elbTargetGroups: workspace.elbTargetGroups,
        },
      };
    case "kms":
      return {
        providerId: "aws",
        scope,
        payload: {
          selectedKmsRegion: workspace.selectedKmsRegion,
          selectedKmsKeyId: workspace.selectedKmsKeyId,
          kmsStatusMessage: workspace.kmsStatusMessage,
          kmsRegions: workspace.kmsRegions,
          kmsKeys: workspace.kmsKeys,
          kmsAliases: workspace.kmsAliases,
        },
      };
    case "apigateway":
      return {
        providerId: "aws",
        scope,
        payload: {
          selectedApiGatewayRegion: workspace.selectedApiGatewayRegion,
          selectedApiGatewayApiKey: workspace.selectedApiGatewayApiKey,
          apiGatewayStatusMessage: workspace.apiGatewayStatusMessage,
          apiGatewayRegions: workspace.apiGatewayRegions,
          apiGatewayApis: workspace.apiGatewayApis,
          apiGatewayStages: workspace.apiGatewayStages,
        },
      };
    case "secrets":
      return {
        providerId: "aws",
        scope,
        payload: {
          selectedSecretsManagerRegion: workspace.selectedSecretsManagerRegion,
          selectedSecretsManagerName: workspace.selectedSecretsManagerName,
          secretsManagerStatusMessage: workspace.secretsManagerStatusMessage,
          secretsManagerRegions: workspace.secretsManagerRegions,
          secretsManagerSecrets: workspace.secretsManagerSecrets,
        },
      };
    case "logs":
      return {
        providerId: "aws",
        scope,
        payload: {
          selectedLogsRegion: workspace.selectedLogsRegion,
          selectedLogGroupName: workspace.selectedLogGroupName,
          logsStatusMessage: workspace.logsStatusMessage,
          logsRegions: workspace.logsRegions,
          logGroups: workspace.logGroups,
        },
      };
    case "iam":
      return {
        providerId: "aws",
        scope,
        payload: {
          selectedIamRoleName: workspace.selectedIamRoleName,
          iamStatusMessage: workspace.iamStatusMessage,
          iamRoles: workspace.iamRoles,
          iamPolicies: workspace.iamPolicies,
        },
      };
  }
}

export type MockRpcHandler = (
  params: Record<string, unknown>,
  method: string,
) => Promise<unknown>;

function registerMockHandlers(): Map<string, MockRpcHandler> {
  const handlers = new Map<string, MockRpcHandler>();
  const register = (name: string, handler: MockRpcHandler) => {
    if (handlers.has(name)) {
      throw new Error(`duplicate mock RPC registration: ${name}`);
    }
    handlers.set(name, handler);
  };

  const handle_providers_list : MockRpcHandler = async (params, method) => {
    return Promise.resolve(
      mockState.providers.filter((provider) =>
        isProviderEnabled(mockPreferencesState(), provider.providerId),
      ),
    );
  };
  register("providers.list", handle_providers_list);

  const handle_profiles_list : MockRpcHandler = async (params, method) => {
    return Promise.resolve(filteredProfiles(params.providerId as string | undefined));
  };
  register("profiles.list", handle_profiles_list);

  const handle_session_get : MockRpcHandler = async (params, method) => {
    rebuildSessionDerivedState();
    return Promise.resolve(mockState.session);
  };
  register("session.get", handle_session_get);

  const handle_workspace_get : MockRpcHandler = async (params, method) => {
    rebuildSessionDerivedState();
    return Promise.resolve(buildMockWorkspace());
  };
  register("workspace.get", handle_workspace_get);

  const handle_aws_inventory_get : MockRpcHandler = async (params, method) => {
    rebuildSessionDerivedState();
    const requestedScope = String(params.scope ?? "").trim().toLowerCase();
    const scope = awsInventoryScopeForTab(requestedScope);
    if (!scope) {
      return Promise.reject(new Error(`unknown AWS inventory scope ${requestedScope}`));
    }
    return Promise.resolve(buildMockAwsInventorySlice(scope));
  };
  register("aws.inventory.get", handle_aws_inventory_get);

  const handle_azure_inventory_get : MockRpcHandler = async (params, method) => {
    rebuildSessionDerivedState();
    return Promise.resolve(buildMockWorkspace());
  };
  register("azure.inventory.get", handle_azure_inventory_get);

  const handle_runtime_get : MockRpcHandler = async (params, method) => {
    const workspace = buildMockWorkspace();
    return Promise.resolve({
      dockerRuntime: workspace.dockerRuntime,
      dockerResources: workspace.dockerResources,
      emulatorSummaries: workspace.emulatorSummaries,
      dockerDiagnostics: workspace.dockerDiagnostics,
    });
  };
  register("runtime.get", handle_runtime_get);

  const handle_docker_runtime_get : MockRpcHandler = async (params, method) => {
    return Promise.resolve(buildMockWorkspace().dockerRuntime);
  };
  register("docker.runtime.get", handle_docker_runtime_get);

  const handle_docker_resources_list : MockRpcHandler = async (params, method) => {
    return Promise.resolve(buildMockWorkspace().dockerResources);
  };
  register("docker.resources.list", handle_docker_resources_list);

  const handle_emulators_list : MockRpcHandler = async (params, method) => {
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
    ]);
  };
  register("emulators.list", handle_emulators_list);

  const handle_emulators_prepareProfile : MockRpcHandler = async (params, method) => {
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
      });
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
    });
  };
  register("emulators.prepareProfile", handle_emulators_prepareProfile);

  const handle_emulators_start : MockRpcHandler = async (params, method) => {
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
      });
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
    });
  };
  register("emulators.start", handle_emulators_start);

  const handle_emulators_stop : MockRpcHandler = async (params, method) => {
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
      });
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
    });
  };
  register("emulators.stop", handle_emulators_stop);

  const handle_emulators_logs : MockRpcHandler = async (params, method) => {
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
      });
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
    });
  };
  register("emulators.logs", handle_emulators_logs);

  const handle_aws_s3_selectBucket : MockRpcHandler = async (params, method) => {
    mockState.session.selectedS3BucketName = String(params.bucketName ?? "");
    mockState.session.selectedS3ObjectKey = undefined;
    appendLog("info", `Selected S3 bucket ${params.bucketName}.`);
    return Promise.resolve(buildMockWorkspace());
  };
  register("aws.s3.selectBucket", handle_aws_s3_selectBucket);

  const handle_aws_s3_selectObject : MockRpcHandler = async (params, method) => {
    mockState.session.selectedS3ObjectKey = String(params.objectKey ?? "");
    appendLog("info", `Selected S3 object ${params.objectKey}.`);
    return Promise.resolve(buildMockWorkspace());
  };
  register("aws.s3.selectObject", handle_aws_s3_selectObject);

  const handle_aws_s3_setPrefixFilter : MockRpcHandler = async (params, method) => {
    mockState.session.s3PrefixFilter = String(params.prefix ?? "");
    mockState.session.selectedS3ObjectKey = undefined;
    appendLog("info", `Updated S3 prefix filter to ${params.prefix ?? ""}.`);
    return Promise.resolve(buildMockWorkspace());
  };
  register("aws.s3.setPrefixFilter", handle_aws_s3_setPrefixFilter);

  const handle_aws_s3_loadMoreObjects : MockRpcHandler = async (params, method) => {
    mockWorkspaceObjects.push({
      key: "archive/older.json",
      size: "1 KB",
      modifiedAt: "2026-03-01T00:00:00Z",
      storageClass: "STANDARD",
    });
    const workspace = buildMockWorkspace();
    workspace.s3ObjectsHasMore = false;
    workspace.s3ObjectsNextToken = undefined;
    workspace.s3StatusMessage = `Loaded 1 more item(s). End of list.`;
    appendLog("info", "Loaded more S3 objects.");
    return Promise.resolve(workspace);
  };
  register("aws.s3.loadMoreObjects", handle_aws_s3_loadMoreObjects);

  const handle_aws_s3_uploadObject : MockRpcHandler = async (params, method) => {
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
    return Promise.resolve(job);
  };
  register("aws.s3.uploadObject", handle_aws_s3_uploadObject);

  const handle_aws_s3_deleteObject : MockRpcHandler = async (params, method) => {
    const objectKey = String(params.objectKey ?? mockState.session.selectedS3ObjectKey ?? "");
    mockState.session.selectedS3ObjectKey = undefined;
    appendLog("success", `Deleted object ${objectKey}.`);
    return Promise.resolve(buildMockWorkspace());
  };
  register("aws.s3.deleteObject", handle_aws_s3_deleteObject);

  const handle_aws_s3_createBucket : MockRpcHandler = async (params, method) => {
    const bucketName = String(params.bucketName ?? "new-bucket");
    mockWorkspaceBuckets.push({
      name: bucketName,
      summary: `Bucket ${bucketName} created in the mock workspace.`,
    });
    mockState.session.selectedS3BucketName = bucketName;
    mockState.session.selectedS3ObjectKey = undefined;
    appendLog("success", `Created S3 bucket ${bucketName}.`);
    return Promise.resolve(buildMockWorkspace());
  };
  register("aws.s3.createBucket", handle_aws_s3_createBucket);

  const handle_aws_s3_copyObject : MockRpcHandler = async (params, method) => {
    const sourceObjectKey = String(params.sourceObjectKey ?? mockState.session.selectedS3ObjectKey ?? "");
    const destinationObjectKey = String(params.destinationObjectKey ?? `${sourceObjectKey}-copy`);
    const bucketName = mockState.session.selectedS3BucketName ?? mockWorkspaceBuckets[0]?.name;
    if (bucketName) {
      mockWorkspaceObjects.push({
        key: destinationObjectKey,
        size: "12 MB",
        modifiedAt: "2026-07-08T12:00:00Z",
        storageClass: "STANDARD",
      });
      mockState.session.selectedS3ObjectKey = destinationObjectKey;
    }
    appendLog("success", `Copied ${sourceObjectKey} to ${destinationObjectKey}.`);
    return Promise.resolve(buildMockWorkspace());
  };
  register("aws.s3.copyObject", handle_aws_s3_copyObject);

  const handle_aws_s3_createFolderPrefix : MockRpcHandler = async (params, method) => {
    const folderPrefix = String(params.folderPrefix ?? "folder/");
    const bucketName = mockState.session.selectedS3BucketName ?? mockWorkspaceBuckets[0]?.name;
    if (bucketName) {
      mockWorkspaceObjects.push({
        key: folderPrefix.endsWith("/") ? folderPrefix : `${folderPrefix}/`,
        size: "0 B",
        modifiedAt: "2026-07-08T12:00:00Z",
        storageClass: "STANDARD",
      });
      mockState.session.s3PrefixFilter = folderPrefix.endsWith("/") ? folderPrefix : `${folderPrefix}/`;
    }
    appendLog("success", `Created folder prefix ${folderPrefix}.`);
    return Promise.resolve(buildMockWorkspace());
  };
  register("aws.s3.createFolderPrefix", handle_aws_s3_createFolderPrefix);

  const handle_aws_s3_presignObject : MockRpcHandler = async (params, method) => {
    const objectKey = mockState.session.selectedS3ObjectKey ?? mockWorkspaceObjects[0]?.key;
    const bucketName = mockState.session.selectedS3BucketName ?? mockWorkspaceBuckets[0]?.name;
    const durationSeconds = Number(params.durationSeconds ?? 3600);
    const job: JobStatus = {
      jobId: `job-${Date.now()}`,
      label: "S3 Signed URL",
      kind: "aws.s3.presign",
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
    return Promise.resolve(job);
  };
  register("aws.s3.presignObject", handle_aws_s3_presignObject);

  const handle_aws_s3_analyseUrl : MockRpcHandler = async (params, method) => {
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
    });
  };
  register("aws.s3.analyseUrl", handle_aws_s3_analyseUrl);

  const handle_aws_s3_validateUrl : MockRpcHandler = async (params, method) => {
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
    return Promise.resolve(job);
  };
  register("aws.s3.validateUrl", handle_aws_s3_validateUrl);

  const handle_aws_ec2_selectRegion : MockRpcHandler = async (params, method) => {
    mockState.session.selectedEc2Region = String(params.region ?? "");
    mockState.session.selectedEc2InstanceId = undefined;
    appendLog("info", `Selected EC2 region ${params.region}.`);
    return Promise.resolve(buildMockWorkspace());
  };
  register("aws.ec2.selectRegion", handle_aws_ec2_selectRegion);

  const handle_aws_ec2_selectInstance : MockRpcHandler = async (params, method) => {
    mockState.session.selectedEc2InstanceId = String(params.instanceId ?? "");
    appendLog("info", `Selected EC2 instance ${params.instanceId}.`);
    return Promise.resolve(buildMockWorkspace());
  };
  register("aws.ec2.selectInstance", handle_aws_ec2_selectInstance);

  const handle_aws_ec2_invokeAction : MockRpcHandler = async (params, method) => {
    const action = String(params.action ?? "");
    const instanceId =
      String(params.instanceId ?? "") ||
      mockState.session.selectedEc2InstanceId ||
      mockWorkspaceInstances[0]?.instanceId;
    const region = mockState.session.selectedEc2Region ?? mockWorkspaceRegions[0];
    const job: JobStatus = {
      jobId: `job-${Date.now()}`,
      label: "EC2 Action",
      kind: "aws.ec2.action",
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
    return Promise.resolve(job);
  };
  register("aws.ec2.invokeAction", handle_aws_ec2_invokeAction);

  const handle_aws_ec2_runInstances : MockRpcHandler = async (params, method) => {
    const region = mockState.session.selectedEc2Region ?? mockWorkspaceRegions[0];
    const instanceId = "i-mocklaunch01";
    mockWorkspaceInstances.push({
      instanceId,
      name: "launched-instance",
      state: "pending",
      instanceType: String(params.instanceType ?? "t3.micro"),
      availabilityZone: `${region}a`,
      privateIp: "10.0.99.1",
      vpcId: "vpc-0sandbox001",
      subnetId: "subnet-0launch001",
      keyName: "sandbox-key",
      platformDetails: "Linux/UNIX",
      architecture: "x86_64",
      launchTime: new Date().toISOString(),
      securityGroups: ["app-sg (sg-0123456789abcdef0)"],
      tags: [{ label: "Name", value: "launched-instance" }],
    });
    mockState.session.selectedEc2InstanceId = instanceId;
    appendLog("success", `Launched EC2 instance ${instanceId} in ${region}.`);
    return Promise.resolve(buildMockWorkspace());
  };
  register("aws.ec2.runInstances", handle_aws_ec2_runInstances);

  const handle_aws_ec2_terminateInstances : MockRpcHandler = async (params, method) => {
    const instanceId =
      String(params.instanceId ?? "") ||
      mockState.session.selectedEc2InstanceId ||
      mockWorkspaceInstances[0]?.instanceId;
    const region = mockState.session.selectedEc2Region ?? mockWorkspaceRegions[0];
    const job: JobStatus = {
      jobId: `job-${Date.now()}`,
      label: "EC2 Terminate",
      kind: "aws.ec2.action",
      status: "queued",
      message: `Queueing EC2 terminate for ${instanceId} in ${region}.`,
    };
    setTimeout(() => {
      const terminateIndex = mockWorkspaceInstances.findIndex(
        (instance) => instance.instanceId === instanceId,
      );
      if (terminateIndex >= 0) {
        mockWorkspaceInstances.splice(terminateIndex, 1);
      }
      if (mockState.session.selectedEc2InstanceId === instanceId) {
        mockState.session.selectedEc2InstanceId = undefined;
      }
      appendLog("success", `Terminated EC2 instance ${instanceId}.`);
      emitMockEvent("job.updated", {
        ...job,
        status: "completed",
        message: `Terminated EC2 instance ${instanceId}.`,
        completedAt: new Date().toISOString(),
      });
    }, 30);
    return Promise.resolve(job);
  };
  register("aws.ec2.terminateInstances", handle_aws_ec2_terminateInstances);

  const handle_aws_dynamodb_selectRegion : MockRpcHandler = async (params, method) => {
    mockState.session.selectedDynamodbRegion = String(params.region ?? "");
    mockState.session.selectedDynamodbTableName = undefined;
    appendLog("info", `Selected DynamoDB region ${params.region}.`);
    return Promise.resolve(buildMockWorkspace());
  };
  register("aws.dynamodb.selectRegion", handle_aws_dynamodb_selectRegion);

  const handle_aws_dynamodb_selectTable : MockRpcHandler = async (params, method) => {
    mockState.session.selectedDynamodbTableName = String(params.tableName ?? "");
    appendLog("info", `Selected DynamoDB table ${params.tableName}.`);
    return Promise.resolve(buildMockWorkspace());
  };
  register("aws.dynamodb.selectTable", handle_aws_dynamodb_selectTable);

  const handle_aws_sqs_selectRegion : MockRpcHandler = async (params, method) => {
    mockState.session.selectedSqsRegion = String(params.region ?? "");
    mockState.session.selectedSqsQueueUrl = undefined;
    appendLog("info", `Selected SQS region ${params.region}.`);
    return Promise.resolve(buildMockWorkspace());
  };
  register("aws.sqs.selectRegion", handle_aws_sqs_selectRegion);

  const handle_aws_sqs_selectQueue : MockRpcHandler = async (params, method) => {
    mockState.session.selectedSqsQueueUrl = String(params.queueUrl ?? "");
    appendLog("info", `Selected SQS queue ${params.queueUrl}.`);
    return Promise.resolve(buildMockWorkspace());
  };
  register("aws.sqs.selectQueue", handle_aws_sqs_selectQueue);

  const handle_aws_sqs_peek : MockRpcHandler = async (params, method) => {
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
    });
  };
  register("aws.sqs.peek", handle_aws_sqs_peek);

  const handle_aws_sqs_sendMessage : MockRpcHandler = async (params, method) => {
    return Promise.resolve({
      queueUrl: String(params.queueUrl ?? ""),
      messageId: "mock-sent-001",
      summary: "Sent message mock-sent-001 to the queue.",
    });
  };
  register("aws.sqs.sendMessage", handle_aws_sqs_sendMessage);

  const handle_aws_sqs_createQueue : MockRpcHandler = async (params, method) => {
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
    return Promise.resolve(buildMockWorkspace());
  };
  register("aws.sqs.createQueue", handle_aws_sqs_createQueue);

  const handle_aws_sqs_purgeQueue : MockRpcHandler = async (params, method) => {
    if (!mockState.session.awsWriteModeEnabled) {
      return Promise.reject(new Error("SQS purge requires write mode to be enabled"));
    }
    const queueUrl = String(params.queueUrl ?? mockState.session.selectedSqsQueueUrl ?? "");
    mockState.session.selectedSqsQueueUrl = queueUrl;
    const queue = mockWorkspaceSQSQueues.find((candidate) => candidate.queueUrl === queueUrl);
    if (queue) {
      queue.approximateNumberOfMessages = 0;
      queue.approximateNumberOfMessagesNotVisible = 0;
      queue.approximateNumberOfMessagesDelayed = 0;
    }
    appendLog("success", `Purged all messages from SQS queue ${queue?.queueName || queueUrl}.`);
    return Promise.resolve(buildMockWorkspace());
  };
  register("aws.sqs.purgeQueue", handle_aws_sqs_purgeQueue);

  const handle_aws_sns_selectRegion : MockRpcHandler = async (params, method) => {
    mockState.session.selectedSnsRegion = String(params.region ?? "");
    mockState.session.selectedSnsTopicArn = undefined;
    appendLog("info", `Selected SNS region ${params.region}.`);
    return Promise.resolve(buildMockWorkspace());
  };
  register("aws.sns.selectRegion", handle_aws_sns_selectRegion);

  const handle_aws_sns_selectTopic : MockRpcHandler = async (params, method) => {
    mockState.session.selectedSnsTopicArn = String(params.topicArn ?? "");
    appendLog("info", `Selected SNS topic ${params.topicArn}.`);
    return Promise.resolve(buildMockWorkspace());
  };
  register("aws.sns.selectTopic", handle_aws_sns_selectTopic);

  const handle_aws_sns_publish : MockRpcHandler = async (params, method) => {
    return Promise.resolve({
      topicArn: String(params.topicArn ?? ""),
      messageId: "mock-publish-001",
      summary: "Published message mock-publish-001 to the topic.",
    });
  };
  register("aws.sns.publish", handle_aws_sns_publish);

  const handle_aws_sns_createTopic : MockRpcHandler = async (params, method) => {
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
    return Promise.resolve(buildMockWorkspace());
  };
  register("aws.sns.createTopic", handle_aws_sns_createTopic);

  const handle_aws_sns_createSubscription : MockRpcHandler = async (params, method) => {
    if (!mockState.session.awsWriteModeEnabled) {
      return Promise.reject(
        new Error("SNS create subscription requires write mode to be enabled"),
      );
    }
    const topicArn = String(params.topicArn ?? mockState.session.selectedSnsTopicArn ?? "");
    const protocol = String(params.protocol ?? "sqs");
    const endpoint = String(params.endpoint ?? "");
    const topic = mockWorkspaceSNSTopics.find((item) => item.topicArn === topicArn);
    if (topic) {
      topic.subscriptions = [
        ...(topic.subscriptions ?? []),
        {
          subscriptionArn: `${topicArn}:mock-sub`,
          protocol,
          endpoint,
        },
      ];
      topic.subscriptionsConfirmed = String(
        Number(topic.subscriptionsConfirmed ?? "0") + 1,
      );
    }
    mockState.session.selectedSnsTopicArn = topicArn;
    appendLog("success", `Created SNS subscription (${protocol}) for the topic.`);
    return Promise.resolve(buildMockWorkspace());
  };
  register("aws.sns.createSubscription", handle_aws_sns_createSubscription);

  const handle_aws_dynamodb_putItem : MockRpcHandler = async (params, method) => {
    appendLog("success", String(params.tableName ?? "table") + " updated.");
    return Promise.resolve(buildMockWorkspace());
  };
  register("aws.dynamodb.putItem", handle_aws_dynamodb_putItem);
  register("aws.dynamodb.deleteItem", handle_aws_dynamodb_putItem);

  const handle_aws_dynamodb_loadMoreItems : MockRpcHandler = async (params, method) => {
    const tableName =
      String(params.tableName ?? "") ||
      mockState.session.selectedDynamodbTableName ||
      mockWorkspaceDynamoDBTables[0]?.tableName ||
      "";
    const table = mockWorkspaceDynamoDBTables.find((entry) => entry.tableName === tableName);
    if (!table) {
      return Promise.reject(new Error(`DynamoDB table ${tableName} was not found in the mock inventory.`));
    }
    // Return only the next page on the selected table; UI merge appends client-side.
    const nextItems = [
      '{"orderId":"ord-003","customerId":"cust-9","createdAt":"2026-06-14T12:00:00Z","total":8.25}',
    ];
    table.sampleItemsNextToken = undefined;
    table.sampleItemsHasMore = false;
    mockState.session.selectedDynamodbTableName = tableName;
    const workspace = buildMockWorkspace();
    workspace.selectedDynamodbTableName = tableName;
    workspace.dynamodbTables = workspace.dynamodbTables.map((entry) =>
      entry.tableName === tableName
        ? {
            ...entry,
            sampleItems: nextItems,
            sampleItemsNextToken: undefined,
            sampleItemsHasMore: false,
          }
        : entry,
    );
    workspace.dynamodbStatusMessage = `Loaded ${nextItems.length} more sample item(s) from ${tableName}. End of scan.`;
    appendLog("info", `Loaded more sample items for DynamoDB table ${tableName}.`);
    return Promise.resolve(workspace);
  };
  register("aws.dynamodb.loadMoreItems", handle_aws_dynamodb_loadMoreItems);

  const handle_aws_dynamodb_queryItems: MockRpcHandler = async (params) => {
    const hashValue = String(params.hashValue ?? "").trim();
    if (!hashValue) {
      return Promise.reject(new Error("hash key name and value are required"));
    }
    const tableName =
      String(params.tableName ?? "") ||
      mockState.session.selectedDynamodbTableName ||
      mockWorkspaceDynamoDBTables[0]?.tableName ||
      "";
    const table =
      mockWorkspaceDynamoDBTables.find((entry) => entry.tableName === tableName) ??
      mockWorkspaceDynamoDBTables[0];
    const items = (table?.sampleItems ?? []).slice(0, 2);
    const result: AwsDynamoDBQueryResult = {
      tableName: table?.tableName ?? tableName,
      hashKey: String(params.hashKey ?? table?.hashKey ?? ""),
      hashValue,
      items,
      summary: `Queried ${items.length} item(s) from ${table?.tableName ?? tableName}.`,
    };
    if (params.rangeKey) {
      result.rangeKey = String(params.rangeKey);
      result.rangeValue = String(params.rangeValue ?? "");
    }
    appendLog("info", result.summary);
    return Promise.resolve(result);
  };
  register("aws.dynamodb.queryItems", handle_aws_dynamodb_queryItems);

  const handle_aws_rds_selectRegion : MockRpcHandler = async (params, method) => {
    mockState.session.selectedRdsRegion = String(params.region ?? "");
    mockState.session.selectedRdsInstanceId = undefined;
    appendLog("info", `Selected RDS region ${params.region}.`);
    return Promise.resolve(buildMockWorkspace());
  };
  register("aws.rds.selectRegion", handle_aws_rds_selectRegion);

  const handle_aws_rds_selectInstance : MockRpcHandler = async (params, method) => {
    mockState.session.selectedRdsInstanceId = String(params.instanceId ?? "");
    appendLog("info", `Selected RDS instance ${params.instanceId}.`);
    return Promise.resolve(buildMockWorkspace());
  };
  register("aws.rds.selectInstance", handle_aws_rds_selectInstance);

  const handle_aws_rds_startInstance : MockRpcHandler = async (params, method) => {
    const instanceId =
      String(params.instanceId ?? "") ||
      mockState.session.selectedRdsInstanceId ||
      "cloudsprocket-db";
    const action = method.endsWith("startInstance")
      ? "start"
      : method.endsWith("stopInstance")
        ? "stop"
        : "reboot";
    if (action === "reboot" && !mockState.session.awsWriteModeEnabled) {
      return Promise.reject(new Error("RDS reboot requires write mode to be enabled"));
    }
    const job: JobStatus = {
      jobId: `job-${Date.now()}`,
      label: "RDS Action",
      status: "queued",
      message: `Queueing RDS ${action} for ${instanceId}.`,
    };
    setTimeout(() => {
      appendLog("success", `RDS ${action} completed for ${instanceId}.`);
      emitMockEvent("job.updated", {
        ...job,
        status: "completed",
        message: `RDS ${action} completed for ${instanceId}.`,
        completedAt: new Date().toISOString(),
      });
    }, 30);
    return Promise.resolve(job);
  };
  register("aws.rds.startInstance", handle_aws_rds_startInstance);
  register("aws.rds.stopInstance", handle_aws_rds_startInstance);
  register("aws.rds.rebootInstance", handle_aws_rds_startInstance);

  const handle_aws_ecs_selectRegion : MockRpcHandler = async (params, method) => {
    mockState.session.selectedEcsRegion = String(params.region ?? "");
    mockState.session.selectedEcsClusterArn = undefined;
    mockState.session.selectedEcsServiceArn = undefined;
    mockState.session.selectedEcsTaskArn = undefined;
    appendLog("info", `Selected ECS region ${params.region}.`);
    return Promise.resolve(buildMockWorkspace());
  };
  register("aws.ecs.selectRegion", handle_aws_ecs_selectRegion);

  const handle_aws_ecs_selectCluster : MockRpcHandler = async (params, method) => {
    mockState.session.selectedEcsClusterArn = String(params.clusterArn ?? "");
    mockState.session.selectedEcsServiceArn = undefined;
    mockState.session.selectedEcsTaskArn = undefined;
    appendLog("info", `Selected ECS cluster ${params.clusterArn}.`);
    return Promise.resolve(buildMockWorkspace());
  };
  register("aws.ecs.selectCluster", handle_aws_ecs_selectCluster);

  const handle_aws_ecs_selectService : MockRpcHandler = async (params, method) => {
    mockState.session.selectedEcsServiceArn = String(params.serviceArn ?? "");
    mockState.session.selectedEcsTaskArn = undefined;
    appendLog("info", `Selected ECS service ${params.serviceArn}.`);
    return Promise.resolve(buildMockWorkspace());
  };
  register("aws.ecs.selectService", handle_aws_ecs_selectService);

  const handle_aws_ecs_selectTask : MockRpcHandler = async (params, method) => {
    mockState.session.selectedEcsTaskArn = String(params.taskArn ?? "");
    appendLog("info", `Selected ECS task ${params.taskArn}.`);
    return Promise.resolve(buildMockWorkspace());
  };
  register("aws.ecs.selectTask", handle_aws_ecs_selectTask);

  const handle_aws_ecs_forceNewDeployment : MockRpcHandler = async (params, method) => {
    if (!mockState.session.awsWriteModeEnabled) {
      return Promise.reject(
        new Error("ECS force new deployment requires write mode to be enabled"),
      );
    }
    const clusterArn = String(params.clusterArn ?? mockState.session.selectedEcsClusterArn ?? "");
    const serviceArn = String(params.serviceArn ?? mockState.session.selectedEcsServiceArn ?? "");
    mockState.session.selectedEcsClusterArn = clusterArn;
    mockState.session.selectedEcsServiceArn = serviceArn;
    appendLog("success", `Forced a new deployment for ECS service ${serviceArn}.`);
    return Promise.resolve(buildMockWorkspace());
  };
  register("aws.ecs.forceNewDeployment", handle_aws_ecs_forceNewDeployment);

  const handle_aws_ecs_updateDesiredCount : MockRpcHandler = async (params, method) => {
    if (!mockState.session.awsWriteModeEnabled) {
      return Promise.reject(
        new Error("ECS update desired count requires write mode to be enabled"),
      );
    }
    const clusterArn = String(params.clusterArn ?? mockState.session.selectedEcsClusterArn ?? "");
    const serviceArn = String(params.serviceArn ?? mockState.session.selectedEcsServiceArn ?? "");
    const desiredCount = Number(params.desiredCount ?? 0);
    mockState.session.selectedEcsClusterArn = clusterArn;
    mockState.session.selectedEcsServiceArn = serviceArn;
    const service = mockWorkspaceECSServices.find(
      (candidate) => candidate.serviceArn === serviceArn,
    );
    if (service) {
      service.desiredCount = desiredCount;
    }
    appendLog(
      "success",
      `Set desired count for ECS service ${serviceArn} to ${desiredCount}.`,
    );
    return Promise.resolve(buildMockWorkspace());
  };
  register("aws.ecs.updateDesiredCount", handle_aws_ecs_updateDesiredCount);

  const handle_aws_eks_selectRegion : MockRpcHandler = async (params, method) => {
    mockState.session.selectedEksRegion = String(params.region ?? "");
    mockState.session.selectedEksClusterName = undefined;
    appendLog("info", `Selected EKS region ${params.region}.`);
    return Promise.resolve(buildMockWorkspace());
  };
  register("aws.eks.selectRegion", handle_aws_eks_selectRegion);

  const handle_aws_eks_selectCluster : MockRpcHandler = async (params, method) => {
    mockState.session.selectedEksClusterName = String(params.clusterName ?? "");
    appendLog("info", `Selected EKS cluster ${params.clusterName}.`);
    return Promise.resolve(buildMockWorkspace());
  };
  register("aws.eks.selectCluster", handle_aws_eks_selectCluster);

  const handle_aws_cloudformation_selectRegion : MockRpcHandler = async (params, method) => {
    mockState.session.selectedCloudFormationRegion = String(params.region ?? "");
    mockState.session.selectedCloudFormationStackName = undefined;
    appendLog("info", `Selected CloudFormation region ${params.region}.`);
    return Promise.resolve(buildMockWorkspace());
  };
  register("aws.cloudformation.selectRegion", handle_aws_cloudformation_selectRegion);

  const handle_aws_cloudformation_selectStack : MockRpcHandler = async (params, method) => {
    mockState.session.selectedCloudFormationStackName = String(params.stackName ?? "");
    appendLog("info", `Selected CloudFormation stack ${params.stackName}.`);
    return Promise.resolve(buildMockWorkspace());
  };
  register("aws.cloudformation.selectStack", handle_aws_cloudformation_selectStack);

  const handle_aws_eventbridge_selectRegion : MockRpcHandler = async (params, method) => {
    mockState.session.selectedEventBridgeRegion = String(params.region ?? "");
    mockState.session.selectedEventBridgeBusName = undefined;
    appendLog("info", `Selected EventBridge region ${params.region}.`);
    return Promise.resolve(buildMockWorkspace());
  };
  register("aws.eventbridge.selectRegion", handle_aws_eventbridge_selectRegion);

  const handle_aws_eventbridge_selectBus : MockRpcHandler = async (params, method) => {
    mockState.session.selectedEventBridgeBusName = String(params.busName ?? "");
    appendLog("info", `Selected EventBridge bus ${params.busName}.`);
    return Promise.resolve(buildMockWorkspace());
  };
  register("aws.eventbridge.selectBus", handle_aws_eventbridge_selectBus);

  const handle_aws_route53_selectHostedZone : MockRpcHandler = async (params, method) => {
    mockState.session.selectedRoute53HostedZoneId = String(params.hostedZoneId ?? "");
    appendLog("info", `Selected Route 53 hosted zone ${params.hostedZoneId}.`);
    return Promise.resolve(buildMockWorkspace());
  };
  register("aws.route53.selectHostedZone", handle_aws_route53_selectHostedZone);

  const handle_aws_elb_selectRegion : MockRpcHandler = async (params, method) => {
    mockState.session.selectedElbRegion = String(params.region ?? "");
    mockState.session.selectedElbLoadBalancerArn = undefined;
    appendLog("info", `Selected load balancer region ${params.region}.`);
    return Promise.resolve(buildMockWorkspace());
  };
  register("aws.elb.selectRegion", handle_aws_elb_selectRegion);

  const handle_aws_elb_selectLoadBalancer : MockRpcHandler = async (params, method) => {
    mockState.session.selectedElbLoadBalancerArn = String(params.loadBalancerArn ?? "");
    appendLog("info", `Selected load balancer ${params.loadBalancerArn}.`);
    return Promise.resolve(buildMockWorkspace());
  };
  register("aws.elb.selectLoadBalancer", handle_aws_elb_selectLoadBalancer);

  const handle_aws_kms_selectRegion : MockRpcHandler = async (params, method) => {
    mockState.session.selectedKmsRegion = String(params.region ?? "");
    mockState.session.selectedKmsKeyId = undefined;
    appendLog("info", `Selected KMS region ${params.region}.`);
    return Promise.resolve(buildMockWorkspace());
  };
  register("aws.kms.selectRegion", handle_aws_kms_selectRegion);

  const handle_aws_kms_selectKey : MockRpcHandler = async (params, method) => {
    mockState.session.selectedKmsKeyId = String(params.keyId ?? "");
    appendLog("info", `Selected KMS key ${params.keyId}.`);
    return Promise.resolve(buildMockWorkspace());
  };
  register("aws.kms.selectKey", handle_aws_kms_selectKey);

  const handle_aws_apigateway_selectRegion : MockRpcHandler = async (params, method) => {
    mockState.session.selectedApiGatewayRegion = String(params.region ?? "");
    mockState.session.selectedApiGatewayApiKey = undefined;
    appendLog("info", `Selected API Gateway region ${params.region}.`);
    return Promise.resolve(buildMockWorkspace());
  };
  register("aws.apigateway.selectRegion", handle_aws_apigateway_selectRegion);

  const handle_aws_apigateway_selectApi : MockRpcHandler = async (params, method) => {
    mockState.session.selectedApiGatewayApiKey = String(params.apiKey ?? "");
    appendLog("info", `Selected API Gateway API ${params.apiKey}.`);
    return Promise.resolve(buildMockWorkspace());
  };
  register("aws.apigateway.selectApi", handle_aws_apigateway_selectApi);

  const handle_aws_secrets_selectRegion : MockRpcHandler = async (params, method) => {
    mockState.session.selectedSecretsManagerRegion = String(params.region ?? "");
    mockState.session.selectedSecretsManagerName = undefined;
    appendLog("info", `Selected Secrets Manager region ${params.region}.`);
    return Promise.resolve(buildMockWorkspace());
  };
  register("aws.secrets.selectRegion", handle_aws_secrets_selectRegion);

  const handle_aws_secrets_selectSecret : MockRpcHandler = async (params, method) => {
    mockState.session.selectedSecretsManagerName = String(params.secretName ?? "");
    appendLog("info", `Selected secret ${params.secretName}.`);
    return Promise.resolve(buildMockWorkspace());
  };
  register("aws.secrets.selectSecret", handle_aws_secrets_selectSecret);

  const handle_aws_secrets_reveal : MockRpcHandler = async (params, method) => {
    const secretName = String(params.secretName ?? "");
    const mockValues: Record<string, string> = {
      "cloudsprocket/db-password": "postgres://app:local-dev@localhost:5432/cloudsprocket",
      "cloudsprocket/api-key": "mock-api-key-12345",
    };
    if (!mockState.session.awsWriteModeEnabled) {
      return Promise.reject(new Error("Turn on write mode from the top bar to reveal secret values."));
    }
    return Promise.resolve({ value: mockValues[secretName] ?? "mock-secret-value" });
  };
  register("aws.secrets.reveal", handle_aws_secrets_reveal);

  const handle_aws_logs_selectRegion : MockRpcHandler = async (params, method) => {
    mockState.session.selectedLogsRegion = String(params.region ?? "");
    mockState.session.selectedLogGroupName = undefined;
    appendLog("info", `Selected CloudWatch Logs region ${params.region}.`);
    return Promise.resolve(buildMockWorkspace());
  };
  register("aws.logs.selectRegion", handle_aws_logs_selectRegion);

  const handle_aws_logs_selectLogGroup : MockRpcHandler = async (params, method) => {
    mockState.session.selectedLogGroupName = String(params.logGroupName ?? "");
    appendLog("info", `Selected log group ${params.logGroupName}.`);
    return Promise.resolve(buildMockWorkspace());
  };
  register("aws.logs.selectLogGroup", handle_aws_logs_selectLogGroup);

  const handle_aws_logs_createLogGroup : MockRpcHandler = async (params, method) => {
    const logGroupName = String(params.logGroupName ?? "/aws/test/group");
    if (!mockWorkspaceLogGroups.some((group) => group.logGroupName === logGroupName)) {
      mockWorkspaceLogGroups.push({
        logGroupName,
        storedBytes: 0,
        retentionInDays: 7,
      });
    }
    mockState.session.selectedLogGroupName = logGroupName;
    appendLog("success", `Created log group ${logGroupName}.`);
    return Promise.resolve(buildMockWorkspace());
  };
  register("aws.logs.createLogGroup", handle_aws_logs_createLogGroup);

  const handle_aws_logs_putLogEvents : MockRpcHandler = async (params, method) => {
    return Promise.resolve({
      logGroupName: String(params.logGroupName ?? mockState.session.selectedLogGroupName ?? ""),
      logStreamName: "cloudsprocket-test",
      summary: "Injected test event.",
    });
  };
  register("aws.logs.putLogEvents", handle_aws_logs_putLogEvents);

  const handle_aws_logs_filterEvents : MockRpcHandler = async (params, method) => {
    const logGroupName = String(
      params.logGroupName ?? mockState.session.selectedLogGroupName ?? "",
    );
    const filterPattern = String(params.filterPattern ?? "").trim();
    const group = mockWorkspaceLogGroups.find((entry) => entry.logGroupName === logGroupName);
    const baseEvents = group?.recentEvents ?? [
      "2024-06-15 12:00:00 INFO application started",
      "2024-06-15 12:01:00 ERROR request failed",
    ];
    const events = filterPattern
      ? baseEvents.filter((line) => line.toLowerCase().includes(filterPattern.toLowerCase()))
      : baseEvents;
    return Promise.resolve({
      logGroupName,
      filterPattern,
      events,
      summary: filterPattern
        ? `Found ${events.length} event(s) in ${logGroupName} matching "${filterPattern}".`
        : `Found ${events.length} recent event(s) in ${logGroupName}.`,
    });
  };
  register("aws.logs.filterEvents", handle_aws_logs_filterEvents);

  const handle_aws_iam_selectRole : MockRpcHandler = async (params, method) => {
    mockState.session.selectedIamRoleName = String(params.roleName ?? "");
    appendLog("info", `Selected IAM role ${params.roleName}.`);
    return Promise.resolve(buildMockWorkspace());
  };
  register("aws.iam.selectRole", handle_aws_iam_selectRole);

  const handle_aws_iam_createRole : MockRpcHandler = async (params, method) => {
    const roleName = String(params.roleName ?? "demo-lambda-role");
    mockState.session.selectedIamRoleName = roleName;
    appendLog("success", `Created IAM role ${roleName}.`);
    return Promise.resolve(buildMockWorkspace());
  };
  register("aws.iam.createRole", handle_aws_iam_createRole);

  const handle_aws_lambda_selectRegion : MockRpcHandler = async (params, method) => {
    mockState.session.selectedLambdaRegion = String(params.region ?? "");
    mockState.session.selectedLambdaFunctionName = undefined;
    appendLog("info", `Selected Lambda region ${params.region}.`);
    return Promise.resolve(buildMockWorkspace());
  };
  register("aws.lambda.selectRegion", handle_aws_lambda_selectRegion);

  const handle_aws_lambda_selectFunction : MockRpcHandler = async (params, method) => {
    mockState.session.selectedLambdaFunctionName = String(params.functionName ?? "");
    appendLog("info", `Selected Lambda function ${params.functionName}.`);
    return Promise.resolve(buildMockWorkspace());
  };
  register("aws.lambda.selectFunction", handle_aws_lambda_selectFunction);

  const handle_aws_lambda_describe : MockRpcHandler = async (params, method) => {
    const name = String(params.functionName ?? mockState.session.selectedLambdaFunctionName ?? "");
    const fn = mockWorkspaceLambdaFunctions.find((f) => f.functionName === name) || mockWorkspaceLambdaFunctions[0];
    return Promise.resolve((fn || {}));
  };
  register("aws.lambda.describe", handle_aws_lambda_describe);

  const handle_aws_lambda_invoke : MockRpcHandler = async (params, method) => {
    const name = String(params.functionName ?? "");
    const payload = params.payload ? JSON.stringify(params.payload) : "{}";
    const result: AwsLambdaInvokeResult = {
      statusCode: 200,
      executedVersion: "$LATEST",
      logResult: "START RequestId: mock-123\nEND RequestId: mock-123\nREPORT ...",
      payload: `{"echoed": ${payload}}`,
    };
    appendLog("success", `Invoked Lambda ${name} (mock).`);
    return Promise.resolve(result);
  };
  register("aws.lambda.invoke", handle_aws_lambda_invoke);

  const handle_aws_lambda_create : MockRpcHandler = async (params, method) => {
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
    return Promise.resolve(buildMockWorkspace());
  };
  register("aws.lambda.create", handle_aws_lambda_create);

  const handle_aws_lambda_deleteFunction : MockRpcHandler = async (params, method) => {
    const functionName =
      String(params.functionName ?? "") ||
      mockState.session.selectedLambdaFunctionName ||
      mockWorkspaceLambdaFunctions[0]?.functionName;
    const deleteIndex = mockWorkspaceLambdaFunctions.findIndex(
      (fn) => fn.functionName === functionName,
    );
    if (deleteIndex >= 0) {
      mockWorkspaceLambdaFunctions.splice(deleteIndex, 1);
    }
    if (mockState.session.selectedLambdaFunctionName === functionName) {
      mockState.session.selectedLambdaFunctionName = undefined;
    }
    appendLog("success", `Deleted Lambda function ${functionName}.`);
    return Promise.resolve(buildMockWorkspace());
  };
  register("aws.lambda.deleteFunction", handle_aws_lambda_deleteFunction);

  const handle_azure_selectResourceGroup : MockRpcHandler = async (params, method) => {
    mockState.session.selectedAzureResourceGroup = String(params.resourceGroup ?? "");
    mockState.session.selectedAzureVmId = undefined;
    appendLog("info", `Selected Azure resource group ${params.resourceGroup}.`);
    return Promise.resolve(buildMockWorkspace());
  };
  register("azure.selectResourceGroup", handle_azure_selectResourceGroup);

  const handle_azure_selectVirtualMachine : MockRpcHandler = async (params, method) => {
    mockState.session.selectedAzureVmId = String(params.vmId ?? "");
    appendLog("info", `Selected Azure virtual machine ${params.vmId}.`);
    return Promise.resolve(buildMockWorkspace());
  };
  register("azure.selectVirtualMachine", handle_azure_selectVirtualMachine);

  const handle_azure_resourceGroups_create : MockRpcHandler = async (params, method) => {
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
    return Promise.resolve(buildMockWorkspace());
  };
  register("azure.resourceGroups.create", handle_azure_resourceGroups_create);

  const handle_azure_bastion_list : MockRpcHandler = async (params, method) => {
    return Promise.resolve({
      hosts: mockAzureBastionHosts,
      statusMessage: `Loaded ${mockAzureBastionHosts.length} Bastion host(s) (mock).`,
    });
  };
  register("azure.bastion.list", handle_azure_bastion_list);

  const handle_azure_bastion_connect : MockRpcHandler = async (params, method) => {
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
    });
  };
  register("azure.bastion.connect", handle_azure_bastion_connect);

  const handle_azure_virtualMachines_invokeAction : MockRpcHandler = async (params, method) => {
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
    return Promise.resolve(buildMockWorkspace());
  };
  register("azure.virtualMachines.invokeAction", handle_azure_virtualMachines_invokeAction);

  const handle_azure_webApps_select : MockRpcHandler = async (params, method) => {
    mockState.session.selectedAzureWebAppName = String(params.appName ?? "");
    mockState.session.selectedAzureWebAppSlot = "";
    return Promise.resolve(buildMockWorkspace());
  };
  register("azure.webApps.select", handle_azure_webApps_select);

  const handle_azure_webApps_selectSlot : MockRpcHandler = async (params, method) => {
    mockState.session.selectedAzureWebAppSlot = String(params.slot ?? "");
    return Promise.resolve(buildMockWorkspace());
  };
  register("azure.webApps.selectSlot", handle_azure_webApps_selectSlot);

  const handle_azure_webApps_createSlot : MockRpcHandler = async (params, method) => {
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
    return Promise.resolve(buildMockWorkspace());
  };
  register("azure.webApps.createSlot", handle_azure_webApps_createSlot);

  const handle_azure_webApps_swapSlots : MockRpcHandler = async (params, method) => {
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
    return Promise.resolve(buildMockWorkspace());
  };
  register("azure.webApps.swapSlots", handle_azure_webApps_swapSlots);

  const handle_azure_webApps_setSetting : MockRpcHandler = async (params, method) => {
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
    return Promise.resolve(buildMockWorkspace());
  };
  register("azure.webApps.setSetting", handle_azure_webApps_setSetting);

  const handle_azure_webApps_deleteSetting : MockRpcHandler = async (params, method) => {
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
    return Promise.resolve(buildMockWorkspace());
  };
  register("azure.webApps.deleteSetting", handle_azure_webApps_deleteSetting);

  const handle_azure_webApps_invokeAction : MockRpcHandler = async (params, method) => {
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
    return Promise.resolve(buildMockWorkspace());
  };
  register("azure.webApps.invokeAction", handle_azure_webApps_invokeAction);

  const handle_azure_logAnalytics_selectWorkspace : MockRpcHandler = async (params, method) => {
    mockState.session.selectedAzureLogWorkspace = String(params.workspace ?? "");
    return Promise.resolve({ workspace: mockState.session.selectedAzureLogWorkspace });
  };
  register("azure.logAnalytics.selectWorkspace", handle_azure_logAnalytics_selectWorkspace);

  const handle_azure_logAnalytics_query : MockRpcHandler = async (params, method) => {
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
    });
  };
  register("azure.logAnalytics.query", handle_azure_logAnalytics_query);

  const handle_azure_logAnalytics_history_list : MockRpcHandler = async (params, method) => {
    const workspaceName = String(params.workspace ?? "");
    return Promise.resolve((mockLogAnalyticsHistory[workspaceName] ?? []));
  };
  register("azure.logAnalytics.history.list", handle_azure_logAnalytics_history_list);

  const handle_azure_logAnalytics_saved_list : MockRpcHandler = async (params, method) => {
    const workspaceName = String(params.workspace ?? "");
    return Promise.resolve((mockLogAnalyticsSaved[workspaceName] ?? []));
  };
  register("azure.logAnalytics.saved.list", handle_azure_logAnalytics_saved_list);

  const handle_azure_logAnalytics_saved_save : MockRpcHandler = async (params, method) => {
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
    return Promise.resolve(entry);
  };
  register("azure.logAnalytics.saved.save", handle_azure_logAnalytics_saved_save);

  const handle_azure_logAnalytics_saved_delete : MockRpcHandler = async (params, method) => {
    const workspaceName = String(params.workspace ?? "");
    const id = String(params.id ?? "");
    mockLogAnalyticsSaved[workspaceName] = (mockLogAnalyticsSaved[workspaceName] ?? []).filter(
      (item) => item.id !== id,
    );
    return Promise.resolve({ deleted: true });
  };
  register("azure.logAnalytics.saved.delete", handle_azure_logAnalytics_saved_delete);

  const handle_azure_logAnalytics_tables_list : MockRpcHandler = async (params, method) => {
    return Promise.resolve([
      { name: "AzureDiagnostics", columns: ["TimeGenerated", "Category", "action_s"] },
      { name: "AppEvents", columns: ["TimeGenerated", "Level", "Message"] },
      { name: "Heartbeat", columns: ["TimeGenerated", "Category"] },
    ]);
  };
  register("azure.logAnalytics.tables.list", handle_azure_logAnalytics_tables_list);

  const handle_azure_logAnalytics_table_schema : MockRpcHandler = async (params, method) => {
    const tableName = String(params.tableName ?? "").trim();
    if (!tableName) {
      return Promise.reject(new Error("a table name is required"));
    }
    const tables: { name: string; columns: string[] }[] = [
      { name: "AzureDiagnostics", columns: ["TimeGenerated", "Category", "action_s"] },
      { name: "AppEvents", columns: ["TimeGenerated", "Level", "Message"] },
      { name: "Heartbeat", columns: ["TimeGenerated", "Category"] },
    ];
    const found = tables.find((table) => table.name === tableName);
    return Promise.resolve(
      { name: tableName, columns: found?.columns ?? ["TimeGenerated"] },
    );
  };
  register("azure.logAnalytics.table.schema", handle_azure_logAnalytics_table_schema);

  const handle_azure_waf_logs_schema : MockRpcHandler = async (params, method) => {
    return Promise.resolve(mockAzureWafLogSchema);
  };
  register("azure.waf.logs.schema", handle_azure_waf_logs_schema);

  const handle_azure_waf_refresh : MockRpcHandler = async (params, method) => {
    return Promise.resolve(buildMockWorkspace());
  };
  register("azure.waf.refresh", handle_azure_waf_refresh);

  const handle_azure_waf_selectPolicy : MockRpcHandler = async (params, method) => {
    mockState.session.selectedAzureWafPolicy = String(params.policyName ?? "");
    return Promise.resolve(buildMockWorkspace());
  };
  register("azure.waf.selectPolicy", handle_azure_waf_selectPolicy);

  const handle_azure_waf_config_setMode : MockRpcHandler = async (params, method) => {
    if (!mockState.session.azureWriteModeEnabled) {
      return Promise.reject(new Error("enable Azure write mode before applying WAF changes"));
    }
    const mode = String(params.mode ?? "");
    mockAzureWafPolicyDetail.mode = mode;
    const policy = mockAzureWafPolicies.find((item) => item.name === mockAzureWafPolicyDetail.name);
    if (policy) policy.mode = mode;
    appendLog("success", `Updated WAF policy mode to ${mode} (mock).`);
    return Promise.resolve(buildMockWorkspace());
  };
  register("azure.waf.config.setMode", handle_azure_waf_config_setMode);

  const handle_azure_waf_config_setManagedRule : MockRpcHandler = async (params, method) => {
    if (!mockState.session.azureWriteModeEnabled) {
      return Promise.reject(new Error("enable Azure write mode before applying WAF changes"));
    }
    const ruleId = String(params.ruleId ?? "");
    const enabled = Boolean(params.enabled);
    const override = mockAzureWafPolicyDetail.managedRuleOverrides.find((item) => item.ruleId === ruleId);
    if (override) override.enabled = enabled;
    appendLog("success", `${enabled ? "Enabled" : "Disabled"} WAF rule ${ruleId} (mock).`);
    return Promise.resolve(buildMockWorkspace());
  };
  register("azure.waf.config.setManagedRule", handle_azure_waf_config_setManagedRule);

  const handle_azure_waf_config_removeExclusion : MockRpcHandler = async (params, method) => {
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
    return Promise.resolve(buildMockWorkspace());
  };
  register("azure.waf.config.removeExclusion", handle_azure_waf_config_removeExclusion);

  const handle_azure_waf_config_addExclusion : MockRpcHandler = async (params, method) => {
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
    return Promise.resolve(buildMockWorkspace());
  };
  register("azure.waf.config.addExclusion", handle_azure_waf_config_addExclusion);

  const handle_azure_functions_selectApp : MockRpcHandler = async (params, method) => {
    mockState.session.selectedAzureFunctionApp = String(params.appName ?? "");
    mockState.session.selectedAzureFunction = "";
    return Promise.resolve(buildMockWorkspace());
  };
  register("azure.functions.selectApp", handle_azure_functions_selectApp);

  const handle_azure_functions_selectFunction : MockRpcHandler = async (params, method) => {
    mockState.session.selectedAzureFunction = String(params.functionName ?? "");
    return Promise.resolve(buildMockWorkspace());
  };
  register("azure.functions.selectFunction", handle_azure_functions_selectFunction);

  const handle_azure_functions_invoke : MockRpcHandler = async (params, method) => {
    if (!mockState.session.azureWriteModeEnabled) {
      return Promise.reject(new Error("invoking a function requires write mode to be enabled for this Azure workspace"));
    }
    appendLog("success", `Invoked Azure function ${String(params.functionName ?? "")} (mock).`);
    return Promise.resolve({ statusCode: 200, body: '{"ok":true}' });
  };
  register("azure.functions.invoke", handle_azure_functions_invoke);

  const handle_azure_keyVault_selectVault : MockRpcHandler = async (params, method) => {
    mockState.session.selectedAzureKeyVault = String(params.vaultName ?? "");
    mockState.session.selectedAzureSecret = "";
    return Promise.resolve(buildMockWorkspace());
  };
  register("azure.keyVault.selectVault", handle_azure_keyVault_selectVault);

  const handle_azure_keyVault_selectSecret : MockRpcHandler = async (params, method) => {
    mockState.session.selectedAzureSecret = String(params.secretName ?? "");
    return Promise.resolve(buildMockWorkspace());
  };
  register("azure.keyVault.selectSecret", handle_azure_keyVault_selectSecret);

  const handle_azure_keyVault_revealSecret : MockRpcHandler = async (params, method) => {
    if (!mockState.session.azureWriteModeEnabled) {
      return Promise.reject(
        new Error("Reveal requires write mode to be enabled for this Azure workspace."),
      );
    }
    const name = String(params.secretName ?? "");
    return Promise.resolve({ value: mockSecretValues[name] ?? "(no value)" });
  };
  register("azure.keyVault.revealSecret", handle_azure_keyVault_revealSecret);

  const handle_azure_keyVault_setSecret : MockRpcHandler = async (params, method) => {
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
    return Promise.resolve(buildMockWorkspace());
  };
  register("azure.keyVault.setSecret", handle_azure_keyVault_setSecret);

  const handle_azure_cosmos_selectAccount : MockRpcHandler = async (params, method) => {
    mockState.session.selectedAzureCosmosAccount = String(params.account ?? "");
    mockState.session.selectedAzureCosmosDatabase = "";
    mockState.session.selectedAzureCosmosContainer = "";
    return Promise.resolve(buildMockWorkspace());
  };
  register("azure.cosmos.selectAccount", handle_azure_cosmos_selectAccount);

  const handle_azure_cosmos_selectDatabase : MockRpcHandler = async (params, method) => {
    mockState.session.selectedAzureCosmosDatabase = String(params.database ?? "");
    mockState.session.selectedAzureCosmosContainer = "";
    return Promise.resolve(buildMockWorkspace());
  };
  register("azure.cosmos.selectDatabase", handle_azure_cosmos_selectDatabase);

  const handle_azure_cosmos_selectContainer : MockRpcHandler = async (params, method) => {
    mockState.session.selectedAzureCosmosContainer = String(params.container ?? "");
    return Promise.resolve(buildMockWorkspace());
  };
  register("azure.cosmos.selectContainer", handle_azure_cosmos_selectContainer);

  const handle_azure_cosmos_deleteItem : MockRpcHandler = async (params, method) => {
    if (!mockState.session.azureWriteModeEnabled) {
      return Promise.reject(
        new Error("Cosmos delete requires write mode to be enabled for this Azure workspace"),
      );
    }
    const itemId = String(params.itemId ?? "").trim();
    appendLog("success", `Deleted Cosmos item ${itemId} (mock).`);
    return Promise.resolve(buildMockWorkspace());
  };
  register("azure.cosmos.deleteItem", handle_azure_cosmos_deleteItem);

  const handle_azure_cosmos_query : MockRpcHandler = async (params, method) => {
    const query = String(params.query ?? "").trim();
    if (!query) {
      return Promise.reject(new Error("a SQL query is required"));
    }
    const account = String(params.account ?? mockState.session.selectedAzureCosmosAccount ?? "");
    const database = String(params.database ?? mockState.session.selectedAzureCosmosDatabase ?? "");
    const container = String(params.container ?? mockState.session.selectedAzureCosmosContainer ?? "");
    if (!account || !database || !container) {
      return Promise.reject(new Error("account, database, and container are required"));
    }
    return Promise.resolve({
      account,
      database,
      container,
      query,
      items: mockAzureCosmosItems,
      truncated: false,
      summary: `Returned ${mockAzureCosmosItems.length} document(s) from ${account}/${database}/${container}.`,
    });
  };
  register("azure.cosmos.query", handle_azure_cosmos_query);

  const handle_azure_postgres_selectServer : MockRpcHandler = async (params, method) => {
    mockState.session.selectedAzurePostgresServer = String(params.server ?? "");
    return Promise.resolve(buildMockWorkspace());
  };
  register("azure.postgres.selectServer", handle_azure_postgres_selectServer);

  const handle_azure_postgres_startServer : MockRpcHandler = async (params, method) => {
    if (!mockState.session.azureWriteModeEnabled) {
      return Promise.reject(
        new Error(
          "PostgreSQL server actions require write mode to be enabled for this Azure workspace",
        ),
      );
    }
    const serverName = String(params.server ?? mockState.session.selectedAzurePostgresServer ?? "");
    mockState.session.selectedAzurePostgresServer = serverName;
    const server = mockAzurePostgresServers.find((entry) => entry.name === serverName);
    if (server) {
      server.provisioningState = "Ready";
    }
    appendLog("success", `Started PostgreSQL flexible server ${serverName}.`);
    return Promise.resolve(buildMockWorkspace());
  };
  register("azure.postgres.startServer", handle_azure_postgres_startServer);

  const handle_azure_postgres_stopServer : MockRpcHandler = async (params, method) => {
    if (!mockState.session.azureWriteModeEnabled) {
      return Promise.reject(
        new Error(
          "PostgreSQL server actions require write mode to be enabled for this Azure workspace",
        ),
      );
    }
    const serverName = String(params.server ?? mockState.session.selectedAzurePostgresServer ?? "");
    mockState.session.selectedAzurePostgresServer = serverName;
    const server = mockAzurePostgresServers.find((entry) => entry.name === serverName);
    if (server) {
      server.provisioningState = "Stopped";
    }
    appendLog("success", `Stopped PostgreSQL flexible server ${serverName}.`);
    return Promise.resolve(buildMockWorkspace());
  };
  register("azure.postgres.stopServer", handle_azure_postgres_stopServer);

  const handle_azure_frontDoor_selectProfile : MockRpcHandler = async (params, method) => {
    mockState.session.selectedAzureFrontDoorProfile = String(params.profile ?? "");
    mockState.session.selectedAzureFrontDoorEndpoint = "";
    mockState.session.selectedAzureFrontDoorOriginGroup = "";
    return Promise.resolve(buildMockWorkspace());
  };
  register("azure.frontDoor.selectProfile", handle_azure_frontDoor_selectProfile);

  const handle_azure_frontDoor_selectEndpoint : MockRpcHandler = async (params, method) => {
    mockState.session.selectedAzureFrontDoorEndpoint = String(params.endpoint ?? "");
    return Promise.resolve(buildMockWorkspace());
  };
  register("azure.frontDoor.selectEndpoint", handle_azure_frontDoor_selectEndpoint);

  const handle_azure_frontDoor_selectOriginGroup : MockRpcHandler = async (params, method) => {
    mockState.session.selectedAzureFrontDoorOriginGroup = String(params.originGroup ?? "");
    return Promise.resolve(buildMockWorkspace());
  };
  register("azure.frontDoor.selectOriginGroup", handle_azure_frontDoor_selectOriginGroup);

  const handle_azure_frontDoor_refresh : MockRpcHandler = async (params, method) => {
    return Promise.resolve(buildMockWorkspace());
  };
  register("azure.frontDoor.refresh", handle_azure_frontDoor_refresh);

  const handle_azure_frontDoor_purgeCache : MockRpcHandler = async (params, method) => {
    if (!mockState.session.azureWriteModeEnabled) {
      return Promise.reject(
        new Error("Front Door cache purge requires write mode to be enabled for this Azure workspace"),
      );
    }
    const endpointName = String(params.endpointName ?? "");
    appendLog("success", `Purged Front Door cache for ${endpointName} (mock).`);
    return Promise.resolve(buildMockWorkspace());
  };
  register("azure.frontDoor.purgeCache", handle_azure_frontDoor_purgeCache);

  const handle_azure_queues_selectQueue : MockRpcHandler = async (params, method) => {
    mockState.session.selectedAzureQueue = String(params.queue ?? "");
    return Promise.resolve(buildMockWorkspace());
  };
  register("azure.queues.selectQueue", handle_azure_queues_selectQueue);

  const handle_azure_queues_purge : MockRpcHandler = async (params, method) => {
    if (!mockState.session.azureWriteModeEnabled) {
      return Promise.reject(
        new Error("queue purge requires write mode to be enabled for this Azure workspace"),
      );
    }
    const accountName = String(params.account ?? mockState.session.selectedAzureStorageAccount ?? "");
    const queueName = String(params.queue ?? mockState.session.selectedAzureQueue ?? "");
    mockState.session.selectedAzureStorageAccount = accountName;
    mockState.session.selectedAzureQueue = queueName;
    appendLog("success", `Purged all messages from queue ${queueName} in ${accountName}.`);
    return Promise.resolve(buildMockWorkspace());
  };
  register("azure.queues.purge", handle_azure_queues_purge);

  const handle_gcp_storage_selectBucket : MockRpcHandler = async (params, method) => {
    mockState.session.selectedGcpStorageBucket = String(params.bucketName ?? "");
    mockState.session.gcpStoragePrefixFilter = "";
    mockGcpStorageObjectsHasMore = true;
    mockGcpStorageObjectsNextToken = "mock-gcs-page-2";
    appendLog("info", `Selected Cloud Storage bucket ${params.bucketName}.`);
    return Promise.resolve(buildMockWorkspace());
  };
  register("gcp.storage.selectBucket", handle_gcp_storage_selectBucket);

  const handle_gcp_storage_setPrefixFilter : MockRpcHandler = async (params, method) => {
    mockState.session.gcpStoragePrefixFilter = String(params.prefix ?? "");
    mockGcpStorageObjectsHasMore = true;
    mockGcpStorageObjectsNextToken = "mock-gcs-page-2";
    appendLog("info", `Set Cloud Storage prefix filter to ${params.prefix ?? ""}.`);
    return Promise.resolve(buildMockWorkspace());
  };
  register("gcp.storage.setPrefixFilter", handle_gcp_storage_setPrefixFilter);

  const handle_gcp_storage_loadMoreObjects : MockRpcHandler = async (params, method) => {
    if (!mockGcpStorageObjectsHasMore) {
      return Promise.resolve(buildMockWorkspace());
    }
    mockGcpStorageObjects = [
      ...mockGcpStorageObjects,
      {
        key: "archive/old.log",
        size: "2 KB",
        updated: "2026-07-01T00:00:00Z",
        contentType: "text/plain",
      },
    ];
    mockGcpStorageObjectsHasMore = false;
    mockGcpStorageObjectsNextToken = undefined;
    appendLog("info", "Loaded more Cloud Storage objects.");
    return Promise.resolve(buildMockWorkspace());
  };
  register("gcp.storage.loadMoreObjects", handle_gcp_storage_loadMoreObjects);

  const handle_gcp_storage_uploadObject : MockRpcHandler = async (params, method) => {
    if (!mockState.session.gcpWriteModeEnabled) {
      return Promise.reject(
        new Error("Turn on write mode from the top bar to run mutating actions."),
      );
    }
    const objectKey = String(params.objectKey ?? "upload.bin");
    mockGcpStorageObjects = [
      ...mockGcpStorageObjects.filter((entry) => entry.key !== objectKey),
      {
        key: objectKey,
        size: "1 KB",
        updated: new Date().toISOString(),
        contentType: "application/octet-stream",
      },
    ];
    appendLog("success", `Uploaded Cloud Storage object ${objectKey}.`);
    return Promise.resolve(buildMockWorkspace());
  };
  register("gcp.storage.uploadObject", handle_gcp_storage_uploadObject);

  const handle_gcp_storage_deleteObject : MockRpcHandler = async (params, method) => {
    if (!mockState.session.gcpWriteModeEnabled) {
      return Promise.reject(
        new Error("Turn on write mode from the top bar to run mutating actions."),
      );
    }
    const objectKey = String(params.objectKey ?? "");
    mockGcpStorageObjects = mockGcpStorageObjects.filter((entry) => entry.key !== objectKey);
    appendLog("success", `Deleted Cloud Storage object ${objectKey}.`);
    return Promise.resolve(buildMockWorkspace());
  };
  register("gcp.storage.deleteObject", handle_gcp_storage_deleteObject);

  const handle_gcp_storage_signUrl : MockRpcHandler = async (params, method) => {
    const bucketName =
      String(params.bucketName ?? "") ||
      mockState.session.selectedGcpStorageBucket ||
      mockGcpStorageBuckets[0]?.name ||
      "platform-artifacts";
    const objectKey = String(params.objectKey ?? "docs/readme.txt");
    const durationSeconds = Number(params.durationSeconds ?? 3600) || 3600;
    const expiresAt = new Date(Date.now() + durationSeconds * 1000).toISOString();
    appendLog("success", `Signed Cloud Storage URL for ${bucketName}/${objectKey}.`);
    return Promise.resolve({
      result: {
        bucketName,
        objectKey,
        url: `https://storage.googleapis.com/${bucketName}/${encodeURIComponent(objectKey)}?X-Goog-Signature=mock&X-Goog-Expires=${durationSeconds}`,
        durationSeconds,
        expiresAt,
      },
    });
  };
  register("gcp.storage.signUrl", handle_gcp_storage_signUrl);

  const handle_gcp_compute_startInstance : MockRpcHandler = async (params, method) => {
    if (!mockState.session.gcpWriteModeEnabled) {
      return Promise.reject(
        new Error("Turn on write mode from the top bar to run mutating actions."),
      );
    }
    const name = String(params.name ?? "");
    const zone = String(params.zone ?? "");
    const instance = mockGcpComputeInstances.find((entry) => entry.name === name);
    if (instance) {
      instance.status = method.endsWith("startInstance") ? "RUNNING" : "TERMINATED";
    }
    mockState.session.selectedGcpComputeInstance = name;
    appendLog(
      "success",
      method.endsWith("startInstance")
        ? `Started Compute Engine instance ${name} in ${zone}.`
        : `Stopped Compute Engine instance ${name} in ${zone}.`,
    );
    return Promise.resolve(buildMockWorkspace());
  };
  register("gcp.compute.startInstance", handle_gcp_compute_startInstance);
  register("gcp.compute.stopInstance", handle_gcp_compute_startInstance);

  const handle_gcp_functions_selectFunction : MockRpcHandler = async (params, method) => {
    mockState.session.selectedGcpFunction = String(params.functionKey ?? "");
    appendLog("info", `Selected Cloud Function ${params.functionKey}.`);
    return Promise.resolve(buildMockWorkspace());
  };
  register("gcp.functions.selectFunction", handle_gcp_functions_selectFunction);

  const handle_gcp_functions_call : MockRpcHandler = async (params, method) => {
    if (!mockState.session.gcpWriteModeEnabled) {
      return Promise.reject(
        new Error("Turn on write mode from the top bar to run mutating actions."),
      );
    }
    const name = String(params.name ?? "hello-http");
    const region = String(params.region ?? "us-central1");
    const generation = String(params.generation ?? "2nd gen");
    appendLog("success", `Invoked Cloud Function ${name} in ${region}.`);
    return Promise.resolve({
      result: {
        name,
        region,
        generation,
        body: JSON.stringify({ ok: true, echo: params.data ?? null }),
      },
    });
  };
  register("gcp.functions.call", handle_gcp_functions_call);

  const handle_azure_webApps_create : MockRpcHandler = async (params, method) => {
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
    return Promise.resolve(buildMockWorkspace());
  };
  register("azure.webApps.create", handle_azure_webApps_create);

  const handle_azure_storage_createAccount : MockRpcHandler = async (params, method) => {
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
    return Promise.resolve(buildMockWorkspace());
  };
  register("azure.storage.createAccount", handle_azure_storage_createAccount);

  const handle_azure_resourceGroups_delete : MockRpcHandler = async (params, method) => {
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
    return Promise.resolve(buildMockWorkspace());
  };
  register("azure.resourceGroups.delete", handle_azure_resourceGroups_delete);

  const handle_azure_storage_selectAccount : MockRpcHandler = async (params, method) => {
    mockState.session.selectedAzureStorageAccount = String(params.accountName ?? "");
    mockState.session.selectedAzureBlobContainer = undefined;
    mockState.session.selectedAzureBlobName = undefined;
    return Promise.resolve(buildMockWorkspace());
  };
  register("azure.storage.selectAccount", handle_azure_storage_selectAccount);

  const handle_azure_storage_selectContainer : MockRpcHandler = async (params, method) => {
    mockState.session.selectedAzureBlobContainer = String(params.containerName ?? "");
    mockState.session.selectedAzureBlobName = undefined;
    return Promise.resolve(buildMockWorkspace());
  };
  register("azure.storage.selectContainer", handle_azure_storage_selectContainer);

  const handle_azure_storage_selectBlob : MockRpcHandler = async (params, method) => {
    mockState.session.selectedAzureBlobName = String(params.blobName ?? "");
    return Promise.resolve(buildMockWorkspace());
  };
  register("azure.storage.selectBlob", handle_azure_storage_selectBlob);

  const handle_azure_storage_setPrefixFilter : MockRpcHandler = async (params, method) => {
    mockState.session.azureBlobPrefixFilter = String(params.prefix ?? "");
    mockState.session.selectedAzureBlobName = undefined;
    return Promise.resolve(buildMockWorkspace());
  };
  register("azure.storage.setPrefixFilter", handle_azure_storage_setPrefixFilter);

  const handle_azure_storage_createContainer : MockRpcHandler = async (params, method) => {
    if (!mockState.session.azureWriteModeEnabled) {
      return Promise.reject(new Error("blob container create requires write mode to be enabled for this Azure workspace"));
    }
    const containerName = String(params.containerName ?? "").trim();
    mockAzureBlobContainers.push({ name: containerName, lastModified: new Date().toISOString() });
    mockState.session.selectedAzureBlobContainer = containerName;
    return Promise.resolve(buildMockWorkspace());
  };
  register("azure.storage.createContainer", handle_azure_storage_createContainer);

  const handle_azure_storage_uploadBlob : MockRpcHandler = async (params, method) => {
    if (!mockState.session.azureWriteModeEnabled) {
      return Promise.reject(new Error("blob upload requires write mode to be enabled for this Azure workspace"));
    }
    const blobName = String(params.blobName ?? "").trim();
    mockAzureBlobs.push({ name: blobName, size: "1 KiB", modifiedAt: new Date().toISOString(), contentType: "application/octet-stream" });
    mockState.session.selectedAzureBlobName = blobName;
    return Promise.resolve({ workspace: buildMockWorkspace() });
  };
  register("azure.storage.uploadBlob", handle_azure_storage_uploadBlob);

  const handle_azure_storage_deleteBlob : MockRpcHandler = async (params, method) => {
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
    return Promise.resolve(buildMockWorkspace());
  };
  register("azure.storage.deleteBlob", handle_azure_storage_deleteBlob);

  const handle_azure_storage_copyBlob : MockRpcHandler = async (params, method) => {
    if (!mockState.session.azureWriteModeEnabled) {
      return Promise.reject(new Error("blob copy requires write mode to be enabled for this Azure workspace"));
    }
    const sourceBlobName = String(params.sourceBlobName ?? mockState.session.selectedAzureBlobName ?? "");
    const destinationBlobName = String(params.destinationBlobName ?? `${sourceBlobName}-copy`);
    mockAzureBlobs.push({
      name: destinationBlobName,
      size: "1 KiB",
      modifiedAt: new Date().toISOString(),
      contentType: "application/octet-stream",
    });
    mockState.session.selectedAzureBlobName = destinationBlobName;
    appendLog("success", `Copied blob ${sourceBlobName} to ${destinationBlobName}.`);
    return Promise.resolve(buildMockWorkspace());
  };
  register("azure.storage.copyBlob", handle_azure_storage_copyBlob);

  const handle_azure_storage_presignBlob : MockRpcHandler = async (params, method) => {
    const blobName = String(params.blobName ?? mockState.session.selectedAzureBlobName ?? "").trim();
    if (!blobName) {
      return Promise.reject(new Error("select a blob before generating a signed URL"));
    }
    let durationSeconds = Number(params.durationSeconds ?? 3600);
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      durationSeconds = 3600;
    }
    const accountName = String(mockState.session.selectedAzureStorageAccount ?? "devstoreaccount1");
    const containerName = String(mockState.session.selectedAzureBlobContainer ?? "test-container");
    const expiresAt = new Date(Date.now() + durationSeconds * 1000).toISOString();
    return Promise.resolve({
      result: {
        accountName,
        containerName,
        blobName,
        url: `https://${accountName}.blob.core.windows.net/${containerName}/${encodeURIComponent(blobName)}?sig=mock&se=${encodeURIComponent(expiresAt)}`,
        durationSeconds,
        expiresAt,
      },
    });
  };
  register("azure.storage.presignBlob", handle_azure_storage_presignBlob);

  const handle_azure_storage_createFolderPrefix : MockRpcHandler = async (params, method) => {
    if (!mockState.session.azureWriteModeEnabled) {
      return Promise.reject(new Error("folder create requires write mode to be enabled for this Azure workspace"));
    }
    const folderPrefix = String(params.folderPrefix ?? "folder/");
    const markerName = folderPrefix.endsWith("/") ? folderPrefix : `${folderPrefix}/`;
    mockAzureBlobs.push({
      name: markerName,
      size: "0 B",
      modifiedAt: new Date().toISOString(),
      contentType: "application/octet-stream",
    });
    mockState.session.azureBlobPrefixFilter = markerName;
    mockState.session.selectedAzureBlobName = undefined;
    appendLog("success", `Created folder prefix ${markerName}.`);
    return Promise.resolve(buildMockWorkspace());
  };
  register("azure.storage.createFolderPrefix", handle_azure_storage_createFolderPrefix);

  const handle_session_selectProvider : MockRpcHandler = async (params, method) => {
    // Throws when locked (same policyhe daemon; F-011).
    setCurrentProvider(String(params.providerId ?? ""));
    emitStateChanged();
    appendLog("info", `Selected provider ${params.providerId}.`);
    return Promise.resolve(mockState.session);
  };
  register("session.selectProvider", handle_session_selectProvider);

  const handle_session_selectProfile : MockRpcHandler = async (params, method) => {
    if (mockState.session.isLocked) {
      return Promise.reject(new Error(sessionLockedForSelectMessage));
    }
    mockState.session.currentProviderId = String(params.providerId ?? "");
    mockState.session.selectedProfileId = String(params.profileId ?? "");
    mockState.session.selectedAuthMethod = undefined;
    clearMockWorkspaceSelections();
    rebuildSessionDerivedState();
    emitStateChanged();
    appendLog("info", `Selected profile ${params.profileId}.`);
    return Promise.resolve(mockState.session);
  };
  register("session.selectProfile", handle_session_selectProfile);

  const handle_session_selectAuthMethod : MockRpcHandler = async (params, method) => {
    mockState.session.selectedAuthMethod = params.authMethod as AuthMethod;
    rebuildSessionDerivedState();
    emitStateChanged();
    appendLog("info", `Selected auth method ${params.authMethod}.`);
    return Promise.resolve(mockState.session);
  };
  register("session.selectAuthMethod", handle_session_selectAuthMethod);

  const handle_session_setWriteMode : MockRpcHandler = async (params, method) => {
    if (!mockState.session.isLocked) {
      return Promise.reject(new Error("open a locked workspace before changing write mode"));
    }
    if (mockState.session.lockedProviderId === "aws") {
      if (params.enabled && !buildMockWorkspace().awsWriteCapable) {
        return Promise.reject(new Error("open a locked workspace before changing write mode"));
      }
      mockState.session.awsWriteModeEnabled = Boolean(params.enabled);
    } else if (mockState.session.lockedProviderId === "azure") {
      if (params.enabled && !buildMockWorkspace().azureWriteCapable) {
        return Promise.reject(new Error("this Azure profile cannot enable write mode"));
      }
      mockState.session.azureWriteModeEnabled = Boolean(params.enabled);
    } else if (mockState.session.lockedProviderId === "gcp") {
      if (params.enabled && !buildMockWorkspace().gcpWriteCapable) {
        return Promise.reject(new Error("open a locked workspace before changing write mode"));
      }
      mockState.session.gcpWriteModeEnabled = Boolean(params.enabled);
    } else {
      return Promise.reject(
        new Error("write mode is only available for locked AWS, Azure, or GCP workspaces"),
      );
    }
    appendLog(
      params.enabled ? "warning" : "info",
      params.enabled ? "Write mode enabled for this workspace session." : "Write mode disabled for this workspace session.",
    );
    emitStateChanged();
    return Promise.resolve(mockState.session);
  };
  register("session.setWriteMode", handle_session_setWriteMode);

  const handle_session_lock : MockRpcHandler = async (params, method) => {
    mockState.session.isLocked = true;
    mockState.session.awsWriteModeEnabled = false;
    mockState.session.azureWriteModeEnabled = false;
    mockState.session.gcpWriteModeEnabled = false;
    mockState.session.lockedProviderId = mockState.session.currentProviderId;
    mockState.session.lockedProfileId = mockState.session.selectedProfileId;
    mockState.session.lockedAuthMethod = mockState.session.selectedAuthMethod;
    rebuildSessionDerivedState();
    emitStateChanged();
    appendLog(
      "success",
      `Locked ${mockState.session.lockedProviderId?.toUpperCase()} session for ${mockState.session.lockedProfileId}.`,
    );
    return Promise.resolve(mockState.session);
  };
  register("session.lock", handle_session_lock);

  const handle_session_unlock : MockRpcHandler = async (params, method) => {
    mockState.session.isLocked = false;
    mockState.session.awsWriteModeEnabled = false;
    mockState.session.azureWriteModeEnabled = false;
    mockState.session.gcpWriteModeEnabled = false;
    mockState.session.lockedProviderId = undefined;
    mockState.session.lockedProfileId = undefined;
    mockState.session.lockedAuthMethod = undefined;
    mockState.session.selectedAzureResourceGroup = undefined;
    mockState.session.selectedAzureVmId = undefined;
    mockState.session.selectedAzureStorageAccount = undefined;
    mockState.session.selectedAzureBlobContainer = undefined;
    mockState.session.selectedAzureBlobName = undefined;
    mockState.session.azureBlobPrefixFilter = undefined;
    mockState.session.selectedGcpStorageBucket = undefined;
    mockState.session.gcpStoragePrefixFilter = undefined;
    mockState.session.selectedGcpFunction = undefined;
    mockState.session.selectedGcpComputeInstance = undefined;
    rebuildSessionDerivedState();
    emitStateChanged();
    appendLog("info", "Unlocked the active cloud session.");
    return Promise.resolve(mockState.session);
  };
  register("session.unlock", handle_session_unlock);

  const handle_logs_list : MockRpcHandler = async (params, method) => {
    return Promise.resolve(
      mockState.logs.slice(0, Number(params.limit ?? 50)),
    );
  };
  register("logs.list", handle_logs_list);

  const handle_app_settings_get : MockRpcHandler = async (params, method) => {
    return Promise.resolve(mockState.settings);
  };
  register("app.settings.get", handle_app_settings_get);

  const handle_preferences_get : MockRpcHandler = async (params, method) => {
    return Promise.resolve(buildMockPreferencesSnapshot());
  };
  register("preferences.get", handle_preferences_get);

  const handle_preferences_update : MockRpcHandler = async (params, method) => {
    const snapshot = buildMockPreferencesSnapshot(params as unknown as ServicePreferences);
    rebuildSessionDerivedState();
    return Promise.resolve(snapshot);
  };
  register("preferences.update", handle_preferences_update);

  const handle_preferences_hiddenResources_get : MockRpcHandler = async (params, method) => {
    rebuildSessionDerivedState();
    return Promise.resolve(buildMockHiddenResourcesSnapshot());
  };
  register("preferences.hiddenResources.get", handle_preferences_hiddenResources_get);

  const handle_app_reset : MockRpcHandler = async (params, method) => {
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
    return Promise.resolve(resetResult);
  };
  register("app.reset", handle_app_reset);

  const handle_actions_invoke : MockRpcHandler = async (params, method) => {
    const job: JobStatus = {
      jobId: `job-${Date.now()}`,
      label: "Refresh Discovery",
      kind: "discovery.refresh",
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
    return Promise.resolve(job);
  };
  register("actions.invoke", handle_actions_invoke);

  const handle_recipes_list : MockRpcHandler = async (params, method) => {
    return Promise.resolve(mockRecipes.map((recipe) => recipe.manifest));
  };
  register("recipes.list", handle_recipes_list);

  const handle_recipes_get : MockRpcHandler = async (params, method) => {
    return mockGetRecipe(params.recipeId as string);
  };
  register("recipes.get", handle_recipes_get);

  const handle_recipes_import : MockRpcHandler = async (params, method) => {
    const confirmed = Boolean((params as { confirm?: boolean }).confirm);
    return Promise.resolve({
      ok: true,
      id: "imported-demo",
      version: "0.1.0",
      name: "Imported",
      providers: ["aws"],
      buildCommands: [],
      contentHash: "mock-hash",
      sourceType: String((params as { sourceType?: string }).sourceType || "folder"),
      importedPath: String((params as { sourcePath?: string }).sourcePath || ""),
      confirmed,
      validation: { ok: true, findings: [] },
      trustNote: confirmed
        ? "Import accepted and copied (mock)."
        : "Review preview, then call again with confirm=true to copy.",
    });
  };
  register("recipes.import", handle_recipes_import);

  const handle_recipes_validate : MockRpcHandler = async (params, method) => {
    return Promise.resolve({
      ok: true,
      id: "validated-demo",
      version: "0.1.0",
      name: "Validated",
      findings: [],
      sourcePath: String((params as { sourcePath?: string }).sourcePath || ""),
    });
  };
  register("recipes.validate", handle_recipes_validate);

  const handle_recipes_scaffold : MockRpcHandler = async (params, method) => {
    return Promise.resolve({ status: "scaffolded", path: String((params as any).destDir || "") });
  };
  register("recipes.scaffold", handle_recipes_scaffold);

  const handle_tofu_status : MockRpcHandler = async (params, method) => {
    return Promise.resolve({ available: true, version: "1.12.2", path: "(bundled)" });
  };
  register("tofu.status", handle_tofu_status);

  const handle_tofu_install : MockRpcHandler = async (params, method) => {
    const job: JobStatus = { jobId: `job-${Date.now()}`, label: "Install OpenTofu", status: "queued", message: "Preparing." };
    setTimeout(() => emitMockEvent("job.updated", { ...job, status: "completed", message: "OpenTofu 1.12.2 is ready.", completedAt: new Date().toISOString() }), 20);
    return Promise.resolve(job);
  };
  register("tofu.install", handle_tofu_install);

  const handle_deployments_list : MockRpcHandler = async (params, method) => {
    return Promise.resolve([...mockDeployments]);
  };
  register("deployments.list", handle_deployments_list);

  const handle_deployments_get : MockRpcHandler = async (params, method) => {
    return mockGetDeployment(params.deploymentId as string);
  };
  register("deployments.get", handle_deployments_get);

  const handle_deployments_plan : MockRpcHandler = async (params, method) => {
    return mockPlanDeployment(params);
  };
  register("deployments.plan", handle_deployments_plan);

  const handle_deployments_apply : MockRpcHandler = async (params, method) => {
    return mockRunDeployment(params.deploymentId as string, "apply", String(params.policyOverride ?? ""));
  };
  register("deployments.apply", handle_deployments_apply);

  const handle_deployments_destroy : MockRpcHandler = async (params, method) => {
    return mockRunDeployment(params.deploymentId as string, "destroy");
  };
  register("deployments.destroy", handle_deployments_destroy);

  const handle_deployments_checkDrift : MockRpcHandler = async (params, method) => {
    return mockCheckDrift(params.deploymentId as string);
  };
  register("deployments.checkDrift", handle_deployments_checkDrift);

  const handle_deployments_cancel : MockRpcHandler = async (params, method) => {
    return mockCancelDeployment(params.deploymentId as string);
  };
  register("deployments.cancel", handle_deployments_cancel);

  const handle_deployments_delete : MockRpcHandler = async (params, method) => {
    return mockDeleteDeployment(params.deploymentId as string);
  };
  register("deployments.delete", handle_deployments_delete);

  const handle_deployments_retryPostApply : MockRpcHandler = async (params, method) => {
    return mockRetryPostApply(params.deploymentId as string);
  };
  register("deployments.retryPostApply", handle_deployments_retryPostApply);

  const handle_labs_start : MockRpcHandler = async (params, method) => {
    const deployment = mockRequireAppliedDeployment(String(params.deploymentId ?? ""));
    const recipe = mockRequireLabRecipe(deployment);
    const session = mockBuildLabSession(deployment, recipe, "in_progress");
    mockLabSessions.set(deployment.id, session);
    mockEmitLabChanged(session);
    return Promise.resolve(session);
  };
  register("labs.start", handle_labs_start);

  const handle_labs_get : MockRpcHandler = async (params, method) => {
    const deploymentId = String(params.deploymentId ?? "");
    const existing = mockGetLabSessionRecord(deploymentId);
    if (existing) {
      return Promise.resolve(existing);
    }
    const deployment = mockDeployments.find((entry) => entry.id === deploymentId);
    if (!deployment) {
      return Promise.reject(new Error(`deployment ${deploymentId} not found`));
    }
    const recipe = mockRecipes.find((entry) => entry.manifest.id === deployment.recipeId);
    if (!recipe?.manifest.lab) {
      return Promise.reject(new Error(`recipe ${deployment.recipeId} has no lab section`));
    }
    const session = mockBuildLabSession(deployment, recipe, "not_started");
    return Promise.resolve(session);
  };
  register("labs.get", handle_labs_get);

  const handle_labs_verifyStep : MockRpcHandler = async (params, method) => {
    const deployment = mockRequireAppliedDeployment(String(params.deploymentId ?? ""));
    const recipe = mockRequireLabRecipe(deployment);
    const stepId = String(params.stepId ?? "");
    const labStep = recipe.manifest.lab?.steps.find((step) => step.id === stepId);
    if (!labStep) {
      return Promise.reject(new Error(`unknown lab step ${stepId}`));
    }
    const current =
      mockGetLabSessionRecord(deployment.id) ??
      mockBuildLabSession(deployment, recipe, "in_progress");
    const verifyResults = (labStep.verify ?? []).map((check) => {
      const table = mockResolveLabTemplate(String(check.table ?? ""), deployment);
      const passed = Boolean(table);
      return {
        type: String(check.type ?? "verify"),
        passed,
        detail: passed ? `Verified ${table}` : "Could not resolve the verification target",
      };
    });
    const allPassed = verifyResults.every((result) => result.passed);
    const nextSteps = current.steps.map((step) => {
      if (step.stepId !== stepId) {
        return step;
      }
      return {
        ...step,
        status: allPassed ? ("passed" as const) : ("failed" as const),
        verifyResults,
      };
    });
    const stepIndex = recipe.manifest.lab!.steps.findIndex((step) => step.id === stepId);
    if (allPassed && stepIndex >= 0 && stepIndex + 1 < nextSteps.length) {
      nextSteps[stepIndex + 1] = {
        ...nextSteps[stepIndex + 1],
        status: "in_progress",
      };
    }
    const completed = nextSteps.every((step) => step.status === "passed");
    const session: LabSession = {
      ...current,
      status: completed ? "completed" : "in_progress",
      completedAt: completed ? new Date().toISOString() : undefined,
      steps: nextSteps,
    };
    mockLabSessions.set(deployment.id, session);
    mockEmitLabChanged(session);
    return Promise.resolve(session);
  };
  register("labs.verifyStep", handle_labs_verifyStep);

  const handle_labs_runAction : MockRpcHandler = async (params, method) => {
    const deployment = mockRequireAppliedDeployment(String(params.deploymentId ?? ""));
    const recipe = mockRequireLabRecipe(deployment);
    const action = params.action as LabStepAction;
    const current =
      mockGetLabSessionRecord(deployment.id) ??
      mockBuildLabSession(deployment, recipe, "in_progress");
    mockLabSessions.set(deployment.id, current);
    const resolvedAction =
      action.type === "open-tab" && typeof (action as LabStepAction & { focus?: string }).focus === "string"
        ? {
            ...action,
            focus: mockResolveLabTemplate((action as LabStepAction & { focus: string }).focus, deployment),
          }
        : action;
    const result: LabRunActionResult = {
      session: current,
      action: resolvedAction,
    };
    mockEmitLabChanged(current);
    return Promise.resolve(result);
  };
  register("labs.runAction", handle_labs_runAction);

  const handle_labs_reset : MockRpcHandler = async (params, method) => {
    const deployment = mockRequireAppliedDeployment(String(params.deploymentId ?? ""));
    const recipe = mockRequireLabRecipe(deployment);
    const session = mockBuildLabSession(deployment, recipe, "not_started");
    mockLabSessions.set(deployment.id, session);
    mockEmitLabChanged(session);
    return Promise.resolve(session);
  };
  register("labs.reset", handle_labs_reset);

  const handle_gcp_gke_selectCluster : MockRpcHandler = async (params, method) => {
    mockState.session.selectedGcpGkeCluster = String(params.clusterName ?? "");
    appendLog("info", `Selected GKE cluster ${params.clusterName ?? "none"}.`);
    return Promise.resolve(buildMockWorkspace());
  };
  register("gcp.gke.selectCluster", handle_gcp_gke_selectCluster);

  return handlers;
}

const mockRpcHandlers = registerMockHandlers();

export function registeredMockMethods(): string[] {
  return [...mockRpcHandlers.keys()].sort((a, b) => a.localeCompare(b));
}

export function handleMockRequest<T>(
  method: string,
  params: Record<string, unknown>,
): Promise<T> {
  const writeDenied = mockAwsWriteRejectedReason(
    method,
    Boolean(mockState.session.awsWriteModeEnabled),
  );
  if (writeDenied) {
    return Promise.reject(new Error(writeDenied));
  }
  const handler = mockRpcHandlers.get(method);
  if (!handler) {
    return Promise.reject(new Error(`Mock backend method not implemented: ${method}`));
  }
  return handler(params, method) as Promise<T>;
}

const mockLabDynamoDbSpec: LabSpec = {
  difficulty: "beginner",
  estimatedMinutes: 15,
  objectives: ["Inspect the DynamoDB table created by this lab"],
  steps: [
    {
      id: "inspect-table",
      title: "Open the DynamoDB table",
      body: "Use the DynamoDB tab to find the table created by this deployment.",
      actions: [{ type: "open-tab", tab: "aws-dynamodb", focus: "{{ outputs.table_name }}" }],
      verify: [{ type: "dynamodb.table-exists", table: "{{ outputs.table_name }}" }],
      hints: ["The table name is available in the deployment outputs above."],
    },
    {
      id: "scan-items",
      title: "Preview table items",
      body: "Select the table and review the read-only item preview in the inspector.",
      verify: [{ type: "dynamodb.table-readable", table: "{{ outputs.table_name }}" }],
    },
  ],
};

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
      id: "lab-dynamodb-aws",
      kind: "service-lab",
      version: "0.1.0",
      name: "DynamoDB lab (AWS)",
      summary: "A single on-demand DynamoDB table you can query from your app.",
      description: "A focused service lab for DynamoDB with guided verification steps.",
      providers: ["aws"],
      tags: ["dynamodb", "database", "aws", "lab"],
      engine: { type: "opentofu", minVersion: "1.6.0" },
      local: { runtimes: [{ id: "localstack" }] },
      lab: mockLabDynamoDbSpec,
    },
    variables: [
      { name: "app_name", type: "string", default: "mylab", required: false, group: "Application", widget: "text" },
      { name: "environment", type: "string", default: "dev", required: false, group: "Application", widget: "select", options: ["dev", "staging", "prod"] },
      { name: "aws_region", type: "string", default: "us-east-1", required: false, group: "Application", widget: "text" },
    ],
    outputs: [
      { name: "table_name", description: "DynamoDB table name.", primary: true },
      { name: "table_arn", description: "DynamoDB table ARN." },
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
const mockLabSessions = new Map<string, LabSession>();

function mockEmitLabChanged(session: LabSession): void {
  emitMockEvent("lab.changed", { ...session });
}

function mockResolveLabTemplate(value: string, deployment: Deployment): string {
  return value.replace(/\{\{\s*outputs\.([a-zA-Z0-9_]+)\s*\}\}/g, (_match, name: string) => {
    const output = deployment.outputs?.find((entry) => entry.name === name);
    return output ? String(output.value ?? "") : "";
  });
}

function mockBuildLabSession(deployment: Deployment, recipe: Recipe, status: LabSession["status"]): LabSession {
  const lab = recipe.manifest.lab;
  if (!lab) {
    throw new Error(`recipe ${deployment.recipeId} has no lab section`);
  }
  const now = new Date().toISOString();
  const steps = lab.steps.map((step, index) => ({
    stepId: step.id,
    status:
      status === "not_started"
        ? ("pending" as const)
        : index === 0
          ? ("in_progress" as const)
          : ("pending" as const),
    verifyResults: [] as LabSession["steps"][number]["verifyResults"],
  }));
  return {
    deploymentId: deployment.id,
    recipeId: deployment.recipeId,
    status,
    startedAt: now,
    steps,
  };
}

function mockGetLabSessionRecord(deploymentId: string): LabSession | null {
  return mockLabSessions.get(deploymentId) ?? null;
}

function mockRequireAppliedDeployment(deploymentId: string): Deployment {
  const deployment = mockDeployments.find((entry) => entry.id === deploymentId);
  if (!deployment) {
    throw new Error(`deployment ${deploymentId} not found`);
  }
  if (deployment.status !== "applied") {
    throw new Error("Lab is only available after the deployment has been applied");
  }
  return deployment;
}

function mockRequireLabRecipe(deployment: Deployment): Recipe {
  const recipe = mockRecipes.find((entry) => entry.manifest.id === deployment.recipeId);
  if (!recipe?.manifest.lab) {
    throw new Error(`recipe ${deployment.recipeId} has no lab section`);
  }
  return recipe;
}

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
  const updateId = String(params.updateDeploymentId ?? "").trim();
  let deployment: Deployment;
  if (updateId) {
    const existing = mockDeployments.find((entry) => entry.id === updateId);
    if (!existing) {
      return Promise.reject(new Error("update target deployment not found"));
    }
    const updateDenied = updateDeploymentRejectedReason(existing.status);
    if (updateDenied) {
      return Promise.reject(new Error(updateDenied));
    }
    existing.recipeId = String(params.recipeId ?? existing.recipeId);
    existing.name = String(params.name || existing.name);
    existing.providerId = String(params.providerId ?? existing.providerId);
    existing.profileId = String(params.profileId ?? existing.profileId);
    existing.local = Boolean(params.local);
    existing.variables = (params.variables as Record<string, unknown>) ?? existing.variables;
    existing.plan = undefined;
    existing.policy = undefined;
    existing.error = undefined;
    existing.updatedAt = now;
    deployment = existing;
  } else {
    deployment = {
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
  }
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
    deployment.policy = {
      status: "passed",
      planDigest: "sha256:mock-plan",
      decisionDigest: "sha256:mock-policy-decision",
      evaluatedAt: new Date().toISOString(),
      blockingCount: 0,
      findings: [],
    };
    mockSetStatus(deployment, "planned");
    emitMockEvent("job.updated", { ...job, status: "completed", message: "Plan ready: +10 ~0 -0.", completedAt: new Date().toISOString() });
  }, 60);
  return Promise.resolve({ deployment, job });
}

function mockRunDeployment(deploymentId: string, action: "apply" | "destroy", policyOverride = ""): Promise<DeploymentJob> {
  const deployment = mockDeployments.find((entry) => entry.id === deploymentId);
  if (!deployment) {
    return Promise.reject(new Error(`deployment ${deploymentId} not found`));
  }
  if (action === "apply") {
    const applyDenied = applyDeploymentRejectedReason(deployment.status);
    if (applyDenied) {
      return Promise.reject(new Error(applyDenied));
    }
  }
  if (action === "apply" && deployment.policy?.status === "blocked" && deployment.policy.override?.decisionDigest !== deployment.policy.decisionDigest) {
    if (policyOverride !== `APPLY ${deployment.id}`) {
      return Promise.reject(new Error(`policy guardrails blocked apply; type "APPLY ${deployment.id}" to continue`));
    }
    deployment.policy.override = {
      decisionDigest: deployment.policy.decisionDigest,
      confirmedAt: new Date().toISOString(),
      findingKeys: deployment.policy.findings
        .filter((finding) => finding.severity === "deny")
        .map((finding) => `${finding.ruleId}${finding.resourceAddress ? `:${finding.resourceAddress}` : ""}`),
    };
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
    } else if (deployment.recipeId === "lab-dynamodb-aws") {
      deployment.outputs = [
        { name: "table_name", value: `${appName}-${env}-items` },
        { name: "table_arn", value: `arn:aws:dynamodb:us-east-1:000000000000:table/${appName}-${env}-items` },
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
  const retryDenied = retryPostApplyRejectedReason(deployment.status);
  if (retryDenied) {
    return Promise.reject(new Error(retryDenied));
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
  const target = mockDeployments[index];
  const deleteDenied = deleteDeploymentRejectedReason(
    target.status,
    target.outputs?.length ?? 0,
  );
  if (deleteDenied) {
    return Promise.reject(new Error(deleteDenied));
  }
  mockDeployments.splice(index, 1);
  return Promise.resolve({ deleted: true });
}

function mockCheckDrift(deploymentId: string): Promise<CheckDriftResult> {
  const deployment = mockDeployments.find((entry) => entry.id === deploymentId);
  if (!deployment) {
    return Promise.reject(new Error(`deployment ${deploymentId} not found`));
  }
  const driftDenied = driftCheckRejectedReason(deployment.status);
  if (driftDenied) {
    return Promise.reject(new Error(driftDenied));
  }
  // For mock/dev: report no drift. Real impl populates from tofu plan.
  const report: DriftReport = { hasDrift: false };
  deployment.drift = report;
  emitMockEvent("deployment.changed", { ...deployment });
  return Promise.resolve({ deployment: { ...deployment }, drift: report });
}

export function subscribeMockBackendEvent<K extends BackendEventName>(
  eventName: K,
  handler: (payload: BackendEventMap[K]) => void,
): () => void {
  const listeners =
    mockListeners.get(eventName) ??
    new Set<(payload: BackendEventMap[BackendEventName]) => void>();
  listeners.add(handler as (payload: BackendEventMap[BackendEventName]) => void);
  mockListeners.set(eventName, listeners);

  return () => {
    listeners.delete(handler as (payload: BackendEventMap[BackendEventName]) => void);
  };
}
