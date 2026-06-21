import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/lib/theme";
import AzureCosmosView from "./AzureCosmosView";
import type { WorkspaceSnapshot } from "@/types/backend";

const workspace = {
  profile: { displayName: "floci-az" },
  azureCosmosAccounts: [{ name: "devstoreaccount1" }],
  azureCosmosDatabases: [{ name: "appdb" }],
  azureCosmosContainers: [{ name: "orders", partitionKey: "/customerId" }],
  azureCosmosItems: [{ id: "order-1", json: '{"id":"order-1","total":42}' }],
  selectedAzureCosmosAccount: "devstoreaccount1",
  selectedAzureCosmosDatabase: "appdb",
  selectedAzureCosmosContainer: "orders",
  azureCosmosStatusMessage: "Loaded 1 Cosmos account(s).",
} as unknown as WorkspaceSnapshot;

describe("AzureCosmosView", () => {
  it("shows containers and sample items, and selects a container", () => {
    const onSelectContainer = vi.fn();
    render(
      <ThemeProvider>
        <AzureCosmosView
          workspace={workspace}
          onSelectAccount={() => {}}
          onSelectDatabase={() => {}}
          onSelectContainer={onSelectContainer}
        />
      </ThemeProvider>,
    );

    expect(screen.getByText("orders")).toBeTruthy();
    expect(screen.getByText("/customerId")).toBeTruthy();
    expect(screen.getByText("order-1")).toBeTruthy();

    fireEvent.click(screen.getByText("orders"));
    expect(onSelectContainer).toHaveBeenCalledWith("orders");
  });
});
