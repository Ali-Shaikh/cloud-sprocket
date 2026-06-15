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
} from "../types/backend";

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
    : providerId === "azure"
      ? mockAzureWorkspaceTabs
      : mockWorkspaceTabs;
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
    selectedAzureResourceGroup,
    selectedAzureVmId,
    azureStatusMessage: isAzureWorkspace
      ? azureVirtualMachines.length > 0
        ? `Loaded ${azureVirtualMachines.length} Azure virtual machines from ${selectedAzureResourceGroup}.`
        : `No Azure virtual machines were returned for ${selectedAzureResourceGroup}.`
      : undefined,
    azureResourceGroups: isAzureWorkspace ? mockAzureResourceGroups : [],
    azureVirtualMachines: isAzureWorkspace ? azureVirtualMachines : [],
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
      return Promise.resolve(mockState.providers as T);
    case "profiles.list":
      return Promise.resolve(filteredProfiles(params.providerId as string | undefined) as T);
    case "session.get":
      rebuildSessionDerivedState();
      return Promise.resolve(mockState.session as T);
    case "workspace.get":
      rebuildSessionDerivedState();
      return Promise.resolve(buildMockWorkspace() as T);
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
    case "aws.sns.selectRegion":
      mockState.session.selectedSnsRegion = String(params.region ?? "");
      mockState.session.selectedSnsTopicArn = undefined;
      appendLog("info", `Selected SNS region ${params.region}.`);
      return Promise.resolve(buildMockWorkspace() as T);
    case "aws.sns.selectTopic":
      mockState.session.selectedSnsTopicArn = String(params.topicArn ?? "");
      appendLog("info", `Selected SNS topic ${params.topicArn}.`);
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
      if (!mockState.session.isLocked || mockState.session.lockedProviderId !== "aws") {
        return Promise.reject(new Error("open a locked AWS workspace before changing write mode"));
      }
      if (params.enabled && !buildMockWorkspace().awsWriteCapable) {
        return Promise.reject(
          new Error(
            "this profile cannot enable write mode: configure a local endpoint_url and cloudsprocket_allow_writes = true",
          ),
        );
      }
      mockState.session.awsWriteModeEnabled = Boolean(params.enabled);
      appendLog(
        params.enabled ? "warning" : "info",
        params.enabled ? "Write mode enabled for this workspace session." : "Write mode disabled for this workspace session.",
      );
      return Promise.resolve(buildMockWorkspace() as T);
    case "session.lock":
      mockState.session.isLocked = true;
      mockState.session.awsWriteModeEnabled = false;
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
      mockState.session.lockedProviderId = undefined;
      mockState.session.lockedProfileId = undefined;
      mockState.session.lockedAuthMethod = undefined;
      mockState.session.selectedAzureResourceGroup = undefined;
      mockState.session.selectedAzureVmId = undefined;
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
    case "app.reset":
      if (String(params.confirmation ?? "") !== "RESET") {
        return Promise.reject(new Error("type RESET to confirm the app reset"));
      }
      mockState.session = {
        ...initialMockSession,
        availableAuthMethods: [...initialMockSession.availableAuthMethods],
        workspaceTabs: [],
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
      version: "0.1.0",
      name: "Serverless full-stack (AWS)",
      summary: "Static frontend on S3, a Node API on Lambda behind API Gateway, and a DynamoDB table.",
      description: "A serverless full-stack starter that runs on LocalStack's free tier and ships unchanged to real AWS.",
      providers: ["aws"],
      tags: ["serverless", "fullstack", "aws", "starter"],
      engine: { type: "opentofu", minVersion: "1.6.0" },
      local: { emulator: "localstack" },
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
      version: "0.1.0",
      name: "Container full-stack (AWS)",
      summary: "A Node container on ECS Fargate behind an ALB, a Postgres RDS database, and a CloudFront frontend.",
      description: "The traditional shape. Uses ECS, RDS, ELBv2 and CloudFront, which only emulate on LocalStack Pro.",
      providers: ["aws"],
      tags: ["container", "fullstack", "aws", "ecs", "rds"],
      engine: { type: "opentofu", minVersion: "1.6.0" },
      local: { emulator: "localstack", requiresPro: true },
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
      version: "0.1.0",
      name: "Static website (AWS S3)",
      summary: "A static website served from an S3 bucket, with your built site uploaded automatically.",
      description: "An S3 static website recipe that runs on LocalStack's free tier and can deploy to real AWS.",
      providers: ["aws"],
      tags: ["static", "website", "s3", "aws", "starter"],
      engine: { type: "opentofu", minVersion: "1.6.0" },
      local: { emulator: "localstack" },
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
        payload: { requestId, result },
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
      payload: { requestId, result },
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
