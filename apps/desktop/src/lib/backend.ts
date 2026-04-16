import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  ActivityLogEntry,
  AppSettingsSnapshot,
  AuthMethod,
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
    label: "Actions",
    summary: "Cross-provider command actions.",
    detail: "Command and session actions remain visible while the backend reaches parity.",
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

const mockWorkspaceInstances = [
  {
    instanceId: "i-0123456789abcdef0",
    name: "sandbox-app-1",
    state: "running",
    instanceType: "t3.medium",
    availabilityZone: "us-east-1a",
    privateIp: "10.0.14.22",
  },
  {
    instanceId: "i-0fedcba9876543210",
    name: "sandbox-worker-1",
    state: "stopped",
    instanceType: "t3.small",
    availabilityZone: "us-east-1b",
    privateIp: "10.0.18.11",
  },
];

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
  },
};

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function nextMockLogId(): number {
  return mockState.logs.reduce((max, entry) => Math.max(max, entry.id), 0) + 1;
}

function currentProfile(): ProfileSummary | undefined {
  return mockState.profiles.find(
    (profile) =>
      profile.providerId === mockState.session.currentProviderId &&
      profile.profileId === mockState.session.selectedProfileId,
  );
}

function currentProvider(): ProviderSummary | undefined {
  return mockState.providers.find(
    (provider) => provider.providerId === mockState.session.currentProviderId,
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
  mockState.session.workspaceTabs = mockState.session.isLocked ? mockWorkspaceTabs : [];
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

  return {
    provider,
    profile,
    authMethod: mockState.session.selectedAuthMethod,
    runtimeSettings: mockState.settings,
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
    const unlisten = await listen<BackendEventMap[K]>(eventName, (event) => {
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
