// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/lib/theme";
import ECSView from "./ECSView";
import type { EcsWorkspaceSnapshot } from "./ECSView";

const workspaceFixture: EcsWorkspaceSnapshot = {
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
  selectedEcsRegion: "us-east-1",
  selectedEcsClusterArn: "arn:aws:ecs:us-east-1:123:cluster/demo",
  selectedEcsServiceArn: "arn:aws:ecs:us-east-1:123:service/demo/web",
  selectedEcsTaskArn: "arn:aws:ecs:us-east-1:123:task/demo/abc123",
  ecsStatusMessage: "Loaded 1 clusters, 1 services, and 1 tasks from us-east-1.",
  ecsRegions: ["us-east-1"],
  ecsClusters: [
    {
      clusterArn: "arn:aws:ecs:us-east-1:123:cluster/demo",
      clusterName: "demo",
      status: "ACTIVE",
      runningTasksCount: 1,
      activeServicesCount: 1,
    },
  ],
  ecsServices: [
    {
      serviceArn: "arn:aws:ecs:us-east-1:123:service/demo/web",
      serviceName: "web",
      status: "ACTIVE",
      desiredCount: 1,
      runningCount: 1,
      launchType: "FARGATE",
    },
  ],
  ecsTasks: [
    {
      taskArn: "arn:aws:ecs:us-east-1:123:task/demo/abc123",
      lastStatus: "RUNNING",
      launchType: "FARGATE",
      containers: [{ name: "app", image: "nginx:latest", lastStatus: "RUNNING" }],
    },
  ],
  apiGatewayRegions: [],
  apiGatewayApis: [],
  apiGatewayStages: [],
  secretsManagerRegions: [],
  secretsManagerSecrets: [],
};

function renderECSView() {
  const onSelectRegion = vi.fn();
  const onSelectCluster = vi.fn();
  const onSelectService = vi.fn();
  const onSelectTask = vi.fn();
  const onRefresh = vi.fn();
  render(
    <ThemeProvider>
      <ECSView
        workspace={workspaceFixture}
        actionStatus="Ready to browse ECS inventory."
        onRefresh={onRefresh}
        onSelectRegion={onSelectRegion}
        onSelectCluster={onSelectCluster}
        onSelectService={onSelectService}
        onSelectTask={onSelectTask}
      />
    </ThemeProvider>,
  );
  return { onSelectRegion, onSelectCluster, onSelectService, onSelectTask, onRefresh };
}

describe("ECSView", () => {
  it("renders cluster, service, and task inventory", () => {
    renderECSView();

    expect(screen.getByText("Container Fleet")).toBeInTheDocument();
    expect(screen.getByText("Cluster Inventory")).toBeInTheDocument();
    expect(screen.getAllByText("demo").length).toBeGreaterThan(0);
    expect(screen.getByText("web")).toBeInTheDocument();
    expect(screen.getByText("abc123")).toBeInTheDocument();
    expect(screen.getByText("nginx:latest")).toBeInTheDocument();
  });

  it("selects a task when a row is clicked", () => {
    const { onSelectTask } = renderECSView();

    fireEvent.click(screen.getByText("abc123"));

    expect(onSelectTask).toHaveBeenCalledWith("arn:aws:ecs:us-east-1:123:task/demo/abc123");
  });

  it("shows the AWS workspace empty state for non-AWS providers", () => {
    render(
      <ThemeProvider>
        <ECSView
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
          onSelectService={vi.fn()}
          onSelectTask={vi.fn()}
        />
      </ThemeProvider>,
    );

    expect(screen.getByText("ECS requires an AWS workspace")).toBeInTheDocument();
  });
});