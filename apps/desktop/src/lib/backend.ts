import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  ActivityLogEntry,
  AppSettingsSnapshot,
  AuthMethod,
  EmulatorStatus,
  JobStatus,
  ProfileSummary,
  ProviderSummary,
  SessionSnapshot,
  StateChangedPayload,
  WorkspaceSnapshot,
  WorkspaceTab,
} from "../types/backend";

export type BackendEventName = "state.changed" | "job.updated" | "log.appended";

type BackendEventMap = {
  "state.changed": StateChangedPayload;
  "job.updated": JobStatus;
  "log.appended": ActivityLogEntry;
};

type MockState = {
  providers: ProviderSummary[];
  profiles: ProfileSummary[];
  session: SessionSnapshot;
  logs: ActivityLogEntry[];
  settings: AppSettingsSnapshot;
  localStackStatus: EmulatorStatus;
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
  },
  localStackStatus: "stopped",
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
          { label: "Image", value: "localstack/localstack" },
          { label: "Status", value: "Up 10 seconds" },
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
          { label: "Image", value: "localstack/localstack:latest" },
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
        status: "not-configured",
        summary: "Managed Azure local runtime is planned but not configured yet.",
        details: [
          { label: "Image", value: "floci/floci-az:latest" },
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
        status: "not-created",
        managed: true,
        summary: "App-managed Azure local connection strings and env values will be written here.",
      },
    ],
    awsEndpointUrl: "http://192.168.50.168:4566",
    awsWritesEnabled: true,
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
      : "S3 inventory is only available for locked AWS workspaces.",
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
      : "EC2 inventory is only available for locked AWS workspaces.",
    ec2Regions: isAWSWorkspace ? mockWorkspaceRegions : [],
    ec2Instances: isAWSWorkspace ? mockWorkspaceInstances : [],
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
            { label: "Image", value: "localstack/localstack:latest" },
            { label: "Port", value: "4566" },
            { label: "Managed Profile", value: "cloudsprocket-localstack" },
          ],
        },
        {
          emulatorId: "floci-az",
          providerId: "azure",
          label: "floci-az",
          kind: "docker",
          status: "not-configured" as EmulatorStatus,
          summary: "Azure local emulator is planned for a future slice.",
          details: [
            { label: "Image", value: "floci/floci-az:latest" },
            { label: "Status", value: "Planned" },
          ],
        },
      ] as T);
    case "emulators.prepareProfile":
      appendLog("info", "Preparing LocalStack managed profile...");
      return Promise.resolve({
        profile: "cloudsprocket-localstack",
        config: `${mockState.settings.localConfigDir}/aws/config`,
        credPath: `${mockState.settings.localConfigDir}/aws/credentials`,
        endpoint: "http://localhost:4566",
      } as T);
    case "emulators.start":
      mockState.localStackStatus = "running";
      appendLog("success", "Started LocalStack.");
      return Promise.resolve({
        emulatorId: "localstack",
        providerId: "aws",
        label: "LocalStack",
        kind: "docker",
        status: "running",
        summary: "LocalStack is running at http://localhost:4566.",
        details: [],
      } as T);
    case "emulators.stop":
      mockState.localStackStatus = "stopped";
      appendLog("info", "Stopped LocalStack.");
      return Promise.resolve({
        emulatorId: "localstack",
        providerId: "aws",
        label: "LocalStack",
        kind: "docker",
        status: "stopped",
        summary: "LocalStack container is present but not running.",
        details: [],
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
    case "session.lock":
      mockState.session.isLocked = true;
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
    default:
      return Promise.reject(new Error(`Mock backend method not implemented: ${method}`));
  }
}

export async function backendRequest<T>(
  method: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  if (!isTauriRuntime()) {
    return handleMockRequest<T>(method, params);
  }

  return invoke<T>("backend_request", { method, params });
}

export async function subscribeToBackendEvent<K extends BackendEventName>(
  eventName: K,
  handler: (payload: BackendEventMap[K]) => void,
): Promise<() => void> {
  if (isTauriRuntime()) {
    const unlisten = await listen<BackendEventMap[K]>(tauriEventName(eventName), (event) => {
      handler(event.payload);
    });
    return () => {
      unlisten();
    };
  }

  const listeners =
    mockListeners.get(eventName) ??
    new Set<(payload: BackendEventMap[BackendEventName]) => void>();
  listeners.add(handler as (payload: BackendEventMap[BackendEventName]) => void);
  mockListeners.set(eventName, listeners);

  return () => {
    listeners.delete(handler as (payload: BackendEventMap[BackendEventName]) => void);
  };
}
