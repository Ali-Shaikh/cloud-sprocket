// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/lib/theme";
import EKSView from "./EKSView";
import type { EksWorkspaceSnapshot } from "./EKSView";

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

const workspaceFixture: EksWorkspaceSnapshot = {
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
  logsRegions: [],
  logGroups: [],
  iamRoles: [],
  iamPolicies: [],
  selectedEksRegion: "us-east-1",
  selectedEksClusterName: "demo",
  eksStatusMessage: "Loaded 1 clusters and 1 node groups from us-east-1.",
  eksRegions: ["us-east-1"],
  eksClusters: [
    {
      clusterArn: "arn:aws:eks:us-east-1:123:cluster/demo",
      clusterName: "demo",
      status: "ACTIVE",
      version: "1.29",
      platformVersion: "eks.5",
      endpoint: "https://demo.eks.us-east-1.amazonaws.com",
    },
  ],
  eksNodeGroups: [
    {
      nodeGroupArn: "arn:aws:eks:us-east-1:123:nodegroup/demo/workers",
      nodeGroupName: "workers",
      status: "ACTIVE",
      desiredSize: 2,
      instanceTypes: ["m5.large"],
      capacityType: "ON_DEMAND",
    },
  ],
  ecsRegions: [],
  ecsClusters: [],
  ecsServices: [],
  ecsTasks: [],
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
  route53HostedZones: [],
  route53ResourceRecordSets: [],
  elbRegions: [],
  elbLoadBalancers: [],
  elbTargetGroups: [],
  kmsRegions: [],
  kmsKeys: [],
  kmsAliases: [],

  eventBridgeRules: [],

};

function renderEKSView() {
  const onSelectRegion = vi.fn();
  const onSelectCluster = vi.fn();
  const onRefresh = vi.fn();
  render(
    <ThemeProvider>
      <EKSView
        workspace={workspaceFixture}
        actionStatus="Ready to browse EKS inventory."
        onRefresh={onRefresh}
        onSelectRegion={onSelectRegion}
        onSelectCluster={onSelectCluster}
      />
    </ThemeProvider>,
  );
  return { onSelectRegion, onSelectCluster, onRefresh };
}

describe("EKSView", () => {
  it("docks cluster detail and node groups in the inspector on wide viewports", () => {
    mockMatchMedia(true);
    renderEKSView();

    expect(screen.getByLabelText("EKS cluster details")).toBeInTheDocument();
    expect(screen.getByText("Copy helpers")).toBeInTheDocument();
  });

  it("renders cluster and node group inventory", () => {
    mockMatchMedia(true);
    renderEKSView();

    expect(screen.getByText("Kubernetes Fleet")).toBeInTheDocument();
    expect(screen.getByText("Cluster Inventory")).toBeInTheDocument();
    expect(screen.getAllByText("demo").length).toBeGreaterThan(0);
    expect(screen.getByText("workers")).toBeInTheDocument();
    expect(screen.getByText("m5.large")).toBeInTheDocument();
  });

  it("selects a cluster when a row is clicked", () => {
    mockMatchMedia(true);
    const { onSelectCluster } = renderEKSView();

    fireEvent.click(screen.getByRole("cell", { name: "demo" }));

    expect(onSelectCluster).toHaveBeenCalledWith("demo");
  });

  it("shows the AWS workspace empty state for non-AWS providers", () => {
    render(
      <ThemeProvider>
        <EKSView
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
          onSelectCluster={vi.fn()}
        />
      </ThemeProvider>,
    );

    expect(screen.getByText("EKS requires an AWS workspace")).toBeInTheDocument();
  });
});