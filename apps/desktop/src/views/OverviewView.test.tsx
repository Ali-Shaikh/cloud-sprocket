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
} as WorkspaceSnapshot;

describe("OverviewView", () => {
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
    expect(screen.getByText("LocalStack")).toBeInTheDocument();
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
});