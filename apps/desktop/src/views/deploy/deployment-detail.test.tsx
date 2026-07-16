// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Deployment } from "@/types/backend";

import { DeploymentDetail } from "./deployment-detail";

function blockedDeployment(overrides: Partial<Deployment> = {}): Deployment {
  return {
    id: "dep-policy-1",
    recipeId: "serverless-fullstack-aws",
    name: "Live demo",
    providerId: "aws",
    profileId: "prod",
    local: false,
    variables: {},
    status: "planned",
    plan: { add: 1, change: 0, destroy: 0, changes: [] },
    policy: {
      status: "blocked",
      planDigest: "sha256:plan",
      decisionDigest: "sha256:decision",
      evaluatedAt: "2026-07-16T08:00:00Z",
      blockingCount: 1,
      findings: [
        {
          ruleId: "aws.s3.public-access",
          title: "Public S3 access",
          message: "The planned S3 configuration permits public access.",
          severity: "deny",
          resourceAddress: "aws_s3_bucket.site",
        },
      ],
    },
    createdAt: "2026-07-16T08:00:00Z",
    updatedAt: "2026-07-16T08:00:00Z",
    ...overrides,
  };
}

function renderDetail(deployment: Deployment, onApply = vi.fn()) {
  render(
    <DeploymentDetail
      deployment={deployment}
      recipeManifest={null}
      logs={[]}
      busy={false}
      onBack={vi.fn()}
      onApply={onApply}
      onDestroy={vi.fn()}
      onCancel={vi.fn()}
      onDelete={vi.fn()}
      onRetryPostApply={vi.fn()}
    />,
  );
  return onApply;
}

describe("DeploymentDetail policy guardrails", () => {
  it("requires the exact typed override for a blocked live plan", () => {
    const onApply = renderDetail(blockedDeployment());

    expect(screen.getByText("Public S3 access")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Review policy" }));

    const dialog = screen.getByRole("alertdialog", {
      name: "Override blocking policy findings",
    });
    const confirmation = within(dialog).getByLabelText(
      "Policy override confirmation",
    );
    const apply = within(dialog).getByRole("button", {
      name: "Apply with override",
    });
    expect(apply).toBeDisabled();

    fireEvent.change(confirmation, { target: { value: "APPLY dep-policy-1" } });
    expect(apply).toBeEnabled();
    fireEvent.click(apply);

    expect(onApply).toHaveBeenCalledWith("APPLY dep-policy-1");
  });

  it("keeps local deny findings warning-only", () => {
    const deployment = blockedDeployment({
      local: true,
      profileId: "",
      runtimeId: "localstack",
      policy: {
        ...blockedDeployment().policy!,
        status: "warned",
        blockingCount: 0,
      },
    });
    const onApply = renderDetail(deployment);

    expect(
      screen.getByText("Local targets warn only. Apply remains available."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(onApply).toHaveBeenCalledWith();
    expect(
      screen.queryByLabelText("Policy override confirmation"),
    ).not.toBeInTheDocument();
  });
});
