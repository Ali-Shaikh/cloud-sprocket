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
          onRunQuery={async () => ({
            account: "devstoreaccount1",
            database: "appdb",
            container: "orders",
            query: "SELECT * FROM c",
            items: [],
            summary: "Returned 0 document(s).",
          })}
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
          onRunQuery={async () => ({
            account: "devstoreaccount1",
            database: "appdb",
            container: "orders",
            query: "SELECT * FROM c",
            items: [],
            summary: "Returned 0 document(s).",
          })}
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
          onRunQuery={async () => ({
            account: "devstoreaccount1",
            database: "appdb",
            container: "orders",
            query: "SELECT * FROM c",
            items: [],
            summary: "Returned 0 document(s).",
          })}
        />
      </ThemeProvider>,
    );

    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
  });

  it("runs a SQL query against the selected container", async () => {
    const onRunQuery = vi.fn(async () => ({
      account: "devstoreaccount1",
      database: "appdb",
      container: "orders",
      query: "SELECT * FROM c",
      items: [{ id: "match-1", json: '{"id":"match-1","total":99}' }],
      summary: "Returned 1 document(s) from devstoreaccount1/appdb/orders.",
    }));
    render(
      <ThemeProvider>
        <AzureCosmosView
          workspace={workspace}
          onSelectAccount={() => {}}
          onSelectDatabase={() => {}}
          onSelectContainer={() => {}}
          onDeleteItem={() => {}}
          onRunQuery={onRunQuery}
        />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Run query" }));
    expect(onRunQuery).toHaveBeenCalledWith("SELECT * FROM c");
    expect(await screen.findByText("match-1")).toBeTruthy();
    expect(screen.getByText(/Returned 1 document/)).toBeTruthy();
  });

  it("runs a SQL query with Ctrl+Enter", async () => {
    const onRunQuery = vi.fn(async () => ({
      account: "devstoreaccount1",
      database: "appdb",
      container: "orders",
      query: "SELECT * FROM c",
      items: [{ id: "match-2", json: '{"id":"match-2"}' }],
      summary: "Returned 1 document(s) from devstoreaccount1/appdb/orders.",
    }));
    render(
      <ThemeProvider>
        <AzureCosmosView
          workspace={workspace}
          onSelectAccount={() => {}}
          onSelectDatabase={() => {}}
          onSelectContainer={() => {}}
          onDeleteItem={() => {}}
          onRunQuery={onRunQuery}
        />
      </ThemeProvider>,
    );

    fireEvent.keyDown(screen.getByLabelText("Cosmos SQL query"), {
      key: "Enter",
      ctrlKey: true,
    });
    expect(onRunQuery).toHaveBeenCalledWith("SELECT * FROM c");
    expect(await screen.findByText("match-2")).toBeTruthy();
  });

  it("shows a query error from the backend", async () => {
    const onRunQuery = vi.fn(async () => {
      throw new Error("cosmos QUERY returned HTTP 400: syntax error");
    });
    render(
      <ThemeProvider>
        <AzureCosmosView
          workspace={workspace}
          onSelectAccount={() => {}}
          onSelectDatabase={() => {}}
          onSelectContainer={() => {}}
          onDeleteItem={() => {}}
          onRunQuery={onRunQuery}
        />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Run query" }));
    expect(await screen.findByText(/syntax error/)).toBeTruthy();
  });

  it("disables run query until a container is selected", () => {
    render(
      <ThemeProvider>
        <AzureCosmosView
          workspace={{ ...workspace, selectedAzureCosmosContainer: "" }}
          onSelectAccount={() => {}}
          onSelectDatabase={() => {}}
          onSelectContainer={() => {}}
          onDeleteItem={() => {}}
          onRunQuery={async () => ({
            account: "devstoreaccount1",
            database: "appdb",
            container: "",
            query: "SELECT * FROM c",
            items: [],
            summary: "Returned 0 document(s).",
          })}
        />
      </ThemeProvider>,
    );

    expect(screen.getByRole("button", { name: "Run query" })).toBeDisabled();
  });

  it("notes when query results are truncated", async () => {
    render(
      <ThemeProvider>
        <AzureCosmosView
          workspace={workspace}
          onSelectAccount={() => {}}
          onSelectDatabase={() => {}}
          onSelectContainer={() => {}}
          onDeleteItem={() => {}}
          onRunQuery={async () => ({
            account: "devstoreaccount1",
            database: "appdb",
            container: "orders",
            query: "SELECT * FROM c",
            items: [{ id: "match-1", json: '{"id":"match-1"}' }],
            truncated: true,
            summary: "Returned 1 document(s) from devstoreaccount1/appdb/orders. Results capped at 50.",
          })}
        />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Run query" }));
    expect(await screen.findByText(/Results were capped/)).toBeTruthy();
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
