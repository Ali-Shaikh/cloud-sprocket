// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AzureCLIExtensionsBanner } from "./azure-cli-extensions-banner";

describe("AzureCLIExtensionsBanner", () => {
  it("renders nothing when all required extensions are installed", () => {
    const { container } = render(
      <AzureCLIExtensionsBanner
        extensions={[
          {
            name: "log-analytics",
            summary: "Log Analytics queries",
            installed: true,
            installCommand: "az extension add --name log-analytics",
          },
        ]}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("lists missing extensions and copies install commands", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(
      <AzureCLIExtensionsBanner
        extensions={[
          {
            name: "log-analytics",
            summary: "Log Analytics queries",
            installed: false,
            installCommand: "az extension add --name log-analytics",
          },
          {
            name: "bastion",
            summary: "Bastion tunnels",
            installed: true,
            installCommand: "az extension add --name bastion",
          },
        ]}
      />,
    );

    expect(screen.getByText("Azure CLI extensions required")).toBeInTheDocument();
    expect(screen.getByText(/log-analytics/)).toBeInTheDocument();
    expect(screen.queryByText(/bastion/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Copy install commands" }));
    expect(writeText).toHaveBeenCalledWith("az extension add --name log-analytics");
  });
});