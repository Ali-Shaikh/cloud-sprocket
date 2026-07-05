// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "@/lib/theme";
import KMSView from "./KMSView";
import type { KmsWorkspaceSnapshot } from "./KMSView";

const keyId = "1234abcd-5678-90ef-ghij-klmnopqrstuv";

const workspaceFixture: KmsWorkspaceSnapshot = {
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
  ec2Regions: ["us-east-1"],
  ec2Instances: [],
  lambdaRegions: [],
  lambdaFunctions: [],
  dynamodbRegions: [],
  dynamodbTables: [],
  sqsRegions: [],
  sqsQueues: [],
  snsRegions: [],
  snsTopics: [],
  rdsRegions: ["us-east-1"],
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
  route53HostedZones: [],
  route53ResourceRecordSets: [],
  elbRegions: [],
  elbLoadBalancers: [],
  elbTargetGroups: [],
  selectedKmsRegion: "us-east-1",
  selectedKmsKeyId: keyId,
  kmsRegions: ["us-east-1"],
  kmsKeys: [
    {
      keyId,
      arn: `arn:aws:kms:us-east-1:123:key/${keyId}`,
      description: "Demo encryption key",
      keyUsage: "ENCRYPT_DECRYPT",
      keyState: "Enabled",
      keySpec: "SYMMETRIC_DEFAULT",
      origin: "AWS_KMS",
      enabled: true,
    },
  ],
  kmsAliases: [
    {
      aliasName: "alias/demo-key",
      aliasArn: "arn:aws:kms:us-east-1:123:alias/demo-key",
      targetKeyId: keyId,
    },
  ],
};

describe("KMSView", () => {
  it("renders key and alias inventory", () => {
    render(
      <ThemeProvider>
        <KMSView
          workspace={workspaceFixture}
          actionStatus=""
          onRefresh={vi.fn()}
          onSelectRegion={vi.fn()}
          onSelectKey={vi.fn()}
        />
      </ThemeProvider>,
    );
    expect(screen.getByText("Key inventory")).toBeInTheDocument();
    expect(screen.getAllByText(keyId).length).toBeGreaterThan(0);
    expect(screen.getByText("alias/demo-key")).toBeInTheDocument();
  });

  it("selects a key when a row is clicked", () => {
    const onSelectKey = vi.fn();
    render(
      <ThemeProvider>
        <KMSView
          workspace={workspaceFixture}
          actionStatus=""
          onRefresh={vi.fn()}
          onSelectRegion={vi.fn()}
          onSelectKey={onSelectKey}
        />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getAllByText(keyId)[0]);
    expect(onSelectKey).toHaveBeenCalledWith(keyId);
  });
});