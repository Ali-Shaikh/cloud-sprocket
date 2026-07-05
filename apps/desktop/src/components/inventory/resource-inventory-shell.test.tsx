// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ResourceInventoryShell } from "./resource-inspector";
import { ResourceTable } from "./resource-table";
import { EmptyState } from "@/components/empty-state";
import { Database } from "lucide-react";

type SampleRow = { name: string; size?: string };

describe("ResourceTable", () => {
  it("renders the empty state when there are no rows", () => {
    render(
      <ResourceTable<SampleRow>
        columns={[{ id: "name", label: "Name" }]}
        rows={[]}
        getRowKey={(row) => row.name}
        renderCell={(row) => row.name}
        emptyState={
          <EmptyState icon={<Database />} title="No items" description="Nothing here." className="border-0" />
        }
      />,
    );

    expect(screen.getByText("No items")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("marks the selected row and invokes onRowClick", async () => {
    const rows: SampleRow[] = [
      { name: "alpha.txt", size: "1 KB" },
      { name: "beta.txt", size: "2 KB" },
    ];
    const onRowClick = vi.fn();

    render(
      <ResourceTable<SampleRow>
        columns={[
          { id: "name", label: "Name" },
          { id: "size", label: "Size" },
        ]}
        rows={rows}
        selectedKey="beta.txt"
        getRowKey={(row) => row.name}
        onRowClick={onRowClick}
        renderCell={(row, columnId) => (columnId === "name" ? row.name : row.size)}
        emptyState={null}
      />,
    );

    const selectedRow = screen.getByText("beta.txt").closest("tr");
    expect(selectedRow).toHaveAttribute("data-state", "selected");

    fireEvent.click(screen.getByText("alpha.txt"));
    expect(onRowClick).toHaveBeenCalledWith(rows[0]);
  });
});

describe("ResourceInventoryShell", () => {
  it("docks the inspector inline on wide viewports", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1400 });

    render(
      <ResourceInventoryShell
        table={<div data-testid="inventory-table">table</div>}
        inspectorContent={<div>Inspector body</div>}
        inspectorOpen
        onInspectorOpenChange={() => undefined}
        inspectorAriaLabel="Object details"
      />,
    );

    expect(screen.getByTestId("inventory-table")).toBeInTheDocument();
    expect(screen.getByLabelText("Object details")).toHaveTextContent("Inspector body");
    expect(screen.getByLabelText("Object details").tagName).toBe("ASIDE");
  });
});