// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { render } from "@testing-library/react";
import { describe, expect, expectTypeOf, it, vi } from "vitest";

import type {
  ProfileSummary,
  ProviderSummary,
  SessionSnapshot,
  WorkspaceSnapshot,
} from "@/types/backend";

import {
  WorkspaceSessionProvider,
  type WorkspaceSessionContextValue,
  useWorkspaceSessionContext,
} from "./workspace-session-context";
import type { WorkspaceTabRouterProps } from "./workspace-tab-router-props";

function createWorkspaceSession(): WorkspaceSessionContextValue {
  const session: SessionSnapshot = {
    isLocked: false,
    availableAuthMethods: [],
    workspaceTabs: [],
  };
  const workspace = {} as WorkspaceSnapshot;
  const activeWorkspace = {} as WorkspaceSnapshot;
  const selectedProvider: ProviderSummary = {
    providerId: "aws",
    label: "AWS",
    state: "configured",
    summary: "Configured AWS provider.",
    profileCount: 1,
    locations: [],
  };
  const selectedProfile: ProfileSummary = {
    providerId: "aws",
    profileId: "sandbox",
    displayName: "Sandbox",
    summary: "AWS sandbox profile.",
    sourcePaths: [],
    attributes: [],
    authMethods: [],
  };

  return {
    session,
    setSession: vi.fn<WorkspaceSessionContextValue["setSession"]>(),
    workspace,
    setWorkspace: vi.fn<WorkspaceSessionContextValue["setWorkspace"]>(),
    activeWorkspace,
    providers: [selectedProvider],
    profiles: [selectedProfile],
    selectedProvider,
    selectedProfile,
  };
}

function WorkspaceSessionProbe({
  onValue,
}: {
  onValue: (value: WorkspaceSessionContextValue) => void;
}) {
  onValue(useWorkspaceSessionContext());
  return null;
}

describe("WorkspaceSessionProvider", () => {
  it("forwards session and workspace values to consumers", () => {
    const workspaceSession = createWorkspaceSession();
    const onValue = vi.fn<(value: WorkspaceSessionContextValue) => void>();

    render(
      <WorkspaceSessionProvider value={workspaceSession}>
        <WorkspaceSessionProbe onValue={onValue} />
      </WorkspaceSessionProvider>,
    );

    expect(onValue).toHaveBeenCalledWith(workspaceSession);
  });

  it("fails fast when a consumer has no provider", () => {
    expect(() =>
      render(<WorkspaceSessionProbe onValue={vi.fn()} />),
    ).toThrow(
      "useWorkspaceSessionContext must be used within WorkspaceSessionProvider",
    );
  });

  it("keeps session context values out of the router prop contract", () => {
    type ThreadedSessionValue = Extract<
      keyof WorkspaceTabRouterProps,
      keyof WorkspaceSessionContextValue
    >;
    expectTypeOf<ThreadedSessionValue>().toEqualTypeOf<never>();
  });
});
