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