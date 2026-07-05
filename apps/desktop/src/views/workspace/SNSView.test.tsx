// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { fireEvent, render, screen, within } from "@testing-library/react";
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
  eventBridgeRules: [],

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
        onPublish={vi.fn()}
        onCreateTopic={vi.fn()}
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

  function renderWritableSNSView() {
    const onPublish = vi.fn();
    const onCreateTopic = vi.fn();
    render(
      <ThemeProvider>
        <SNSView
          workspace={{ ...workspaceFixture, awsWritesEnabled: true }}
          actionStatus=""
          onRefresh={vi.fn()}
          onSelectRegion={vi.fn()}
          onSelectEntity={vi.fn()}
          onPublish={onPublish}
          onCreateTopic={onCreateTopic}
        />
      </ThemeProvider>,
    );
    return { onPublish, onCreateTopic };
  }

  it("publishes a message to the selected topic through the publish dialog", () => {
    const { onPublish } = renderWritableSNSView();

    fireEvent.click(screen.getByRole("button", { name: "Publish message" }));
    const dialog = screen.getByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Publish" }));

    expect(onPublish).toHaveBeenCalledWith(
      "arn:aws:sns:us-east-1:000000000000:order-events",
      expect.stringContaining("event"),
    );
  });

  it("creates a topic through the create dialog", () => {
    const { onCreateTopic } = renderWritableSNSView();

    fireEvent.click(screen.getByRole("button", { name: "Create topic" }));
    const dialog = screen.getByRole("alertdialog");
    fireEvent.change(within(dialog).getByPlaceholderText("topic-name"), {
      target: { value: "new-events" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create topic" }));

    expect(onCreateTopic).toHaveBeenCalledWith("new-events");
  });

  it("disables write actions when write mode is off", () => {
    renderSNSView();

    expect(screen.getByRole("button", { name: "Publish message" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Create topic" })).toBeDisabled();
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
          onPublish={vi.fn()}
          onCreateTopic={vi.fn()}
        />
      </ThemeProvider>,
    );

    expect(screen.getByText("SNS requires an AWS workspace")).toBeInTheDocument();
  });
});