// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CommandPalette, type Command } from "./command-palette";

describe("CommandPalette", () => {
  it("styles destructive commands from command metadata rather than their id", () => {
    const commands: Command[] = [
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

    render(<CommandPalette open commands={commands} onClose={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Dangerous action" })).toHaveClass(
      "text-destructive",
    );
    expect(screen.getByRole("button", { name: "Safe action" })).not.toHaveClass(
      "text-destructive",
    );
  });
});
