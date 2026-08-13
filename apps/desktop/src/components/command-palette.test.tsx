// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CommandPalette, type Command } from "./command-palette";

const sampleCommands: Command[] = [
  {
    id: "custom-danger",
    group: "Actions",
    label: "Dangerous action",
    destructive: true,
    run: vi.fn(),
  },
  {
    id: "act:reset",
    group: "Actions",
    label: "Safe action",
    run: vi.fn(),
  },
];

describe("CommandPalette", () => {
  it("styles destructive commands from command metadata rather than their id", () => {
    render(<CommandPalette open commands={sampleCommands} onClose={vi.fn()} />);

    expect(screen.getByRole("option", { name: "Dangerous action" })).toHaveClass(
      "text-destructive",
    );
    expect(screen.getByRole("option", { name: "Safe action" })).not.toHaveClass(
      "text-destructive",
    );
  });

  it("exposes a modal dialog and traps Tab within the palette", async () => {
    const user = userEvent.setup();
    render(<CommandPalette open commands={sampleCommands} onClose={vi.fn()} />);

    const dialog = screen.getByRole("dialog", { name: "Command palette" });
    expect(dialog).toHaveAttribute("aria-modal", "true");

    const search = screen.getByRole("textbox", { name: "Search commands" });
    const firstOption = screen.getByRole("option", { name: "Dangerous action" });
    const secondOption = screen.getByRole("option", { name: "Safe action" });

    // Initial rAF focuses the search field.
    await vi.waitFor(() => expect(document.activeElement).toBe(search));

    await user.tab();
    expect(document.activeElement).toBe(firstOption);
    await user.tab();
    expect(document.activeElement).toBe(secondOption);
    // Wrap from last option back to search.
    await user.tab();
    expect(document.activeElement).toBe(search);
    // Shift+Tab from first focusable wraps to last.
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(secondOption);
  });

  it("closes on Escape from the document listener", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<CommandPalette open commands={sampleCommands} onClose={onClose} />);

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });
});
