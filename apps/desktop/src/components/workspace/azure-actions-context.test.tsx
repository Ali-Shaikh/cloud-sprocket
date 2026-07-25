// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, expectTypeOf, it, vi } from "vitest";

import {
  AzureActionsProvider,
  type AzureActions,
  useAzureActionsContext,
} from "./azure-actions-context";
import type { WorkspaceTabRouterProps } from "./workspace-tab-router-props";

function createAzureActions(): AzureActions {
  return {
    selectAzureWebAppSlot: vi.fn<AzureActions["selectAzureWebAppSlot"]>(
      async () => undefined,
    ),
    selectAzureWebApp: vi.fn<AzureActions["selectAzureWebApp"]>(async () => undefined),
    selectAzureVirtualMachine: vi.fn<AzureActions["selectAzureVirtualMachine"]>(
      async () => undefined,
    ),
    selectAzureResourceGroup: vi.fn<AzureActions["selectAzureResourceGroup"]>(
      async () => undefined,
    ),
    refreshAzureFrontDoorTopology: vi.fn<AzureActions["refreshAzureFrontDoorTopology"]>(
      async () => undefined,
    ),
    refreshAzureWafPolicyConfig: vi.fn<AzureActions["refreshAzureWafPolicyConfig"]>(
      async () => undefined,
    ),
    selectAzureWafPolicy: vi.fn<AzureActions["selectAzureWafPolicy"]>(
      async () => undefined,
    ),
    selectAzureLogAnalyticsWorkspace: vi.fn<
      AzureActions["selectAzureLogAnalyticsWorkspace"]
    >(async () => undefined),
  };
}

function AzureActionProbe() {
  const actions = useAzureActionsContext();
  return (
    <button
      type="button"
      onClick={() => {
        void actions.selectAzureWebApp("orders-api");
      }}
    >
      Select web app
    </button>
  );
}

describe("AzureActionsProvider", () => {
  it("forwards Azure action callbacks to consumers", () => {
    const actions = createAzureActions();

    render(
      <AzureActionsProvider value={actions}>
        <AzureActionProbe />
      </AzureActionsProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Select web app" }));

    expect(actions.selectAzureWebApp).toHaveBeenCalledWith("orders-api");
  });

  it("fails fast when a consumer has no provider", () => {
    expect(() => render(<AzureActionProbe />)).toThrow(
      "useAzureActionsContext must be used within AzureActionsProvider",
    );
  });

  it("keeps Azure action callbacks out of the router prop contract", () => {
    type ThreadedAzureAction = Extract<keyof WorkspaceTabRouterProps, keyof AzureActions>;
    expectTypeOf<ThreadedAzureAction>().toEqualTypeOf<never>();
  });
});
