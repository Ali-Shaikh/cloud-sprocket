// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/lib/theme";
import SettingsView from "./SettingsView";
import type { PreferencesSnapshot } from "@/types/backend";

const snapshot: PreferencesSnapshot = {
  preferences: {
    disabledProviders: [],
    disabledServices: {},
  },
  catalogue: [
    {
      providerId: "aws",
      serviceId: "s3",
      label: "S3",
      summary: "Bucket and object workbench.",
      detail: "Bucket and object workbench.",
      category: "service",
      domain: "storage",
      inventoryScope: "s3",
      enabled: true,
    },
    {
      providerId: "aws",
      serviceId: "ec2",
      label: "EC2",
      summary: "Fleet and instance operations.",
      detail: "Fleet and instance operations.",
      category: "service",
      domain: "compute",
      inventoryScope: "ec2",
      enabled: true,
    },
    {
      providerId: "aws",
      serviceId: "waf",
      label: "WAF",
      summary: "Web application firewall tools.",
      detail: "Web application firewall tools.",
      category: "tool",
      enabled: true,
    },
  ],
};

describe("SettingsView", () => {
  it("renders provider and service toggles", () => {
    render(
      <ThemeProvider>
        <SettingsView snapshot={snapshot} onUpdate={vi.fn()} />
      </ThemeProvider>,
    );

    expect(screen.getByText("Services")).toBeInTheDocument();
    expect(screen.getByText("AWS")).toBeInTheDocument();
    expect(screen.getByText("S3")).toBeInTheDocument();
    expect(screen.getByText("EC2")).toBeInTheDocument();
  });

  it("calls onUpdate when a service is disabled", () => {
    const onUpdate = vi.fn();
    render(
      <ThemeProvider>
        <SettingsView snapshot={snapshot} onUpdate={onUpdate} />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByRole("switch", { name: "S3" }));
    expect(onUpdate).toHaveBeenCalledWith({
      disabledProviders: [],
      disabledServices: { aws: ["s3"] },
    });
  });

  it("groups provider services under domain subheadings with tools last", () => {
    render(
      <ThemeProvider>
        <SettingsView snapshot={snapshot} onUpdate={vi.fn()} />
      </ThemeProvider>,
    );

    const headings = screen.getAllByRole("heading", { level: 3 });
    expect(headings.map((heading) => heading.textContent)).toEqual([
      "Compute",
      "Storage",
      "Tools & other",
    ]);
  });
});
