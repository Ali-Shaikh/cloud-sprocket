// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { lambdaCrossLinks } from "@/lib/resource-cross-links";
import { ResourceCrossLinks } from "./resource-cross-links";

describe("ResourceCrossLinks", () => {
  it("renders nothing when there are no links", () => {
    const { container } = render(
      <ResourceCrossLinks links={[]} onNavigate={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("calls onNavigate with the link params when a button is clicked", () => {
    const onNavigate = vi.fn();
    const links = lambdaCrossLinks({
      functionName: "process-order",
      logGroup: "/aws/lambda/process-order",
    });

    render(<ResourceCrossLinks links={links} onNavigate={onNavigate} />);

    fireEvent.click(screen.getByRole("button", { name: "Open in Logs" }));

    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith({
      provider: "aws",
      tab: "logs",
      resourceKey: "/aws/lambda/process-order",
    });
  });
});
