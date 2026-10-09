// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import OverviewView from "./OverviewView";
import type { SessionSnapshot, WorkspaceSnapshot } from "@/types/backend";

const session: SessionSnapshot = {
  isLocked: true,
  lockedProviderId: "aws",
  workspaceTabs: [],
  availableAuthMethods: [],
};

const workspace = {
  provider: { providerId: "aws", label: "AWS" },
  profile: { profileId: "sandbox", displayName: "sandbox" },
  s3Buckets: [{ name: "demo-bucket" }],
  ec2Instances: [],
  lambdaFunctions: [],
  dynamodbTables: [],
  sqsQueues: [],
  snsTopics: [],
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

  logGroups: [],
  iamRoles: [],
  azureVirtualMachines: [],
  azureResourceGroups: [],
  emulatorSummaries: [
    {
      emulatorId: "localstack",
      providerId: "aws",
      label: "LocalStack",
      kind: "docker",
      status: "stopped",
      summary: "Stopped.",
      details: [],
    },
  ],
  dockerRuntime: {
    reachable: true,
    summary: "Docker reachable.",
    resourceOwnership: "app-managed",
    details: [],
  },
  dockerDiagnostics: {
    engineState: "available",
    summary: "Docker engine available.",
    details: [],
  },
  awsWritesEnabled: false,
  awsWriteCapable: true,
  awsWriteTargetIsLocal: true,
  azureWriteCapable: false,
} as unknown as WorkspaceSnapshot;

const hiddenResourceHits = [
  {
    providerId: "aws",
    serviceId: "rds",
    label: "RDS",
    resourceCount: 2,
  },
];

describe("OverviewView", () => {
  it("renders hidden-resource hint with one-click enable", () => {
    const onEnableHiddenService = vi.fn();
    render(
      <OverviewView
        workspace={workspace}
        session={session}
        providerLabel="AWS"
        profileLabel="sandbox"
        onRefresh={vi.fn()}
        onNavigate={vi.fn()}
        onOpenRuntime={vi.fn()}
        hiddenResourceHits={hiddenResourceHits}
        onEnableHiddenService={onEnableHiddenService}
      />,
    );

    expect(screen.getByText("Resources exist in 1 disabled service")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /review/i }));
    fireEvent.click(screen.getByRole("button", { name: /^enable$/i }));
    expect(onEnableHiddenService).toHaveBeenCalledWith(hiddenResourceHits[0]);
  });

  it("renders the runtime health strip and service stat cards", () => {
    render(
      <OverviewView
        workspace={workspace}
        session={session}
        providerLabel="AWS"
        profileLabel="sandbox"
        onRefresh={vi.fn()}
        onNavigate={vi.fn()}
        onOpenRuntime={vi.fn()}
      />,
    );

    expect(screen.getByText("Local runtime health")).toBeInTheDocument();
    expect(screen.getByText("Docker")).toBeInTheDocument();
    expect(screen.getAllByText("LocalStack").length).toBeGreaterThan(0);
    expect(screen.getByText("S3 buckets")).toBeInTheDocument();
  });

  it("calls onOpenRuntime from the strip action", () => {
    const onOpenRuntime = vi.fn();
    render(
      <OverviewView
        workspace={workspace}
        session={session}
        providerLabel="AWS"
        onRefresh={vi.fn()}
        onNavigate={vi.fn()}
        onOpenRuntime={onOpenRuntime}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Open Local Runtime/i }));
    expect(onOpenRuntime).toHaveBeenCalledTimes(1);
  });

  it("calls onEmulatorQuickStart for a stopped emulator", () => {
    const onEmulatorQuickStart = vi.fn();
    render(
      <OverviewView
        workspace={workspace}
        session={session}
        providerLabel="AWS"
        onRefresh={vi.fn()}
        onNavigate={vi.fn()}
        onOpenRuntime={vi.fn()}
        onEmulatorQuickStart={onEmulatorQuickStart}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^Start$/i }));
    expect(onEmulatorQuickStart).toHaveBeenCalledWith("localstack");
  });

  it("shows Google Cloud services as not loaded until a tab opens", () => {
    render(
      <OverviewView
        workspace={workspace}
        session={{ ...session, lockedProviderId: "gcp" }}
        providerLabel="Google Cloud"
        profileLabel="platform"
        onRefresh={vi.fn()}
        onNavigate={vi.fn()}
        onOpenRuntime={vi.fn()}
      />,
    );

    expect(screen.getByText("Cloud Storage")).toBeInTheDocument();
    expect(screen.getAllByText("Open to load").length).toBe(4);
  });

  it("shows a Google Cloud list failure on the overview card", () => {
    const gcpWorkspace = {
      ...workspace,
      gcpInventory: { gcs: { loaded: true, emptyReason: "error" } },
      gcpStorageBuckets: [],
    } as unknown as WorkspaceSnapshot;
    render(
      <OverviewView
        workspace={gcpWorkspace}
        session={{ ...session, lockedProviderId: "gcp" }}
        providerLabel="Google Cloud"
        onRefresh={vi.fn()}
        onNavigate={vi.fn()}
        onOpenRuntime={vi.fn()}
      />,
    );

    expect(screen.getByText("List failed")).toBeInTheDocument();
    expect(screen.getAllByText("Open to load").length).toBe(3);
  });

  it("hides a Google Cloud card when that service is turned off", () => {
    const tab = (tabId: string, label: string) => ({ tabId, label, summary: label, detail: label });
    render(
      <OverviewView
        workspace={workspace}
        session={{
          ...session,
          lockedProviderId: "gcp",
          workspaceTabs: [
            tab("overview", "Overview"),
            tab("gcp-compute", "Compute Engine"),
            tab("gcp-functions", "Cloud Functions"),
            tab("gcp-gke", "GKE"),
          ],
        }}
        providerLabel="Google Cloud"
        onRefresh={vi.fn()}
        onNavigate={vi.fn()}
        onOpenRuntime={vi.fn()}
      />,
    );

    expect(screen.queryByText("Cloud Storage")).not.toBeInTheDocument();
    expect(screen.getByText("Compute Engine")).toBeInTheDocument();
    expect(screen.getByText("Cloud Functions")).toBeInTheDocument();
    expect(screen.getByText("GKE clusters")).toBeInTheDocument();
  });

  it("shows deferred Azure services as not loaded", () => {
    render(
      <OverviewView
        workspace={{
          ...workspace,
          provider: { providerId: "azure", label: "Azure" },
          profile: { profileId: "sandbox", displayName: "sandbox", attributes: [] },
          azureResourceGroups: [{ name: "rg-platform" }],
          azureStorageAccounts: [],
        } as unknown as WorkspaceSnapshot}
        session={{ ...session, lockedProviderId: "azure" }}
        providerLabel="Azure"
        onRefresh={vi.fn()}
        onNavigate={vi.fn()}
        onOpenRuntime={vi.fn()}
      />,
    );

    const storage = screen.getByText("Storage").closest("button");
    expect(storage).toHaveTextContent("Open to load");
    expect(storage).not.toHaveTextContent("0");
    expect(screen.getAllByText("Open to load")).toHaveLength(8);
    expect(screen.getByText("Resource groups").closest("button")).toHaveTextContent("1");
  });

  it("shows a failed Azure list on the overview card", () => {
    render(
      <OverviewView
        workspace={{
          ...workspace,
          provider: { providerId: "azure", label: "Azure" },
          profile: { profileId: "sandbox", displayName: "sandbox", attributes: [] },
          azureInventory: { storage: { loaded: true, emptyReason: "error" } },
          azureStorageAccounts: [{ name: "logs" }, { name: "data" }],
        } as unknown as WorkspaceSnapshot}
        session={{ ...session, lockedProviderId: "azure" }}
        providerLabel="Azure"
        onRefresh={vi.fn()}
        onNavigate={vi.fn()}
        onOpenRuntime={vi.fn()}
      />,
    );

    const storage = screen.getByText("Storage").closest("button");
    expect(storage).toHaveTextContent("List failed");
    expect(storage).toHaveTextContent("2");
    expect(screen.getAllByText("Open to load")).toHaveLength(7);
  });

  it("shows a loaded empty Azure list as none yet", () => {
    render(
      <OverviewView
        workspace={{
          ...workspace,
          provider: { providerId: "azure", label: "Azure" },
          profile: { profileId: "sandbox", displayName: "sandbox", attributes: [] },
          azureInventory: { storage: { loaded: true, emptyReason: "none_found" } },
          azureStorageAccounts: [],
        } as unknown as WorkspaceSnapshot}
        session={{ ...session, lockedProviderId: "azure" }}
        providerLabel="Azure"
        onRefresh={vi.fn()}
        onNavigate={vi.fn()}
        onOpenRuntime={vi.fn()}
      />,
    );

    const storage = screen.getByText("Storage").closest("button");
    expect(storage).toHaveTextContent("None yet");
    expect(storage).not.toHaveTextContent("Open to load");
  });

  it("hides an Azure card when that service is turned off", () => {
    const tab = (tabId: string, label: string) => ({ tabId, label, summary: label, detail: label });
    render(
      <OverviewView
        workspace={{
          ...workspace,
          provider: { providerId: "azure", label: "Azure" },
          profile: { profileId: "sandbox", displayName: "sandbox", attributes: [] },
        } as unknown as WorkspaceSnapshot}
        session={{
          ...session,
          lockedProviderId: "azure",
          workspaceTabs: [
            tab("overview", "Overview"),
            tab("azure-overview", "Azure"),
            tab("azure-vms", "Virtual machines"),
            tab("azure-functions", "Functions"),
          ],
        }}
        providerLabel="Azure"
        onRefresh={vi.fn()}
        onNavigate={vi.fn()}
        onOpenRuntime={vi.fn()}
      />,
    );

    expect(screen.queryByText("Storage")).not.toBeInTheDocument();
    expect(screen.queryByText("App Service")).not.toBeInTheDocument();
    expect(screen.getByText("Resource groups")).toBeInTheDocument();
    expect(screen.getByText("Virtual machines")).toBeInTheDocument();
    expect(screen.getByText("Functions").closest("button")).toHaveTextContent("Open to load");
  });

  it("hides local runtime health on real cloud workspaces", () => {
    const cloudWorkspace = {
      ...workspace,
      awsWriteTargetIsLocal: false,
      profile: { profileId: "prod", displayName: "prod" },
    } as unknown as WorkspaceSnapshot;
    render(
      <OverviewView
        workspace={cloudWorkspace}
        session={session}
        providerLabel="AWS"
        profileLabel="prod"
        onRefresh={vi.fn()}
        onNavigate={vi.fn()}
        onOpenRuntime={vi.fn()}
      />,
    );

    expect(screen.queryByText("Local runtime health")).not.toBeInTheDocument();
    expect(screen.queryByText("LocalStack")).not.toBeInTheDocument();
    expect(screen.getByText("S3 buckets")).toBeInTheDocument();
  });
});