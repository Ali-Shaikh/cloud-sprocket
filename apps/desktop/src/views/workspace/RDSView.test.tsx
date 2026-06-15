import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/lib/theme";
import RDSView from "./RDSView";
import type { RdsWorkspaceSnapshot } from "./RDSView";

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
  azureResourceGroups: [],
  azureVirtualMachines: [],
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
};

function renderRDSView() {
  const onSelectRegion = vi.fn();
  const onSelectEntity = vi.fn();
  const onRefresh = vi.fn();
  render(
    <ThemeProvider>
      <RDSView
        workspace={workspaceFixture}
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
  it("renders inventory and endpoint detail", () => {
    renderRDSView();

    expect(screen.getByText("Instance Fleet")).toBeInTheDocument();
    expect(screen.getByText("Instance Inventory")).toBeInTheDocument();
    expect(screen.getAllByText("cloudsprocket-app-db").length).toBeGreaterThan(0);
    expect(screen.getAllByText("cloudsprocket-app-db.rds.localhost:5432").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/postgres 15\.4/).length).toBeGreaterThan(0);
  });

  it("selects an instance when a row is clicked", () => {
    const { onSelectEntity } = renderRDSView();

    fireEvent.click(screen.getByText("cloudsprocket-analytics-db"));

    expect(onSelectEntity).toHaveBeenCalledWith("cloudsprocket-analytics-db");
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
});