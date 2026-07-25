// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { render } from "@testing-library/react";
import { describe, expect, expectTypeOf, it, vi } from "vitest";

import {
  WorkspaceNavigationProvider,
  type WorkspaceNavigationContextValue,
  useWorkspaceNavigationContext,
} from "./workspace-navigation-context";
import type { WorkspaceTabRouterProps } from "./workspace-tab-router-props";

function createWorkspaceNavigation(): WorkspaceNavigationContextValue {
  return {
    activeWorkspaceTabId: "overview",
    setActiveWorkspaceTabId:
      vi.fn<WorkspaceNavigationContextValue["setActiveWorkspaceTabId"]>(),
    activeAzurePageId: "resource-groups",
    setActiveAzurePageId:
      vi.fn<WorkspaceNavigationContextValue["setActiveAzurePageId"]>(),
    lambdaCreateFormOpen: false,
    setLambdaCreateFormOpen:
      vi.fn<WorkspaceNavigationContextValue["setLambdaCreateFormOpen"]>(),
    logAnalyticsPrefill: { query: "AzureActivity", timespan: "PT1H" },
    setLogAnalyticsPrefill:
      vi.fn<WorkspaceNavigationContextValue["setLogAnalyticsPrefill"]>(),
    frontDoorAccessPrefill: {
      trackingReference: "track-123",
      workspace: "operations",
      timespan: "PT30M",
    },
    setFrontDoorAccessPrefill:
      vi.fn<WorkspaceNavigationContextValue["setFrontDoorAccessPrefill"]>(),
    recordLocation:
      vi.fn<NonNullable<WorkspaceNavigationContextValue["recordLocation"]>>(),
    navigateToResourceRef: { current: null },
  };
}

function WorkspaceNavigationProbe({
  onValue,
}: {
  onValue: (value: WorkspaceNavigationContextValue) => void;
}) {
  onValue(useWorkspaceNavigationContext());
  return null;
}

describe("WorkspaceNavigationProvider", () => {
  it("forwards navigation state and callbacks to consumers", () => {
    const navigation = createWorkspaceNavigation();
    const onValue = vi.fn<(value: WorkspaceNavigationContextValue) => void>();

    render(
      <WorkspaceNavigationProvider value={navigation}>
        <WorkspaceNavigationProbe onValue={onValue} />
      </WorkspaceNavigationProvider>,
    );

    expect(onValue).toHaveBeenCalledWith(navigation);
  });

  it("fails fast when a consumer has no provider", () => {
    expect(() =>
      render(<WorkspaceNavigationProbe onValue={vi.fn()} />),
    ).toThrow(
      "useWorkspaceNavigationContext must be used within WorkspaceNavigationProvider",
    );
  });

  it("keeps navigation context values out of the router prop contract", () => {
    type ThreadedNavigationValue = Extract<
      keyof WorkspaceTabRouterProps,
      keyof WorkspaceNavigationContextValue
    >;
    expectTypeOf<ThreadedNavigationValue>().toEqualTypeOf<never>();
  });

  it("keeps obsolete page state out of the router prop contract", () => {
    type LegacyPageStateKey =
      | "activeS3PageId"
      | "setActiveS3PageId"
      | "activeAzureStoragePageId"
      | "setActiveAzureStoragePageId";
    type ThreadedLegacyPageState = Extract<
      keyof WorkspaceTabRouterProps,
      LegacyPageStateKey
    >;
    expectTypeOf<ThreadedLegacyPageState>().toEqualTypeOf<never>();
  });
});
