// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "@/lib/theme";
import ELBView from "./ELBView";
import type { ElbWorkspaceSnapshot } from "./ELBView";

const loadBalancerArn = "arn:aws:elasticloadbalancing:us-east-1:123:loadbalancer/app/demo-alb/abc";

const workspaceFixture: ElbWorkspaceSnapshot = {
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
  selectedElbRegion: "us-east-1",
  selectedElbLoadBalancerArn: loadBalancerArn,
  elbRegions: ["us-east-1"],
  elbLoadBalancers: [
    {
      loadBalancerArn,
      loadBalancerName: "demo-alb",
      dnsName: "demo-alb.elb.localhost:4566",
      type: "application",
      scheme: "internet-facing",
      state: "active",
    },
  ],
  elbTargetGroups: [
    {
      targetGroupArn: "arn:aws:elasticloadbalancing:us-east-1:123:targetgroup/demo-tg/abc",
      targetGroupName: "demo-tg",
      protocol: "HTTP",
      port: 8080,
      targetType: "ip",
      healthCheckPath: "/health",
    },
  ],
};

describe("ELBView", () => {
  it("renders load balancer and target group inventory", () => {
    render(
      <ThemeProvider>
        <ELBView
          workspace={workspaceFixture}
          actionStatus=""
          onRefresh={vi.fn()}
          onSelectRegion={vi.fn()}
          onSelectLoadBalancer={vi.fn()}
        />
      </ThemeProvider>,
    );
    expect(screen.getByText("Load Balancers")).toBeInTheDocument();
    expect(screen.getAllByText("demo-alb").length).toBeGreaterThan(0);
    expect(screen.getByText("demo-tg")).toBeInTheDocument();
  });

  it("selects a load balancer when a row is clicked", () => {
    const onSelectLoadBalancer = vi.fn();
    render(
      <ThemeProvider>
        <ELBView
          workspace={workspaceFixture}
          actionStatus=""
          onRefresh={vi.fn()}
          onSelectRegion={vi.fn()}
          onSelectLoadBalancer={onSelectLoadBalancer}
        />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getAllByText("demo-alb")[0]);
    expect(onSelectLoadBalancer).toHaveBeenCalledWith(loadBalancerArn);
  });
});