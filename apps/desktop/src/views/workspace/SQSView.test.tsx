// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/lib/theme";
import SQSView from "./SQSView";
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
  selectedSqsRegion: "us-east-1",
  selectedSqsQueueUrl: "http://localhost:4566/000000000000/process-order",
  sqsStatusMessage: "Loaded 2 SQS queues from us-east-1.",
  sqsRegions: ["us-east-1", "eu-west-2"],
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
  eventBridgeRules: [],

  logsRegions: [],
  logGroups: [],
  iamRoles: [],
  iamPolicies: [],
  sqsQueues: [
    {
      queueName: "process-order",
      queueUrl: "http://localhost:4566/000000000000/process-order",
      approximateNumberOfMessages: 4,
      approximateNumberOfMessagesNotVisible: 1,
      visibilityTimeout: 30,
      queueArn: "arn:aws:sqs:us-east-1:000000000000:process-order",
    },
    {
      queueName: "cloudsprocket-events",
      queueUrl: "http://localhost:4566/000000000000/cloudsprocket-events",
      approximateNumberOfMessages: 0,
    },
  ],
};

function renderSQSView(overrides?: { workspace?: Partial<WorkspaceSnapshot> }) {
  const onSelectRegion = vi.fn();
  const onSelectQueue = vi.fn();
  const onRefresh = vi.fn();
  const onPeek = vi.fn();
  const onSendMessage = vi.fn();
  const onCreateQueue = vi.fn();
  const workspace = { ...workspaceFixture, ...overrides?.workspace };
  render(
    <ThemeProvider>
      <SQSView
        workspace={workspace}
        actionStatus="Ready to browse queues."
        peekResult={null}
        peekInFlight={false}
        onRefresh={onRefresh}
        onSelectRegion={onSelectRegion}
        onSelectQueue={onSelectQueue}
        onPeek={onPeek}
        onSendMessage={onSendMessage}
        onCreateQueue={onCreateQueue}
      />
    </ThemeProvider>,
  );
  return { onSelectRegion, onSelectQueue, onRefresh, onPeek, onSendMessage, onCreateQueue };
}

describe("SQSView", () => {
  it("renders fleet summary and queue inventory table", () => {
    mockMatchMedia(true);
    renderSQSView();

    expect(screen.getByText("Queue Fleet")).toBeInTheDocument();
    expect(screen.getByText("Queue Inventory")).toBeInTheDocument();
    expect(screen.getAllByText("process-order").length).toBeGreaterThan(0);
    expect(screen.getByText("cloudsprocket-events")).toBeInTheDocument();
  });

  it("does not highlight a row when no queue is selected", () => {
    mockMatchMedia(true);
    renderSQSView({ workspace: { selectedSqsQueueUrl: undefined } });

    const selectedRows = document.querySelectorAll('[data-state="selected"]');
    expect(selectedRows).toHaveLength(0);
  });

  it("selects a queue when a row is clicked", () => {
    mockMatchMedia(true);
    const { onSelectQueue } = renderSQSView();

    fireEvent.click(screen.getByText("cloudsprocket-events"));

    expect(onSelectQueue).toHaveBeenCalledWith(
      "http://localhost:4566/000000000000/cloudsprocket-events",
    );
  });

  it("docks queue detail in the inspector on wide viewports", () => {
    mockMatchMedia(true);
    renderSQSView();

    expect(screen.getByLabelText("SQS queue details")).toBeInTheDocument();
    expect(screen.getByText("Queue")).toBeInTheDocument();
    expect(screen.getByText("Peek messages")).toBeInTheDocument();
    expect(screen.getByText("Copy actions")).toBeInTheDocument();
  });

  it("sends a message to the selected queue through the send dialog", () => {
    mockMatchMedia(true);
    const { onSendMessage } = renderSQSView();

    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    const dialog = screen.getByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Send message" }));

    expect(onSendMessage).toHaveBeenCalledWith(
      "http://localhost:4566/000000000000/process-order",
      expect.stringContaining("event"),
    );
  });

  it("creates a queue through the create dialog", () => {
    mockMatchMedia(true);
    const { onCreateQueue } = renderSQSView();

    fireEvent.click(screen.getByRole("button", { name: "Create queue" }));
    const dialog = screen.getByRole("alertdialog");
    fireEvent.change(within(dialog).getByPlaceholderText("queue-name"), {
      target: { value: "new-orders" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create queue" }));

    expect(onCreateQueue).toHaveBeenCalledWith("new-orders");
  });

  it("disables write actions when write mode is off", () => {
    mockMatchMedia(true);
    render(
      <ThemeProvider>
        <SQSView
          workspace={{ ...workspaceFixture, awsWritesEnabled: false }}
          actionStatus=""
          peekResult={null}
          peekInFlight={false}
          onRefresh={vi.fn()}
          onSelectRegion={vi.fn()}
          onSelectQueue={vi.fn()}
          onPeek={vi.fn()}
          onSendMessage={vi.fn()}
          onCreateQueue={vi.fn()}
        />
      </ThemeProvider>,
    );

    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Create queue" })).toBeDisabled();
  });

  it("shows the AWS workspace empty state for non-AWS providers", () => {
    render(
      <ThemeProvider>
        <SQSView
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
          peekResult={null}
          peekInFlight={false}
          onRefresh={vi.fn()}
          onSelectRegion={vi.fn()}
          onSelectQueue={vi.fn()}
          onPeek={vi.fn()}
          onSendMessage={vi.fn()}
          onCreateQueue={vi.fn()}
        />
      </ThemeProvider>,
    );

    expect(screen.getByText("SQS requires an AWS workspace")).toBeInTheDocument();
  });
});