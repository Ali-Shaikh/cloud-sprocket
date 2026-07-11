// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/lib/theme";
import DeveloperToolsView from "./DeveloperToolsView";

const mocks = vi.hoisted(() => ({
  openDialog: vi.fn(),
  importRecipeFolder: vi.fn(),
  validateRecipeFolder: vi.fn(),
  scaffoldRecipe: vi.fn(),
  notify: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: mocks.openDialog }));
vi.mock("@/lib/backend", () => ({
  importRecipeFolder: mocks.importRecipeFolder,
  validateRecipeFolder: mocks.validateRecipeFolder,
  scaffoldRecipe: mocks.scaffoldRecipe,
}));
vi.mock("@/lib/notify", () => ({ notify: mocks.notify }));

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

  it("shows a structured trust review before accepting an import", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn(async () => undefined) },
    });
    mocks.openDialog.mockResolvedValue("C:\\recipes\\demo");
    mocks.importRecipeFolder.mockImplementation(async (_path, confirmed: boolean) => ({
      ok: true,
      id: "demo-api",
      version: "1.2.3",
      name: "Demo API",
      kind: "app-deploy",
      providers: ["aws"],
      buildCommands: ["npm ci", "npm run build"],
      labStepCount: 2,
      contentHash: "0123456789abcdef0123456789abcdef",
      confirmed,
    }));

    render(
      <ThemeProvider>
        <DeveloperToolsView />
      </ThemeProvider>,
    );

    await user.click(screen.getByRole("tab", { name: "Recipes" }));
    await user.click(screen.getByRole("button", { name: "Import folder" }));

    expect(await screen.findByText("Import trust review")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Demo API" })).toBeInTheDocument();
    expect(screen.getByText("Runs on this machine")).toBeInTheDocument();
    expect(screen.getByText("npm ci")).toBeInTheDocument();
    expect(screen.getByText("0123456789abcdef…")).toHaveAttribute(
      "title",
      "0123456789abcdef0123456789abcdef",
    );

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
    await user.click(screen.getByRole("button", { name: "Copy hash" }));
    expect(mocks.notify).toHaveBeenCalledWith("error", "Could not copy content hash");

    await user.click(screen.getByRole("button", { name: "Accept import" }));
    expect(mocks.importRecipeFolder).toHaveBeenLastCalledWith("C:\\recipes\\demo", true, "folder");
    expect(await screen.findByText("Copied")).toBeInTheDocument();
  });
});
