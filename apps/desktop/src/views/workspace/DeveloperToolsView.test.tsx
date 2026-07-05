// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/lib/theme";
import DeveloperToolsView from "./DeveloperToolsView";

describe("DeveloperToolsView", () => {
  it("renders the toolbox tabs and validates the sample JSON", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn(async () => undefined),
      },
    });

    render(
      <ThemeProvider>
        <DeveloperToolsView />
      </ThemeProvider>,
    );

    expect(screen.getByRole("heading", { name: "Developer Toolbox" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /json/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /diff/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Validate" }));
    expect(await screen.findByText("JSON is valid.")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /cloud ids/i }));
    expect(await screen.findByRole("heading", { name: "Cloud ID Helpers" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Parse ARN" }));
    expect(await screen.findByText("Parsed AWS ARN.")).toBeInTheDocument();
    expect(within(screen.getByRole("table")).getByText("orders-api")).toBeInTheDocument();
  });
});
