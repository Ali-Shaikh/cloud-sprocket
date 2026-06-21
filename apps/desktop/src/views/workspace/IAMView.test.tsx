import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/lib/theme";
import IAMView from "./IAMView";
import type { IamWorkspaceSnapshot } from "./IAMView";

const workspaceFixture: IamWorkspaceSnapshot = {
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
  selectedIamRoleName: "cloudsprocket-lambda-role",
  iamStatusMessage: "Loaded 2 IAM roles and 1 customer-managed policies.",
  iamRoles: [
    {
      roleName: "cloudsprocket-lambda-role",
      roleArn: "arn:aws:iam::000000000000:role/cloudsprocket-lambda-role",
      path: "/",
      description: "Lambda execution role for CloudSprocket demos.",
      createDate: "2026-06-01T09:00:00Z",
      attachedPolicies: ["AWSLambdaBasicExecutionRole", "cloudsprocket-data-access"],
    },
    {
      roleName: "cloudsprocket-ecs-task-role",
      roleArn: "arn:aws:iam::000000000000:role/cloudsprocket-ecs-task-role",
      path: "/service/",
      attachedPolicies: ["AmazonECSTaskExecutionRolePolicy"],
    },
  ],
  iamPolicies: [
    {
      policyName: "cloudsprocket-data-access",
      policyArn: "arn:aws:iam::000000000000:policy/cloudsprocket-data-access",
      attachmentCount: 2,
      updateDate: "2026-06-10T14:30:00Z",
    },
  ],
};

function renderIAMView() {
  const onSelectRegion = vi.fn();
  const onSelectEntity = vi.fn();
  const onRefresh = vi.fn();
  render(
    <ThemeProvider>
      <IAMView
        workspace={workspaceFixture}
        actionStatus="Ready to browse roles."
        onRefresh={onRefresh}
        onSelectRegion={onSelectRegion}
        onSelectEntity={onSelectEntity}
      />
    </ThemeProvider>,
  );
  return { onSelectRegion, onSelectEntity, onRefresh };
}

describe("IAMView", () => {
  it("renders inventory, role detail, and customer-managed policies", () => {
    renderIAMView();

    expect(screen.getByText("Role Fleet")).toBeInTheDocument();
    expect(screen.getByText("Role Inventory")).toBeInTheDocument();
    expect(screen.getAllByText("cloudsprocket-lambda-role").length).toBeGreaterThan(0);
    expect(screen.getByText("Customer-managed policies")).toBeInTheDocument();
    expect(screen.getByText("cloudsprocket-data-access")).toBeInTheDocument();
    expect(screen.getAllByText(/Lambda execution role for CloudSprocket demos/).length).toBeGreaterThan(0);
  });

  it("selects a role when a row is clicked", () => {
    const { onSelectEntity } = renderIAMView();

    fireEvent.click(screen.getByText("cloudsprocket-ecs-task-role"));

    expect(onSelectEntity).toHaveBeenCalledWith("cloudsprocket-ecs-task-role");
  });

  it("shows the AWS workspace empty state for non-AWS providers", () => {
    render(
      <ThemeProvider>
        <IAMView
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

    expect(screen.getByText("IAM requires an AWS workspace")).toBeInTheDocument();
  });
});