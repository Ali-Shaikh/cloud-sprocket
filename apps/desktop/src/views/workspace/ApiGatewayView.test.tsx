// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/lib/theme";
import ApiGatewayView from "./ApiGatewayView";
import type { ApiGatewayWorkspaceSnapshot } from "./ApiGatewayView";

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

const workspaceFixture: ApiGatewayWorkspaceSnapshot = {
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
  awsWriteCapable: false,
  awsWriteModeEnabled: false,
  awsWritesEnabled: false,
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
  lambdaRegions: [],
  lambdaFunctions: [],
  dynamodbRegions: [],
  dynamodbTables: [],
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
  selectedApiGatewayRegion: "us-east-1",
  selectedApiGatewayApiKey: "http:xyz789",
  apiGatewayStatusMessage: "Loaded 2 APIs and 1 stages from us-east-1.",
  apiGatewayRegions: ["us-east-1"],
  apiGatewayApis: [
    {
      apiKey: "http:xyz789",
      apiId: "xyz789",
      apiName: "orders-http-api",
      apiType: "HTTP",
      endpoint: "https://xyz789.execute-api.us-east-1.amazonaws.com",
    },
    {
      apiKey: "rest:abc123",
      apiId: "abc123",
      apiName: "legacy-rest-api",
      apiType: "REST",
      endpoint: "https://abc123.execute-api.us-east-1.amazonaws.com",
    },
  ],
  apiGatewayStages: [
    {
      apiKey: "http:xyz789",
      stageName: "$default",
      invokeUrl: "https://xyz789.execute-api.us-east-1.amazonaws.com/$default",
    },
  ],
};

function renderApiGatewayView() {
  const onSelectRegion = vi.fn();
  const onSelectApi = vi.fn();
  const onRefresh = vi.fn();
  render(
    <ThemeProvider>
      <ApiGatewayView
        workspace={workspaceFixture}
        actionStatus="Ready to browse APIs."
        onRefresh={onRefresh}
        onSelectRegion={onSelectRegion}
        onSelectApi={onSelectApi}
      />
    </ThemeProvider>,
  );
  return { onSelectRegion, onSelectApi, onRefresh };
}

describe("ApiGatewayView", () => {
  it("docks API detail and stages in the inspector on wide viewports", () => {
    mockMatchMedia(true);
    renderApiGatewayView();

    expect(screen.getByLabelText("API Gateway details")).toBeInTheDocument();
    expect(screen.getByText("Copy invoke URL")).toBeInTheDocument();
  });

  it("renders API and stage inventory", () => {
    mockMatchMedia(true);
    renderApiGatewayView();

    expect(screen.getByText("API Fleet")).toBeInTheDocument();
    expect(screen.getByText("API Inventory")).toBeInTheDocument();
    expect(screen.getAllByText("orders-http-api").length).toBeGreaterThan(0);
    expect(screen.getByText("legacy-rest-api")).toBeInTheDocument();
    expect(screen.getAllByText("$default").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("https://xyz789.execute-api.us-east-1.amazonaws.com/$default").length,
    ).toBeGreaterThan(0);
  });

  it("selects an API when a row is clicked", () => {
    const { onSelectApi } = renderApiGatewayView();

    fireEvent.click(screen.getByText("legacy-rest-api"));

    expect(onSelectApi).toHaveBeenCalledWith("rest:abc123");
  });

  it("shows the AWS workspace empty state for non-AWS providers", () => {
    render(
      <ThemeProvider>
        <ApiGatewayView
          workspace={{
            ...workspaceFixture,
            provider: {
              providerId: "azure",
              label: "Azure",
              state: "configured",
              summary: "Azure profile cache detected.",
              profileCount: 1,
              locations: [],
            },
          }}
          actionStatus=""
          onRefresh={vi.fn()}
          onSelectRegion={vi.fn()}
          onSelectApi={vi.fn()}
        />
      </ThemeProvider>,
    );

    expect(screen.getByText("API Gateway requires an AWS workspace")).toBeInTheDocument();
  });
});