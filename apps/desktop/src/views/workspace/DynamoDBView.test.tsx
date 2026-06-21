import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/lib/theme";
import DynamoDBView from "./DynamoDBView";
import type { WorkspaceSnapshot } from "@/types/backend";

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
      azureLogAnalyticsWorkspaces: [],
      azureFunctionApps: [],
      azureFunctions: [],
      azureKeyVaults: [],
      azureKeyVaultSecrets: [],
      azureCosmosAccounts: [],
      azureCosmosDatabases: [],
      azureCosmosContainers: [],
      azureCosmosItems: [],
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
      />
    </ThemeProvider>,
  );
  return { onSelectRegion, onSelectTable, onRefresh };
}

describe("DynamoDBView", () => {
  it("renders inventory, schema detail, and sample items", () => {
    renderDynamoDBView();

    expect(screen.getByText("Table Fleet")).toBeInTheDocument();
    expect(screen.getByText("Table Inventory")).toBeInTheDocument();
    expect(screen.getAllByText("cloudsprocket-orders").length).toBeGreaterThan(0);
    expect(screen.getByText("customer-index")).toBeInTheDocument();
    expect(screen.getByText(/Sample items \(read-only scan\)/)).toBeInTheDocument();
    expect(screen.getByText(/"orderId":"ord-001"/)).toBeInTheDocument();
  });

  it("selects a table when a row is clicked", () => {
    const { onSelectTable } = renderDynamoDBView();

    fireEvent.click(screen.getByText("cloudsprocket-sessions"));

    expect(onSelectTable).toHaveBeenCalledWith("cloudsprocket-sessions");
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
        />
      </ThemeProvider>,
    );

    expect(screen.getByText("DynamoDB requires an AWS workspace")).toBeInTheDocument();
  });
});