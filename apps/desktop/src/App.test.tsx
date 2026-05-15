import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
let s3PrefixDelays: Map<string, number>;
let backendEventHandlers: Record<string, (payload: unknown) => void>;
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
        const delayMs = s3PrefixDelays.get(prefix) ?? 0;
        if (delayMs > 0) {
          await new Promise((resolve) => {
            window.setTimeout(resolve, delayMs);
          });
        }
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
          s3ExportSnippets: [
            {
              label: "S3 URI",
              value: `s3://${workspaceFixture.selectedS3BucketName}/${prefix}filtered-object.json`,
            },
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
          s3ExportSnippets: [
            {
              label: "S3 URI",
              value: `s3://${workspaceFixture.selectedS3BucketName}/${objectKey}`,
            },
          ],
        };
        return workspaceFixture;
      }
      case "aws.s3.analyseUrl":
        return {
          summary: "Nominal expiry is visible in the signed URL.",
          detailFields: [{ label: "Signature Type", value: "AWS SigV4 presigned URL" }],
        };
      case "aws.s3.uploadObject":
        return {
          jobId: "job-upload",
          label: "S3 Upload",
          status: "queued",
          message: "Uploading object.",
        };
      case "aws.s3.presignObject":
        return {
          jobId: "job-presign",
          label: "S3 Signed URL",
          status: "queued",
          message: "Generating a signed URL.",
        };
      case "aws.s3.validateUrl":
        return {
          jobId: "job-validate",
          label: "S3 URL Validation",
          status: "queued",
          message: "Validating the pasted URL.",
        };
      case "aws.ec2.selectRegion":
        workspaceFixture = {
          ...workspaceFixture,
          selectedEc2Region: String(params?.region ?? ""),
          selectedEc2InstanceId: "i-0123456789abcdef0",
          ec2StatusMessage: `Loaded ${workspaceFixture.ec2Instances.length} EC2 instances from ${String(params?.region ?? "")}.`,
        };
        return workspaceFixture;
      case "aws.ec2.selectInstance":
        workspaceFixture = {
          ...workspaceFixture,
          selectedEc2InstanceId: String(params?.instanceId ?? ""),
        };
        return workspaceFixture;
      case "aws.ec2.invokeAction":
        return {
          jobId: "job-ec2",
          label: "EC2 Action",
          status: "queued",
          message: `Queueing EC2 ${params?.action} for ${params?.instanceId}.`,
        };
      default:
        return sessionFixture;
    }
  }),
  subscribeToBackendEvent: vi.fn(
    async (eventName: string, handler: (payload: unknown) => void) => {
      backendEventHandlers[eventName] = handler;
      return () => {
        delete backendEventHandlers[eventName];
      };
    },
  ),
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
        details: "Provider discovery completed in test mode.",
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
      awsWritesEnabled: false,
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
      s3ExportSnippets: [
        {
          label: "S3 URI",
          value: "s3://cloudsprocket-artifacts/reports/weekly-summary.json",
        },
      ],
      selectedEc2Region: "us-east-1",
      selectedEc2InstanceId: "i-0123456789abcdef0",
      ec2StatusMessage: "Loaded 1 EC2 instances from us-east-1.",
      ec2Regions: ["us-east-1"],
      ec2Instances: [
        {
          instanceId: "i-0123456789abcdef0",
          name: "sandbox-api-1",
          state: "running",
          instanceType: "t3.medium",
          availabilityZone: "us-east-1a",
          privateIp: "10.0.14.22",
        },
      ],
    };
    s3PrefixDelays = new Map();
    backendEventHandlers = {};
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
    expect(screen.getByRole("button", { name: "Lock workspace" })).toBeInTheDocument();
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
    workspaceFixture = {
      ...workspaceFixture,
      awsEndpointUrl: "http://192.168.50.168:4566",
      awsWritesEnabled: true,
    };

    render(<App />);

    expect(await screen.findByText("Locked Workspace")).toBeInTheDocument();
    expect(await screen.findByText("Workspace Summary")).toBeInTheDocument();
    expect(screen.getByText("Overview")).toBeInTheDocument();
    expect(screen.getByText("S3")).toBeInTheDocument();
    expect((await screen.findAllByText("workspace sandbox")).length).toBeGreaterThan(0);
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
    expect(await screen.findByRole("complementary", { name: "S3 object details" })).toBeInTheDocument();
    expect(await screen.findByText("Object Detail")).toBeInTheDocument();
    expect(await screen.findByText("Metadata: owner")).toBeInTheDocument();
    expect(await screen.findByText("analytics")).toBeInTheDocument();
    expect(await screen.findByText("Copy snippets")).toBeInTheDocument();
    expect(await screen.findByText(/s3:\/\/cloudsprocket-artifacts\/logs\/filtered-object\.json/i)).toBeInTheDocument();
  });

  it("keeps the S3 prefix input stable when older filter responses finish late", async () => {
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
    s3PrefixDelays.set("l", 650);

    render(<App />);

    fireEvent.click(await screen.findByText("S3"));
    const prefixInput = await screen.findByPlaceholderText(
      "Filter by prefix, for example reports/",
    );

    fireEvent.change(prefixInput, { target: { value: "l" } });
    await act(async () => {
      await new Promise((resolve) => {
        window.setTimeout(resolve, 390);
      });
    });
    fireEvent.change(prefixInput, { target: { value: "lo" } });

    expect(prefixInput).toHaveValue("lo");
    expect((await screen.findAllByText("lofiltered-object.json")).length).toBeGreaterThan(0);

    await act(async () => {
      await new Promise((resolve) => {
        window.setTimeout(resolve, 700);
      });
    });

    await waitFor(() => {
      expect(prefixInput).toHaveValue("lo");
    });
    expect(screen.queryByText("lfiltered-object.json")).not.toBeInTheDocument();
  });

  it("does not restore a previous S3 prefix when a workspace refresh finishes", async () => {
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
    workspaceFixture = {
      ...workspaceFixture,
      s3PrefixFilter: "previous/",
    };

    render(<App />);

    fireEvent.click(await screen.findByText("S3"));
    const prefixInput = await screen.findByPlaceholderText(
      "Filter by prefix, for example reports/",
    );

    expect(prefixInput).toHaveValue("previous/");

    fireEvent.change(prefixInput, { target: { value: "current/" } });
    workspaceFixture = {
      ...workspaceFixture,
      s3PrefixFilter: "previous/",
    };

    await act(async () => {
      backendEventHandlers["job.updated"]?.({
        jobId: "job-upload",
        label: "S3 Upload",
        status: "completed",
        message: "Upload completed.",
        result: {
          destinationUri: "s3://cloudsprocket-artifacts/reports/uploaded.json",
        },
      });
    });

    await waitFor(() => {
      expect(prefixInput).toHaveValue("current/");
    });
  });

  it("renders EC2 inventory and queues lifecycle actions", async () => {
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
          tabId: "ec2",
          label: "EC2",
          summary: "EC2 summary",
          detail: "EC2 panel",
        },
      ],
    };
    workspaceFixture = {
      ...workspaceFixture,
      awsEndpointUrl: "http://192.168.50.168:4566",
      awsWritesEnabled: true,
    };

    render(<App />);

    fireEvent.click(await screen.findByText("EC2"));

    expect(await screen.findByText("EC2 Fleet")).toBeInTheDocument();
    expect(await screen.findByText("Instance Inventory")).toBeInTheDocument();
    expect((await screen.findAllByText("sandbox-api-1")).length).toBeGreaterThan(0);
    expect((await screen.findAllByText("i-0123456789abcdef0")).length).toBeGreaterThan(0);
    expect(await screen.findByText("AWS Console URL")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refresh EC2" }));
    expect(await screen.findByText("Loaded 1 EC2 instances from us-east-1.")).toBeInTheDocument();

    const stopButton = screen.getByRole("button", { name: "Stop" });
    expect(stopButton).not.toBeDisabled();
    await act(async () => {
      fireEvent.click(stopButton);
    });
    expect(await screen.findByRole("dialog", { name: "Stop EC2 instance" })).toBeInTheDocument();
    expect(await screen.findByText(/send a live EC2 stop request/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirm Stop" }));

    expect((await screen.findAllByText(/Queueing EC2 stop for i-0123456789abcdef0/i)).length).toBeGreaterThan(0);
    expect(await screen.findByText("EC2 operation running")).toBeInTheDocument();

    await act(async () => {
      backendEventHandlers["job.updated"]?.({
        jobId: "job-ec2",
        label: "EC2 Action",
        status: "completed",
        message: "EC2 stop completed for i-0123456789abcdef0 in us-east-1. Desired state reached: stopped.",
        result: {
          ...workspaceFixture,
          ec2Instances: [
            {
              ...workspaceFixture.ec2Instances[0],
              state: "stopped",
            },
          ],
        },
      });
    });

    expect((await screen.findAllByText(/Desired state reached: stopped/i)).length).toBeGreaterThan(0);
    expect(await screen.findByText("EC2 Action History")).toBeInTheDocument();
    expect((await screen.findAllByText("stopped")).length).toBeGreaterThan(0);
  });

  it("keeps EC2 lifecycle actions disabled for normal AWS profiles", async () => {
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
          tabId: "ec2",
          label: "EC2",
          summary: "EC2 summary",
          detail: "EC2 panel",
        },
      ],
    };

    render(<App />);

    fireEvent.click(await screen.findByText("EC2"));

    expect(await screen.findByText("Read-only")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stop" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reboot" })).toBeDisabled();
  });

  it("renders a safe EC2 empty state", async () => {
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
          tabId: "ec2",
          label: "EC2",
          summary: "EC2 summary",
          detail: "EC2 panel",
        },
      ],
    };
    workspaceFixture = {
      ...workspaceFixture,
      selectedEc2Region: undefined,
      selectedEc2InstanceId: undefined,
      ec2StatusMessage: "No EC2 region is available for this locked AWS session.",
      ec2Regions: [],
      ec2Instances: [],
    };

    render(<App />);

    fireEvent.click(await screen.findByText("EC2"));

    expect(await screen.findByText("No EC2 region is available for this locked AWS session.")).toBeInTheDocument();
    expect(await screen.findByText("No EC2 instances loaded for this region.")).toBeInTheDocument();
    expect(await screen.findByText("No EC2 instance selected.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Stop" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reboot" })).toBeDisabled();
  });

  it("renders the activity tab and refresh action", async () => {
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
          tabId: "actions",
          label: "Activity",
          summary: "Activity summary",
          detail: "Activity panel",
        },
      ],
    };

    render(<App />);

    fireEvent.click(await screen.findByTitle("Activity: Activity summary"));

    expect(await screen.findByRole("heading", { name: "Activity" })).toBeInTheDocument();
    expect(await screen.findByText("Refresh Discovery")).toBeInTheDocument();
    expect((await screen.findAllByText("Provider discovery completed in test mode.")).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Refresh Discovery" }));

    expect(screen.getByRole("heading", { name: "Activity" })).toBeInTheDocument();
  });
});
