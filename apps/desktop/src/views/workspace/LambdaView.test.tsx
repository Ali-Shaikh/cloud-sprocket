// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/lib/theme";
import LambdaView from "./LambdaView";
import type { AwsLambdaCreateInput, AwsLambdaInvokeResult, WorkspaceSnapshot } from "@/types/backend";

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
  ec2Regions: [],
  ec2Instances: [],
  selectedLambdaRegion: "us-east-1",
  selectedLambdaFunctionName: "process-order",
  lambdaStatusMessage: "Loaded 2 Lambda functions from us-east-1.",
  lambdaRegions: ["us-east-1"],
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
  cloudFormationRegions: [],
  cloudFormationStacks: [],
  cloudFormationStackEvents: [],
  eventBridgeRegions: [],
  eventBridgeBuses: [],
  eventBridgeRules: [],

  logsRegions: [],
  logGroups: [],
  iamRoles: [],
  iamPolicies: [],
  dynamodbTables: [],
  lambdaFunctions: [
    {
      functionName: "process-order",
      runtime: "nodejs20.x",
      memorySize: 512,
      state: "Active",
      handler: "index.handler",
      recentLogs: ["2026-06-15 10:05:12 START RequestId: abc123"],
    },
  ],
};

function renderLambdaView(overrides?: {
  invokeResult?: AwsLambdaInvokeResult | null;
  invokeInFlight?: boolean;
  onCreate?: (input: AwsLambdaCreateInput) => void;
}) {
  const onInvoke = vi.fn();
  const onCreate = overrides?.onCreate ?? vi.fn<(input: AwsLambdaCreateInput) => void>();
  render(
    <ThemeProvider>
      <LambdaView
        workspace={workspaceFixture}
        actionStatus="Ready to invoke."
        invokeResult={overrides?.invokeResult ?? null}
        invokeInFlight={overrides?.invokeInFlight ?? false}
        onRefresh={vi.fn()}
        onSelectRegion={vi.fn()}
        onSelectFunction={vi.fn()}
        onInvoke={onInvoke}
        onCreate={onCreate}
      />
    </ThemeProvider>,
  );
  return { onInvoke, onCreate };
}

describe("LambdaView", () => {
  it("docks function detail in the inspector on wide viewports", () => {
    mockMatchMedia(true);
    renderLambdaView();

    expect(screen.getByLabelText("Lambda function details")).toBeInTheDocument();
    expect(screen.getByText("Function")).toBeInTheDocument();
    expect(screen.getByText("Copy actions")).toBeInTheDocument();
  });

  it("renders inventory, logs, and confirms invoke", async () => {
    mockMatchMedia(true);
    const { onInvoke } = renderLambdaView();

    expect(screen.getByText("Lambda Fleet")).toBeInTheDocument();
    expect(screen.getByText("Function Inventory")).toBeInTheDocument();
    expect(screen.getAllByText("process-order").length).toBeGreaterThan(0);
    expect(screen.getByText("Recent CloudWatch Logs")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Invoke" }));
    });
    expect(screen.getByRole("alertdialog", { name: "Confirm Lambda invoke" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Invoke function" }));
    expect(onInvoke).toHaveBeenCalledWith("process-order", { test: true });
  });

  it("shows the last invoke result", () => {
    mockMatchMedia(true);
    renderLambdaView({
      invokeResult: {
        statusCode: 200,
        executedVersion: "$LATEST",
        payload: '{"ok":true}',
      },
    });

    expect(screen.getByText("Last invoke result")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy response" })).toBeInTheDocument();
  });

  it("shows invoke transport errors in the result panel", () => {
    mockMatchMedia(true);
    renderLambdaView({
      invokeResult: {
        statusCode: 0,
        error: "Lambda invoke requires a local endpoint profile with writes enabled.",
      },
    });

    expect(screen.getByText(/Lambda invoke requires a local endpoint profile/)).toBeInTheDocument();
  });

  it("opens the create form when requested from overview navigation", () => {
    render(
      <ThemeProvider>
        <LambdaView
          workspace={workspaceFixture}
          actionStatus="Ready to invoke."
          invokeResult={null}
          invokeInFlight={false}
          onRefresh={vi.fn()}
          onSelectRegion={vi.fn()}
          onSelectFunction={vi.fn()}
          onInvoke={vi.fn()}
          onCreate={vi.fn()}
          openCreateForm
          onCreateFormOpenChange={vi.fn()}
        />
      </ThemeProvider>,
    );

    expect(screen.getByRole("alertdialog", { name: "Create Lambda function" })).toBeInTheDocument();
  });

  it("confirms inline create function flow", async () => {
    const onCreate = vi.fn();
    renderLambdaView({ onCreate });

    fireEvent.click(screen.getByRole("button", { name: "Create function" }));
    fireEvent.click(screen.getByRole("combobox", { name: "Select code source" }));
    fireEvent.click(screen.getByRole("option", { name: "Inline handler" }));
    fireEvent.change(screen.getByPlaceholderText("my-function"), {
      target: { value: "inline-handler" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review create" }));
    const confirmDialog = screen.getByRole("alertdialog", { name: "Confirm Lambda create" });
    fireEvent.click(within(confirmDialog).getByRole("button", { name: "Create function" }));
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "inline-handler",
        handlerSource: expect.stringContaining("exports.handler"),
      }),
    );
  });

  it("confirms starter create function flow", async () => {
    const onCreate = vi.fn();
    renderLambdaView({ onCreate });

    fireEvent.click(screen.getByRole("button", { name: "Create function" }));
    fireEvent.change(screen.getByPlaceholderText("my-function"), {
      target: { value: "new-handler" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review create" }));
    const confirmDialog = screen.getByRole("alertdialog", { name: "Confirm Lambda create" });
    fireEvent.click(within(confirmDialog).getByRole("button", { name: "Create function" }));
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "new-handler",
        runtime: "nodejs20.x",
        handler: "index.handler",
        memorySize: 128,
        timeout: 30,
      }),
    );
  });
});