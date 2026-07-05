// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/lib/theme";
import ComputeView, { type EC2ActionHistoryItem } from "./ComputeView";
import type { WorkspaceSnapshot } from "@/types/backend";

function mockMatchMedia(matches: boolean) {
  return vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

afterEach(() => {
  vi.restoreAllMocks();
});

const workspaceFixture: WorkspaceSnapshot = {
  provider: {
    providerId: "aws",
    label: "AWS",
    state: "configured",
    summary: "AWS config detected.",
    profileCount: 1,
    commandPath: "aws",
    locations: ["~/.aws/config"],
  },
  profile: {
    providerId: "aws",
    profileId: "sandbox",
    displayName: "sandbox",
    summary: "AWS sandbox profile.",
    sourcePaths: ["~/.aws/config"],
    attributes: [],
    authMethods: [],
  },
  authMethod: "cli",
  runtimeSettings: {
    platformName: "windows",
    configDir: "",
    databasePath: "",
    logPath: "",
    runtimeMode: "cloud",
    localConfigDir: "",
    emulatorStateDir: "",
    localStackImage: "",
    flociAzImage: "",
  },
  environmentDiagnostics: [],
  dockerDiagnostics: { engineState: "available", summary: "", details: [] },
  dockerRuntime: {
    reachable: true,
    host: "",
    hostSource: "",
    resourceOwnership: {
      labelKey: "",
      labelValue: "",
      projectLabelKey: "",
      projectName: "",
      summary: "",
    },
    summary: "",
    details: [],
  },
  dockerResources: [],
  emulatorSummaries: [],
  localConfigArtifacts: [],
  awsWriteCapable: true,
  awsWriteModeEnabled: true,
  awsWritesEnabled: true,
  awsEndpointUrl: "http://localhost:4566",
  azureWriteCapable: false,
  azureWriteModeEnabled: false,
  azureWritesEnabled: false,
  azureResourceGroups: [],
  azureVirtualMachines: [],
  azureStorageAccounts: [],
  azureBlobContainers: [],
  azureBlobs: [],
  azureBlobMetadata: [],
  azureWebApps: [],
  azureAppServicePlans: [],
  azureWebAppSettings: [],
  azureWebAppDeploymentSlots: [],
  azureLogAnalyticsWorkspaces: [],
  azureWafPolicies: [],
  azureWafRuleFireCounts: [],
  azureFunctionApps: [],
  azureFunctions: [],
  azureKeyVaults: [],
  azureKeyVaultSecrets: [],
  azureCosmosAccounts: [],
  azurePostgresServers: [],
  azureCosmosDatabases: [],
  azureCosmosContainers: [],
  azureCosmosItems: [],
  azureFrontDoorProfiles: [],
  azureFrontDoorEndpoints: [],
  azureFrontDoorOriginGroups: [],
  azureFrontDoorOrigins: [],
  azureStorageQueues: [],
  azureQueueMessages: [],
  azureEntraUsers: [],
  azureEntraGroups: [],
  azureEntraApps: [],
  s3Buckets: [],
  s3Objects: [],
  s3ObjectMetadata: [],
  s3ExportSnippets: [],
  selectedEc2Region: "us-east-1",
  selectedEc2InstanceId: "i-0123456789abcdef0",
  ec2StatusMessage: "Loaded 2 EC2 instances from us-east-1.",
  ec2Regions: ["us-east-1"],
  ec2Instances: [
    {
      instanceId: "i-0123456789abcdef0",
      name: "sandbox-api-1",
      state: "running",
      instanceType: "t3.medium",
      availabilityZone: "us-east-1a",
      privateIp: "10.0.14.22",
      publicIp: "203.0.113.10",
    },
    {
      instanceId: "i-0fedcba9876543210",
      name: "sandbox-worker",
      state: "stopped",
      instanceType: "t3.small",
      availabilityZone: "us-east-1b",
    },
  ],
  lambdaRegions: [],
  lambdaFunctions: [],
  selectedDynamodbRegion: "",
  dynamodbRegions: [],
  sqsRegions: [],
  sqsQueues: [],
  snsRegions: [],
  snsTopics: [],
  rdsRegions: [],
  rdsInstances: [],
  ecsRegions: [],
  ecsClusters: [],
  ecsServices: [],
  ecsTasks: [],
  eksRegions: [],
  eksClusters: [],
  eksNodeGroups: [],
  apiGatewayRegions: [],
  apiGatewayApis: [],
  apiGatewayStages: [],
  secretsManagerRegions: [],
  secretsManagerSecrets: [],
  logsRegions: [],
  logGroups: [],
  iamRoles: [],
  iamPolicies: [],
  dynamodbTables: [],
};

function renderComputeView(overrides?: {
  actionInFlight?: boolean;
  actionHistory?: EC2ActionHistoryItem[];
  workspace?: Partial<WorkspaceSnapshot>;
}) {
  const onSelectInstance = vi.fn();
  const onInvokeAction = vi.fn();
  const workspace = { ...workspaceFixture, ...overrides?.workspace };
  render(
    <ThemeProvider>
      <ComputeView
        workspace={workspace}
        actionStatus="Ready for lifecycle actions."
        actionInFlight={overrides?.actionInFlight ?? false}
        actionHistory={overrides?.actionHistory ?? []}
        onRefreshInstances={vi.fn()}
        onSelectRegion={vi.fn()}
        onSelectInstance={onSelectInstance}
        onInvokeAction={onInvokeAction}
      />
    </ThemeProvider>,
  );
  return { onSelectInstance, onInvokeAction };
}

describe("ComputeView", () => {
  it("renders fleet summary and instance inventory table", () => {
    mockMatchMedia(true);
    renderComputeView();

    expect(screen.getByText("EC2 Fleet")).toBeInTheDocument();
    expect(screen.getByText("Instance Inventory")).toBeInTheDocument();
    expect(screen.getAllByText("sandbox-api-1").length).toBeGreaterThan(0);
    expect(screen.getByText("sandbox-worker")).toBeInTheDocument();
  });

  it("does not highlight a row when no instance is selected", () => {
    mockMatchMedia(true);
    renderComputeView({ workspace: { selectedEc2InstanceId: undefined } });

    const selectedRows = document.querySelectorAll('[data-state="selected"]');
    expect(selectedRows).toHaveLength(0);
  });

  it("selects an instance when a row is clicked", () => {
    mockMatchMedia(true);
    const { onSelectInstance } = renderComputeView();

    fireEvent.click(screen.getByText("sandbox-worker"));

    expect(onSelectInstance).toHaveBeenCalledWith("i-0fedcba9876543210");
  });

  it("docks instance detail in the inspector on wide viewports", () => {
    mockMatchMedia(true);
    renderComputeView();

    expect(screen.getByLabelText("EC2 instance details")).toBeInTheDocument();
    expect(screen.getByText("Instance")).toBeInTheDocument();
    expect(screen.getAllByText("sandbox-api-1").length).toBeGreaterThan(0);
    expect(screen.getByText("Copy actions")).toBeInTheDocument();
  });

  it("confirms stop lifecycle action for a running instance", () => {
    mockMatchMedia(true);
    const { onInvokeAction } = renderComputeView();

    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    const dialog = screen.getByRole("alertdialog", { name: "Stop EC2 instance" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm Stop" }));

    expect(onInvokeAction).toHaveBeenCalledWith("stop", "i-0123456789abcdef0");
  });

  it("disables start when the selected instance is running", () => {
    mockMatchMedia(true);
    renderComputeView();

    expect(screen.getByRole("button", { name: "Start" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Stop" })).toBeEnabled();
  });

  it("shows action history entries", () => {
    mockMatchMedia(true);
    renderComputeView({
      actionHistory: [
        {
          jobId: "job-1",
          status: "completed",
          message: "Stopped i-0123456789abcdef0",
          completedAt: "2026-06-15T10:00:00Z",
        },
      ],
    });

    expect(screen.getByText("EC2 Action History")).toBeInTheDocument();
    expect(screen.getByText("Stopped i-0123456789abcdef0")).toBeInTheDocument();
  });
});