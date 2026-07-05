// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "@/lib/theme";
import CloudFormationView from "./CloudFormationView";
import type { CloudFormationWorkspaceSnapshot } from "./CloudFormationView";

const workspaceFixture: CloudFormationWorkspaceSnapshot = {
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
  eventBridgeRegions: [],
  eventBridgeBuses: [],
  route53HostedZones: [],
  route53ResourceRecordSets: [],
  eventBridgeRules: [],
  selectedCloudFormationRegion: "us-east-1",
  selectedCloudFormationStackName: "demo",
  cloudFormationRegions: ["us-east-1"],
  cloudFormationStacks: [
    {
      stackId: "arn:stack/demo",
      stackName: "demo",
      stackStatus: "CREATE_COMPLETE",
      creationTime: "2026-03-01T12:00:00Z",
    },
  ],
  cloudFormationStackEvents: [
    {
      eventId: "evt-1",
      logicalResourceId: "MyBucket",
      resourceStatus: "CREATE_COMPLETE",
      resourceType: "AWS::S3::Bucket",
    },
  ],
};

describe("CloudFormationView", () => {
  it("renders stack inventory", () => {
    render(
      <ThemeProvider>
        <CloudFormationView
          workspace={workspaceFixture}
          actionStatus=""
          onRefresh={vi.fn()}
          onSelectRegion={vi.fn()}
          onSelectStack={vi.fn()}
        />
      </ThemeProvider>,
    );
    expect(screen.getByText("CloudFormation")).toBeInTheDocument();
    expect(screen.getAllByText("demo").length).toBeGreaterThan(0);
    expect(screen.getByText("MyBucket")).toBeInTheDocument();
  });

  it("selects a stack when a row is clicked", () => {
    const onSelectStack = vi.fn();
    render(
      <ThemeProvider>
        <CloudFormationView
          workspace={workspaceFixture}
          actionStatus=""
          onRefresh={vi.fn()}
          onSelectRegion={vi.fn()}
          onSelectStack={onSelectStack}
        />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getAllByText("demo")[0]);
    expect(onSelectStack).toHaveBeenCalledWith("demo");
  });
});