// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/lib/theme";
import SecretsManagerView from "./SecretsManagerView";
import type { SecretsManagerWorkspaceSnapshot } from "./SecretsManagerView";

const workspaceFixture: SecretsManagerWorkspaceSnapshot = {
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
  apiGatewayRegions: [],
  apiGatewayApis: [],
  apiGatewayStages: [],
  secretsManagerRegions: ["us-east-1"],
  secretsManagerSecrets: [
    {
      arn: "arn:aws:secretsmanager:us-east-1:123:secret:cloudsprocket/db-password-abc",
      name: "cloudsprocket/db-password",
      description: "Application database password",
      lastChangedDate: "2026-07-01T10:00:00Z",
    },
    {
      arn: "arn:aws:secretsmanager:us-east-1:123:secret:cloudsprocket/api-key-xyz",
      name: "cloudsprocket/api-key",
      description: "Outbound API credentials",
      rotationEnabled: true,
    },
  ],
  logsRegions: [],
  logGroups: [],
  iamRoles: [],
  iamPolicies: [],
  selectedSecretsManagerRegion: "us-east-1",
  selectedSecretsManagerName: "cloudsprocket/db-password",
  secretsManagerStatusMessage: "Loaded 2 secrets from us-east-1.",
  actionCapabilities: {
    secrets: [{ actionId: "reveal", label: "Reveal secret value", enabled: true, reason: "" }],
  },
};

function renderSecretsManagerView() {
  const onSelectRegion = vi.fn();
  const onSelectSecret = vi.fn();
  const onReveal = vi.fn().mockResolvedValue("postgres://app:local-dev@localhost:5432/cloudsprocket");
  const onRefresh = vi.fn();
  render(
    <ThemeProvider>
      <SecretsManagerView
        workspace={workspaceFixture}
        actionStatus="Ready to browse secrets."
        onRefresh={onRefresh}
        onSelectRegion={onSelectRegion}
        onSelectSecret={onSelectSecret}
        onReveal={onReveal}
      />
    </ThemeProvider>,
  );
  return { onSelectRegion, onSelectSecret, onReveal, onRefresh };
}

describe("SecretsManagerView", () => {
  it("renders secret inventory", () => {
    renderSecretsManagerView();

    expect(screen.getByText("Secret Inventory")).toBeInTheDocument();
    expect(screen.getAllByText("cloudsprocket/db-password").length).toBeGreaterThan(0);
    expect(screen.getByText("cloudsprocket/api-key")).toBeInTheDocument();
    expect(screen.getAllByText("Application database password").length).toBeGreaterThan(0);
  });

  it("selects a secret when a row is clicked", () => {
    const { onSelectSecret } = renderSecretsManagerView();

    fireEvent.click(screen.getByText("cloudsprocket/api-key"));

    expect(onSelectSecret).toHaveBeenCalledWith("cloudsprocket/api-key");
  });

  it("shows the AWS workspace empty state for non-AWS providers", () => {
    render(
      <ThemeProvider>
        <SecretsManagerView
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
          onSelectSecret={vi.fn()}
          onReveal={vi.fn()}
        />
      </ThemeProvider>,
    );

    expect(screen.getByText("Secrets Manager requires an AWS workspace")).toBeInTheDocument();
  });
});