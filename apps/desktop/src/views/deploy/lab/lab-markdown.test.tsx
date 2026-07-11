// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { LabMarkdown, parseLabMarkdown } from "./lab-markdown";

const { openExternalUrl } = vi.hoisted(() => ({
  openExternalUrl: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/backend", () => ({ openExternalUrl }));

describe("LabMarkdown", () => {
  it("parses paragraphs, lists, and fenced code", () => {
    expect(
      parseLabMarkdown("Hello\n\n- one\n- two\n\n```sh\necho ok\n```"),
    ).toEqual([
      { type: "paragraph", text: "Hello" },
      { type: "list", items: ["one", "two"] },
      { type: "code", code: "echo ok", language: "sh" },
    ]);
  });

  it("renders safe inline markdown and opens links externally", async () => {
    const user = userEvent.setup();
    render(
      <LabMarkdown>
        {
          "Use **care** with `apply`. [Docs](https://example.com).\n\n<script>alert(1)</script>"
        }
      </LabMarkdown>,
    );

    expect(screen.getByText("care").tagName).toBe("STRONG");
    expect(screen.getByText("apply").tagName).toBe("CODE");
    expect(document.querySelector("script")).toBeNull();
    expect(screen.getByText("<script>alert(1)</script>")).toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "Docs" }));
    expect(openExternalUrl).toHaveBeenCalledWith("https://example.com");
  });
});
