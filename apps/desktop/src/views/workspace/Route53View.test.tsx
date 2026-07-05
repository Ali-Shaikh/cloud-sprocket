// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "@/lib/theme";
import Route53View from "./Route53View";
import type { Route53WorkspaceSnapshot } from "./Route53View";

const workspaceFixture: Route53WorkspaceSnapshot = {
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
  cloudFormationRegions: [],
  cloudFormationStacks: [],
  cloudFormationStackEvents: [],
  eventBridgeRegions: [],
  eventBridgeBuses: [],
  eventBridgeRules: [],
  selectedRoute53HostedZoneId: "/hostedzone/Z123",
  route53HostedZones: [
    {
      hostedZoneId: "/hostedzone/Z123",
      name: "example.com.",
      recordCount: 2,
      privateZone: false,
      comment: "Demo zone",
    },
  ],
  route53ResourceRecordSets: [
    {
      name: "www.example.com.",
      type: "A",
      ttl: 300,
      values: ["203.0.113.10"],
    },
  ],
  elbRegions: [],
  elbLoadBalancers: [],
  elbTargetGroups: [],
  kmsRegions: [],
  kmsKeys: [],
  kmsAliases: [],

};

describe("Route53View", () => {
  it("renders hosted zone and record inventory", () => {
    render(
      <ThemeProvider>
        <Route53View
          workspace={workspaceFixture}
          actionStatus=""
          onRefresh={vi.fn()}
          onSelectHostedZone={vi.fn()}
        />
      </ThemeProvider>,
    );
    expect(screen.getByText("Route 53")).toBeInTheDocument();
    expect(screen.getAllByText("example.com.").length).toBeGreaterThan(0);
    expect(screen.getByText("www.example.com.")).toBeInTheDocument();
  });

  it("selects a hosted zone when a row is clicked", () => {
    const onSelectHostedZone = vi.fn();
    render(
      <ThemeProvider>
        <Route53View
          workspace={workspaceFixture}
          actionStatus=""
          onRefresh={vi.fn()}
          onSelectHostedZone={onSelectHostedZone}
        />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getAllByText("example.com.")[0]);
    expect(onSelectHostedZone).toHaveBeenCalledWith("/hostedzone/Z123");
  });
});