import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/lib/theme";
import SNSView from "./SNSView";
import type { SnsWorkspaceSnapshot } from "./SNSView";

const workspaceFixture: SnsWorkspaceSnapshot = {
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
  dynamodbRegions: [],
  dynamodbTables: [],
  sqsRegions: [],
  sqsQueues: [],
  rdsRegions: [],
  rdsInstances: [],
  logsRegions: [],
  logGroups: [],
  iamRoles: [],
  iamPolicies: [],
  selectedSnsRegion: "us-east-1",
  selectedSnsTopicArn: "arn:aws:sns:us-east-1:000000000000:order-events",
  snsStatusMessage: "Loaded 2 SNS topics from us-east-1.",
  snsRegions: ["us-east-1", "eu-west-2"],
  snsTopics: [
    {
      topicArn: "arn:aws:sns:us-east-1:000000000000:order-events",
      topicName: "order-events",
      displayName: "Order events",
      subscriptionsConfirmed: "2",
      subscriptionsPending: "0",
      subscriptions: [
        {
          subscriptionArn: "arn:aws:sns:us-east-1:000000000000:order-events:sub-1",
          protocol: "sqs",
          endpoint: "arn:aws:sqs:us-east-1:000000000000:process-order",
        },
      ],
    },
    {
      topicArn: "arn:aws:sns:us-east-1:000000000000:cloudsprocket-alerts",
      topicName: "cloudsprocket-alerts",
      subscriptionsConfirmed: "1",
    },
  ],
};

function renderSNSView() {
  const onSelectRegion = vi.fn();
  const onSelectEntity = vi.fn();
  const onRefresh = vi.fn();
  render(
    <ThemeProvider>
      <SNSView
        workspace={workspaceFixture}
        actionStatus="Ready to browse topics."
        onRefresh={onRefresh}
        onSelectRegion={onSelectRegion}
        onSelectEntity={onSelectEntity}
      />
    </ThemeProvider>,
  );
  return { onSelectRegion, onSelectEntity, onRefresh };
}

describe("SNSView", () => {
  it("renders inventory and subscription detail", () => {
    renderSNSView();

    expect(screen.getByText("Topic Fleet")).toBeInTheDocument();
    expect(screen.getByText("Topic Inventory")).toBeInTheDocument();
    expect(screen.getAllByText("order-events").length).toBeGreaterThan(0);
    expect(screen.getByText("Subscriptions")).toBeInTheDocument();
    expect(screen.getByText("sqs")).toBeInTheDocument();
  });

  it("selects a topic when a row is clicked", () => {
    const { onSelectEntity } = renderSNSView();

    fireEvent.click(screen.getByText("cloudsprocket-alerts"));

    expect(onSelectEntity).toHaveBeenCalledWith(
      "arn:aws:sns:us-east-1:000000000000:cloudsprocket-alerts",
    );
  });

  it("shows the AWS workspace empty state for non-AWS providers", () => {
    render(
      <ThemeProvider>
        <SNSView
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

    expect(screen.getByText("SNS requires an AWS workspace")).toBeInTheDocument();
  });
});