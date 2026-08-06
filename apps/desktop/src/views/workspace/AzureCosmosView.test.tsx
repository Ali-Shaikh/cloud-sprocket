// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/lib/theme";
import AzureCosmosView, { partitionKeyValueFromItem } from "./AzureCosmosView";
import type { WorkspaceSnapshot } from "@/types/backend";

const workspace = {
  profile: { displayName: "floci-az" },
  azureCosmosAccounts: [{ name: "devstoreaccount1" }],
  azureCosmosDatabases: [{ name: "appdb" }],
  azureCosmosContainers: [{ name: "orders", partitionKey: "/customerId" }],
  azureCosmosItems: [{ id: "order-1", json: '{"id":"order-1","customerId":"cust-9","total":42}' }],
  selectedAzureCosmosAccount: "devstoreaccount1",
  selectedAzureCosmosDatabase: "appdb",
  selectedAzureCosmosContainer: "orders",
  azureCosmosStatusMessage: "Loaded 1 Cosmos account(s).",
  azureWritesEnabled: false,
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
          onDeleteItem={() => {}}
        />
      </ThemeProvider>,
    );

    expect(screen.getByText("orders")).toBeTruthy();
    expect(screen.getByText("/customerId")).toBeTruthy();
    expect(screen.getByText("order-1")).toBeTruthy();

    fireEvent.click(screen.getByText("orders"));
    expect(onSelectContainer).toHaveBeenCalledWith("orders");
  });

  it("deletes an item when write mode is on", () => {
    const onDeleteItem = vi.fn();
    render(
      <ThemeProvider>
        <AzureCosmosView
          workspace={{ ...workspace, azureWritesEnabled: true }}
          onSelectAccount={() => {}}
          onSelectDatabase={() => {}}
          onSelectContainer={() => {}}
          onDeleteItem={onDeleteItem}
        />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = screen.getByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete item" }));

    expect(onDeleteItem).toHaveBeenCalledWith("order-1", "cust-9", undefined);
  });

  it("disables delete when write mode is off", () => {
    render(
      <ThemeProvider>
        <AzureCosmosView
          workspace={workspace}
          onSelectAccount={() => {}}
          onSelectDatabase={() => {}}
          onSelectContainer={() => {}}
          onDeleteItem={() => {}}
        />
      </ThemeProvider>,
    );

    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
  });
});

describe("partitionKeyValueFromItem", () => {
  it("reads the partition field from JSON when present", () => {
    expect(
      partitionKeyValueFromItem(
        { id: "order-1", json: '{"id":"order-1","customerId":"cust-9"}' },
        "/customerId",
      ),
    ).toBe("cust-9");
  });

  it("falls back to id when the field is missing", () => {
    expect(
      partitionKeyValueFromItem({ id: "order-1", json: '{"id":"order-1"}' }, "/customerId"),
    ).toBe("order-1");
  });
});
