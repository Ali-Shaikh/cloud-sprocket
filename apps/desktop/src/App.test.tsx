import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import type {
  ActivityLogEntry,
  AppSettingsSnapshot,
  ProfileSummary,
  ProviderSummary,
  SessionSnapshot,
  WorkspaceSnapshot,
} from "./types/backend";

const providerFixtures: ProviderSummary[] = [
  {
    providerId: "aws",
    label: "AWS",
    state: "configured",
    summary: "AWS config detected.",
    profileCount: 1,
    commandPath: "aws",
    locations: ["~/.aws/config"],
  },
];

const profileFixtures: ProfileSummary[] = [
  {
    providerId: "aws",
    profileId: "sandbox",
    displayName: "sandbox",
    summary: "AWS sandbox profile.",
    sourcePaths: ["~/.aws/config"],
    attributes: [
      { label: "Region", value: "us-east-1" },
      { label: "AWS Secret Access Key", value: "super-secret-value", sensitive: true },
    ],
    authMethods: [
      { method: "cli", label: "CLI", summary: "AWS CLI detected.", available: true },
      { method: "sso", label: "SSO", summary: "SSO metadata detected.", available: true },
      { method: "local-files", label: "Local Files", summary: "Read-only data.", available: true },
    ],
  },
];

let sessionFixture: SessionSnapshot;
let logFixtures: ActivityLogEntry[];
let workspaceFixture: WorkspaceSnapshot;
const settingsFixture: AppSettingsSnapshot = {
  platformName: "windows",
  configDir: "C:/Users/Ali/AppData/Local/CloudSprocket",
  databasePath: "C:/Users/Ali/AppData/Local/CloudSprocket/cloudsprocket.db",
  logPath: "C:/Users/Ali/AppData/Local/CloudSprocket/logs/cloudsprocket.log",
};

vi.mock("./lib/backend", () => ({
  backendRequest: vi.fn(async (method: string, params?: Record<string, unknown>) => {
    switch (method) {
      case "providers.list":
        return providerFixtures;
      case "profiles.list":
        return profileFixtures;
      case "session.get":
        return sessionFixture;
      case "app.settings.get":
        return settingsFixture;
      case "workspace.get":
        return workspaceFixture;
      case "logs.list":
        return logFixtures;
      case "actions.invoke":
        return {
          jobId: "job-1",
          label: "Refresh Discovery",
          status: "queued",
          message: "Refreshing discovery.",
        };
      case "aws.s3.setPrefixFilter": {
        const prefix = String(params?.prefix ?? "");
        workspaceFixture = {
          ...workspaceFixture,
          s3PrefixFilter: prefix,
          s3StatusMessage: `Loaded 1 objects from ${workspaceFixture.selectedS3BucketName}.`,
          s3Objects: [{ key: `${prefix}filtered-object.json`, size: "128 B" }],
          selectedS3ObjectKey: `${prefix}filtered-object.json`,
          s3ObjectMetadata: [
            { label: "Bucket", value: workspaceFixture.selectedS3BucketName ?? "" },
            { label: "Key", value: `${prefix}filtered-object.json` },
            { label: "Metadata: owner", value: "analytics" },
          ],
        };
        return workspaceFixture;
      }
      case "aws.s3.selectObject": {
        const objectKey = String(params?.objectKey ?? "");
        workspaceFixture = {
          ...workspaceFixture,
          selectedS3ObjectKey: objectKey,
          s3ObjectMetadata: [
            { label: "Bucket", value: workspaceFixture.selectedS3BucketName ?? "" },
            { label: "Key", value: objectKey },
          ],
        };
        return workspaceFixture;
      }
      default:
        return sessionFixture;
    }
  }),
  subscribeToBackendEvent: vi.fn(async () => () => undefined),
}));

describe("App", () => {
  beforeEach(() => {
    sessionFixture = {
      currentProviderId: "aws",
      selectedProfileId: "sandbox",
      selectedAuthMethod: "cli",
      isLocked: false,
      availableAuthMethods: profileFixtures[0].authMethods,
      workspaceTabs: [],
    };
    logFixtures = [
      {
        id: 1,
        level: "info",
        message: "Initial discovery loaded.",
        timestamp: "2026-04-14T09:00:00Z",
      },
    ];
    workspaceFixture = {
      provider: providerFixtures[0],
      profile: {
        ...profileFixtures[0],
        displayName: "workspace sandbox",
      },
      authMethod: "cli",
      runtimeSettings: {
        ...settingsFixture,
        databasePath: "D:/Workspace/runtime/cloudsprocket-workspace.db",
      },
      selectedS3BucketName: "cloudsprocket-artifacts",
      selectedS3ObjectKey: "reports/weekly-summary.json",
      s3PrefixFilter: "",
      s3StatusMessage: "Loaded 1 objects from cloudsprocket-artifacts.",
      s3Buckets: [
        { name: "cloudsprocket-artifacts" },
        { name: "cloudsprocket-reports" },
      ],
      s3Objects: [{ key: "reports/weekly-summary.json" }],
      s3ObjectMetadata: [
        { label: "Bucket", value: "cloudsprocket-artifacts" },
        { label: "Key", value: "reports/weekly-summary.json" },
      ],
      ec2Instances: [{ instanceId: "i-0123456789abcdef0" }],
    };
  });

  it("renders the session setup view while unlocked", async () => {
    render(<App />);

    expect(await screen.findByText("Session Setup")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Choose Provider" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Choose Authentication Path" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Profile Detail" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Runtime Settings" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lock Session" })).toBeInTheDocument();
  });

  it("masks sensitive profile values until they are revealed", async () => {
    render(<App />);

    expect(await screen.findByText("Hidden until revealed")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reveal Sensitive Values" }));
    expect(await screen.findByText("super-secret-value")).toBeInTheDocument();
  });

  it("renders the locked workspace tabs when the session is locked", async () => {
    sessionFixture = {
      ...sessionFixture,
      isLocked: true,
      lockedProviderId: "aws",
      lockedProfileId: "sandbox",
      lockedAuthMethod: "cli",
      workspaceTabs: [
        {
          tabId: "overview",
          label: "Overview",
          summary: "Summary",
          detail: "Overview panel",
        },
        {
          tabId: "s3",
          label: "S3",
          summary: "S3 summary",
          detail: "S3 panel",
        },
      ],
    };

    render(<App />);

    expect(await screen.findByText("Locked Workspace")).toBeInTheDocument();
    expect(await screen.findByText("Workspace Summary")).toBeInTheDocument();
    expect(screen.getByText("Overview")).toBeInTheDocument();
    expect(screen.getByText("S3")).toBeInTheDocument();
    expect(await screen.findByText("workspace sandbox")).toBeInTheDocument();
    expect(await screen.findByText("2 buckets")).toBeInTheDocument();
    expect(
      await screen.findByText(/cloudsprocket-workspace\.db/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unlock" })).toBeInTheDocument();
  });

  it("applies S3 prefix filtering and renders selected object metadata", async () => {
    sessionFixture = {
      ...sessionFixture,
      isLocked: true,
      lockedProviderId: "aws",
      lockedProfileId: "sandbox",
      lockedAuthMethod: "cli",
      workspaceTabs: [
        {
          tabId: "overview",
          label: "Overview",
          summary: "Summary",
          detail: "Overview panel",
        },
        {
          tabId: "s3",
          label: "S3",
          summary: "S3 summary",
          detail: "S3 panel",
        },
      ],
    };

    render(<App />);

    fireEvent.click(await screen.findByText("S3"));
    const prefixInput = await screen.findByPlaceholderText(
      "Filter by prefix, for example reports/",
    );
    fireEvent.change(prefixInput, { target: { value: "logs/" } });

    expect((await screen.findAllByText("logs/filtered-object.json")).length).toBeGreaterThan(0);
    expect(await screen.findByText("Metadata: owner")).toBeInTheDocument();
    expect(await screen.findByText("analytics")).toBeInTheDocument();
  });
});
