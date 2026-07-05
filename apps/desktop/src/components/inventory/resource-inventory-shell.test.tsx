// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ResourceInventoryShell } from "./resource-inspector";
import { ResourceTable } from "./resource-table";
import { EmptyState } from "@/components/empty-state";
import { Database } from "lucide-react";

type SampleRow = { name: string; size?: string };

function mockMatchMedia(matches: boolean) {
  return vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

afterEach(() => {
  vi.restoreAllMocks();
});

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

  it("marks the selected row and invokes onRowClick", () => {
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

  it("applies truncation classes on the table cell, not an inner wrapper", () => {
    render(
      <ResourceTable<{ key: string }>
        columns={[{ id: "key", label: "Object Key", cellClassName: "max-w-0 truncate font-medium" }]}
        rows={[{ key: "reports/2026/summary.csv" }]}
        getRowKey={(row) => row.key}
        getCellTitle={(row, columnId) => (columnId === "key" ? row.key : undefined)}
        renderCell={(row) => row.key}
        emptyState={null}
      />,
    );

    const cell = screen.getByText("reports/2026/summary.csv").closest("td");
    expect(cell).toHaveClass("max-w-0");
    expect(cell).toHaveClass("truncate");
    expect(cell).toHaveAttribute("title", "reports/2026/summary.csv");
    expect(screen.getByText("reports/2026/summary.csv").tagName).not.toBe("SPAN");
  });
});

describe("ResourceInventoryShell", () => {
  it("docks the inspector inline on wide viewports", () => {
    mockMatchMedia(true);

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

  it("uses a sheet on narrow viewports", () => {
    mockMatchMedia(false);

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
    const inspector = screen.getByLabelText("Object details");
    expect(inspector.tagName).not.toBe("ASIDE");
    expect(inspector).toHaveAttribute("role", "dialog");
    expect(screen.getByText("Inspector body")).toBeInTheDocument();
  });
});