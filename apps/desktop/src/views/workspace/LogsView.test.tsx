// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/lib/theme";
import LogsView from "./LogsView";
import type { LogsWorkspaceSnapshot } from "./LogsView";

const workspaceFixture: LogsWorkspaceSnapshot = {
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
  iamRoles: [],
  iamPolicies: [],
  selectedLogsRegion: "us-east-1",
  selectedLogGroupName: "/aws/lambda/process-order",
  logsStatusMessage: "Loaded 2 log groups from us-east-1.",
  logsRegions: ["us-east-1", "eu-west-2"],
  logGroups: [
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
  ],
};

function renderLogsView() {
  const onSelectRegion = vi.fn();
  const onSelectEntity = vi.fn();
  const onRefresh = vi.fn();
  render(
    <ThemeProvider>
      <LogsView
        workspace={workspaceFixture}
        actionStatus="Ready to browse log groups."
        onRefresh={onRefresh}
        onSelectRegion={onSelectRegion}
        onSelectEntity={onSelectEntity}
      />
    </ThemeProvider>,
  );
  return { onSelectRegion, onSelectEntity, onRefresh };
}

describe("LogsView", () => {
  it("renders inventory and recent event tail", () => {
    renderLogsView();

    expect(screen.getByText("Log Group Fleet")).toBeInTheDocument();
    expect(screen.getByText("Log Group Inventory")).toBeInTheDocument();
    expect(screen.getAllByText("/aws/lambda/process-order").length).toBeGreaterThan(0);
    expect(screen.getByText(/Recent events \(read-only tail\)/)).toBeInTheDocument();
    expect(screen.getAllByText(/START RequestId: abc123/).length).toBeGreaterThan(0);
  });

  it("selects a log group when a row is clicked", () => {
    const { onSelectEntity } = renderLogsView();

    fireEvent.click(screen.getByText("/ecs/cloudsprocket-app"));

    expect(onSelectEntity).toHaveBeenCalledWith("/ecs/cloudsprocket-app");
  });

  it("shows the AWS workspace empty state for non-AWS providers", () => {
    render(
      <ThemeProvider>
        <LogsView
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
          onSelectEntity={vi.fn()}
        />
      </ThemeProvider>,
    );

    expect(screen.getByText("CloudWatch Logs requires an AWS workspace")).toBeInTheDocument();
  });
});