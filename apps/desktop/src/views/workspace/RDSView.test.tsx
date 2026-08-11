// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/lib/theme";
import RDSView from "./RDSView";
import type { RdsWorkspaceSnapshot } from "./RDSView";

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

const workspaceFixture: RdsWorkspaceSnapshot = {
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
  logsRegions: [],
  logGroups: [],
  iamRoles: [],
  iamPolicies: [],
  selectedRdsRegion: "us-east-1",
  selectedRdsInstanceId: "cloudsprocket-app-db",
  rdsStatusMessage: "Loaded 2 RDS instances from us-east-1.",
  rdsRegions: ["us-east-1", "eu-west-2"],
  rdsInstances: [
    {
      dbInstanceIdentifier: "cloudsprocket-app-db",
      engine: "postgres",
      engineVersion: "15.4",
      status: "available",
      instanceClass: "db.t3.micro",
      endpointAddress: "cloudsprocket-app-db.rds.localhost",
      endpointPort: 5432,
      availabilityZone: "us-east-1a",
      allocatedStorage: 20,
      multiAz: false,
      storageEncrypted: true,
    },
    {
      dbInstanceIdentifier: "cloudsprocket-analytics-db",
      engine: "mysql",
      engineVersion: "8.0",
      status: "available",
      instanceClass: "db.t3.small",
    },
  ],
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

function renderRDSView(overrides?: { workspace?: Partial<RdsWorkspaceSnapshot> }) {
  const onSelectRegion = vi.fn();
  const onSelectEntity = vi.fn();
  const onRefresh = vi.fn();
  const workspace = { ...workspaceFixture, ...overrides?.workspace };
  render(
    <ThemeProvider>
      <RDSView
        workspace={workspace}
        actionStatus="Ready to browse instances."
        onRefresh={onRefresh}
        onSelectRegion={onSelectRegion}
        onSelectEntity={onSelectEntity}
      />
    </ThemeProvider>,
  );
  return { onSelectRegion, onSelectEntity, onRefresh };
}

describe("RDSView", () => {
  it("renders fleet summary and instance inventory table", () => {
    mockMatchMedia(true);
    renderRDSView();

    expect(screen.getByText("Instance Fleet")).toBeInTheDocument();
    expect(screen.getByText("Instance Inventory")).toBeInTheDocument();
    expect(screen.getAllByText("cloudsprocket-app-db").length).toBeGreaterThan(0);
    expect(screen.getByText("cloudsprocket-analytics-db")).toBeInTheDocument();
  });

  it("does not highlight a row when no instance is selected", () => {
    mockMatchMedia(true);
    renderRDSView({ workspace: { selectedRdsInstanceId: undefined } });

    const selectedRows = document.querySelectorAll('[data-state="selected"]');
    expect(selectedRows).toHaveLength(0);
  });

  it("selects an instance when a row is clicked", () => {
    mockMatchMedia(true);
    const { onSelectEntity } = renderRDSView();

    fireEvent.click(screen.getByText("cloudsprocket-analytics-db"));

    expect(onSelectEntity).toHaveBeenCalledWith("cloudsprocket-analytics-db");
  });

  it("docks instance detail in the inspector on wide viewports", () => {
    mockMatchMedia(true);
    renderRDSView();

    expect(screen.getByLabelText("RDS instance details")).toBeInTheDocument();
    expect(screen.getByText("Instance")).toBeInTheDocument();
    expect(screen.getAllByText("cloudsprocket-app-db.rds.localhost:5432").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/postgres 15\.4/).length).toBeGreaterThan(0);
    expect(screen.getByText("Copy actions")).toBeInTheDocument();
  });

  it("shows the AWS workspace empty state for non-AWS providers", () => {
    render(
      <ThemeProvider>
        <RDSView
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

    expect(screen.getByText("RDS requires an AWS workspace")).toBeInTheDocument();
  });

  it("invokes reboot when write mode enables lifecycle actions", () => {
    mockMatchMedia(true);
    const onInvokeLifecycleAction = vi.fn();
    render(
      <ThemeProvider>
        <RDSView
          workspace={{
            ...workspaceFixture,
            awsWritesEnabled: true,
            actionCapabilities: {
              rds: [
                {
                  actionId: "startInstance",
                  label: "Start instance",
                  enabled: true,
                },
                {
                  actionId: "stopInstance",
                  label: "Stop instance",
                  enabled: true,
                },
                {
                  actionId: "rebootInstance",
                  label: "Reboot instance",
                  enabled: true,
                },
              ],
            },
          }}
          actionStatus=""
          onRefresh={vi.fn()}
          onSelectRegion={vi.fn()}
          onSelectEntity={vi.fn()}
          onInvokeLifecycleAction={onInvokeLifecycleAction}
        />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Reboot instance" }));
    // Confirm dialog (header button + dialog action share the label).
    fireEvent.click(screen.getAllByRole("button", { name: "Reboot instance" }).at(-1)!);

    expect(onInvokeLifecycleAction).toHaveBeenCalledWith("reboot", "cloudsprocket-app-db");
  });
});