// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { describe, expect, it } from "vitest";

import { filterResourceHits, indexWorkspaceResources } from "./resource-search";
import type { WorkspaceSnapshot } from "@/types/backend";

function emptyWorkspace(): WorkspaceSnapshot {
  return {
    runtimeSettings: {} as WorkspaceSnapshot["runtimeSettings"],
    dockerDiagnostics: {} as WorkspaceSnapshot["dockerDiagnostics"],
    dockerRuntime: { reachable: false } as WorkspaceSnapshot["dockerRuntime"],
    dockerResources: [],
    emulatorSummaries: [],
    localConfigArtifacts: [],
    awsWriteCapable: false,
    awsWriteModeEnabled: false,
    awsWritesEnabled: false,
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
    azureCosmosDatabases: [],
    azureCosmosContainers: [],
    azureCosmosItems: [],
    azurePostgresServers: [],
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
    cloudFormationRegions: [],
    cloudFormationStacks: [],
    cloudFormationStackEvents: [],
    eventBridgeRegions: [],
    eventBridgeBuses: [],
    eventBridgeRules: [],
    route53HostedZones: [],
    route53ResourceRecordSets: [],
    elbRegions: [],
    elbLoadBalancers: [],
    elbTargetGroups: [],
    kmsRegions: [],
    kmsKeys: [],
    kmsAliases: [],
    apiGatewayRegions: [],
    apiGatewayApis: [],
    apiGatewayStages: [],
    secretsManagerRegions: [],
    secretsManagerSecrets: [],
    logsRegions: [],
    logGroups: [],
    iamRoles: [],
    iamPolicies: [],
  };
}

describe("resource search", () => {
  it("indexes AWS inventory resources", () => {
    const workspace = emptyWorkspace();
    workspace.s3Buckets = [{ name: "demo-bucket" }];
    workspace.lambdaFunctions = [{ functionName: "demo-fn", runtime: "nodejs22.x" }];
    const hits = indexWorkspaceResources(workspace, "aws");
    expect(hits.map((hit) => hit.label)).toEqual(["demo-bucket", "demo-fn"]);
    expect(hits[1]?.params).toEqual({
      provider: "aws",
      tab: "lambda",
      resourceKey: "demo-fn",
    });
  });

  it("filters by label and service", () => {
    const workspace = emptyWorkspace();
    workspace.s3Buckets = [{ name: "alpha" }, { name: "beta-logs" }];
    const hits = indexWorkspaceResources(workspace, "aws");
    expect(filterResourceHits(hits, "logs").map((hit) => hit.label)).toEqual(["beta-logs"]);
  });

  it("indexes Azure resources", () => {
    const workspace = emptyWorkspace();
    workspace.azureStorageAccounts = [{ name: "stlab" }];
    const hits = indexWorkspaceResources(workspace, "azure");
    expect(hits[0]?.params.tab).toBe("azure-storage");
  });
});
