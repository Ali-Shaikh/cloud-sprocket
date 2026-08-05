// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/lib/theme";
import DynamoDBView from "./DynamoDBView";
import type { WorkspaceSnapshot } from "@/types/backend";

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
  selectedDynamodbRegion: "us-east-1",
  selectedDynamodbTableName: "cloudsprocket-orders",
  dynamodbStatusMessage: "Loaded 2 DynamoDB tables from us-east-1.",
  dynamodbRegions: ["us-east-1", "eu-west-2"],
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
  route53HostedZones: [],
  route53ResourceRecordSets: [],
  elbRegions: [],
  elbLoadBalancers: [],
  elbTargetGroups: [],
  kmsRegions: [],
  kmsKeys: [],
  kmsAliases: [],

  eventBridgeRules: [],

  logsRegions: [],
  logGroups: [],
  iamRoles: [],
  iamPolicies: [],
  dynamodbTables: [
    {
      tableName: "cloudsprocket-orders",
      status: "ACTIVE",
      itemCount: 1284,
      tableSizeBytes: 524288,
      billingMode: "PAY_PER_REQUEST",
      hashKey: "orderId",
      rangeKey: "createdAt",
      globalSecondaryIndexes: [
        {
          indexName: "customer-index",
          hashKey: "customerId",
          rangeKey: "createdAt",
          status: "ACTIVE",
        },
      ],
      sampleItems: [
        '{"orderId":"ord-001","customerId":"cust-42","createdAt":"2026-06-14T10:00:00Z","total":49.99}',
      ],
      sampleItemsNextToken: "token-page-2",
      sampleItemsHasMore: true,
    },
    {
      tableName: "cloudsprocket-sessions",
      status: "ACTIVE",
      itemCount: 42,
      hashKey: "sessionId",
    },
  ],
};

function renderDynamoDBView() {
  const onSelectRegion = vi.fn();
  const onSelectTable = vi.fn();
  const onRefresh = vi.fn();
  render(
    <ThemeProvider>
      <DynamoDBView
        workspace={workspaceFixture}
        actionStatus="Ready to browse tables."
        onRefresh={onRefresh}
        onSelectRegion={onSelectRegion}
        onSelectTable={onSelectTable}
        onPutItem={vi.fn()}
        onDeleteItem={vi.fn()}
      />
    </ThemeProvider>,
  );
  return { onSelectRegion, onSelectTable, onRefresh };
}

describe("DynamoDBView", () => {
  it("docks table detail in the inspector on wide viewports", () => {
    mockMatchMedia(true);
    renderDynamoDBView();

    expect(screen.getByLabelText("DynamoDB table details")).toBeInTheDocument();
    expect(screen.getByText("Table")).toBeInTheDocument();
    expect(screen.getByText("Copy actions")).toBeInTheDocument();
  });

  it("renders inventory, schema detail, and sample items", () => {
    mockMatchMedia(true);
    renderDynamoDBView();

    expect(screen.getByText("Table Fleet")).toBeInTheDocument();
    expect(screen.getByText("Table Inventory")).toBeInTheDocument();
    expect(screen.getAllByText("cloudsprocket-orders").length).toBeGreaterThan(0);
    expect(screen.getByText("customer-index")).toBeInTheDocument();
    expect(screen.getByText(/Sample items \(read-only scan\)/)).toBeInTheDocument();
    expect(screen.getByText(/"orderId":"ord-001"/)).toBeInTheDocument();
  });

  it("loads more sample items when more pages remain", () => {
    mockMatchMedia(true);
    const onLoadMoreItems = vi.fn();
    render(
      <ThemeProvider>
        <DynamoDBView
          workspace={workspaceFixture}
          actionStatus=""
          onRefresh={vi.fn()}
          onSelectRegion={vi.fn()}
          onSelectTable={vi.fn()}
          onPutItem={vi.fn()}
          onDeleteItem={vi.fn()}
          onLoadMoreItems={onLoadMoreItems}
        />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Load more items" }));

    expect(onLoadMoreItems).toHaveBeenCalledTimes(1);
  });

  it("selects a table when a row is clicked", () => {
    const { onSelectTable } = renderDynamoDBView();

    fireEvent.click(screen.getByText("cloudsprocket-sessions"));

    expect(onSelectTable).toHaveBeenCalledWith("cloudsprocket-sessions");
  });

  function renderWritableDynamoDBView() {
    const onPutItem = vi.fn();
    const onDeleteItem = vi.fn();
    render(
      <ThemeProvider>
        <DynamoDBView
          workspace={{ ...workspaceFixture, awsWritesEnabled: true }}
          actionStatus=""
          onRefresh={vi.fn()}
          onSelectRegion={vi.fn()}
          onSelectTable={vi.fn()}
          onPutItem={onPutItem}
          onDeleteItem={onDeleteItem}
        />
      </ThemeProvider>,
    );
    return { onPutItem, onDeleteItem };
  }

  it("puts an item into the selected table through the put dialog", () => {
    mockMatchMedia(true);
    const { onPutItem } = renderWritableDynamoDBView();

    fireEvent.click(screen.getByRole("button", { name: "Put item" }));
    const dialog = screen.getByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Put item" }));

    expect(onPutItem).toHaveBeenCalledWith(
      "cloudsprocket-orders",
      expect.stringContaining("item-001"),
    );
  });

  it("deletes an item from the selected table through the delete dialog", () => {
    mockMatchMedia(true);
    const { onDeleteItem } = renderWritableDynamoDBView();

    fireEvent.click(screen.getByRole("button", { name: "Delete item" }));
    const dialog = screen.getByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete item" }));

    expect(onDeleteItem).toHaveBeenCalledWith(
      "cloudsprocket-orders",
      expect.stringContaining("item-001"),
    );
  });

  it("disables write actions when write mode is off", () => {
    mockMatchMedia(true);
    renderDynamoDBView();

    expect(screen.getByRole("button", { name: "Put item" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete item" })).toBeDisabled();
  });

  it("shows the AWS workspace empty state for non-AWS providers", () => {
    render(
      <ThemeProvider>
        <DynamoDBView
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
          onSelectTable={vi.fn()}
          onPutItem={vi.fn()}
          onDeleteItem={vi.fn()}
        />
      </ThemeProvider>,
    );

    expect(screen.getByText("DynamoDB requires an AWS workspace")).toBeInTheDocument();
  });
});