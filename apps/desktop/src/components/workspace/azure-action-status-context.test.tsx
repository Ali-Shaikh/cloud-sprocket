// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, expectTypeOf, it, vi } from "vitest";

import {
  AzureActionStatusProvider,
  type AzureActionStatusContextValue,
  useAzureActionStatusContext,
} from "./azure-action-status-context";
import type { WorkspaceTabRouterProps } from "./workspace-tab-router-props";

function createAzureActionStatus(): AzureActionStatusContextValue {
  return {
    azureActionStatus: "ready",
    setAzureActionStatus: vi.fn(),
    azureStorageActionStatus: "",
    setAzureStorageActionStatus: vi.fn(),
    azureAppServiceActionStatus: "",
    setAzureAppServiceActionStatus: vi.fn(),
    azureFrontDoorActionStatus: "",
    setAzureFrontDoorActionStatus: vi.fn(),
    azureServiceInventoryLoading: false,
    azureLogWorkspaceSelectionLoading: false,
    azureWafConfigLoading: false,
    azureFrontDoorTopologyLoading: false,
  };
}

function AzureActionStatusProbe() {
  const status = useAzureActionStatusContext();
  return (
    <button type="button" onClick={() => status.setAzureActionStatus("working")}>
      {status.azureActionStatus || "empty"}
    </button>
  );
}

describe("AzureActionStatusProvider", () => {
  it("forwards Azure action status values to consumers", () => {
    const value = createAzureActionStatus();

    render(
      <AzureActionStatusProvider value={value}>
        <AzureActionStatusProbe />
      </AzureActionStatusProvider>,
    );

    expect(screen.getByRole("button", { name: "ready" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "ready" }));
    expect(value.setAzureActionStatus).toHaveBeenCalledWith("working");
  });

  it("fails fast when a consumer has no provider", () => {
    expect(() => render(<AzureActionStatusProbe />)).toThrow(
      "useAzureActionStatusContext must be used within AzureActionStatusProvider",
    );
  });

  it("keeps Azure action-status and loading fields out of the router prop contract", () => {
    type LegacyAzureStatusProp =
      | "azureActionStatus"
      | "setAzureActionStatus"
      | "azureStorageActionStatus"
      | "setAzureStorageActionStatus"
      | "azureAppServiceActionStatus"
      | "setAzureAppServiceActionStatus"
      | "azureFrontDoorActionStatus"
      | "setAzureFrontDoorActionStatus"
      | "azureServiceInventoryLoading"
      | "azureLogWorkspaceSelectionLoading"
      | "azureWafConfigLoading"
      | "azureFrontDoorTopologyLoading";

    type ThreadedAzureStatusProp = Extract<keyof WorkspaceTabRouterProps, LegacyAzureStatusProp>;
    expectTypeOf<ThreadedAzureStatusProp>().toEqualTypeOf<never>();
  });
});
