// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { NavigateToResourceParams } from "@/lib/navigate-to-resource";
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

function renderDetail(
  deployment: Deployment,
  onApply = vi.fn(),
  options: {
    navigateToResource?: (params: NavigateToResourceParams) => void;
  } = {},
) {
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
      navigateToResource={options.navigateToResource}
    />,
  );
  return onApply;
}

describe("DeploymentDetail failure honesty", () => {
  it("renders multi-line apply errors with guidance", () => {
    renderDetail(
      blockedDeployment({
        status: "failed",
        plan: undefined,
        policy: undefined,
        error:
          "OpenTofu apply failed: exit status 1\n\nLast OpenTofu output:\nInstalling hashicorp/azurerm v4.81.0...",
      }),
    );

    expect(screen.getByText("Deployment failed")).toBeInTheDocument();
    const errorBlock = screen.getByText(/OpenTofu apply failed/i);
    expect(errorBlock).toHaveTextContent(/Last OpenTofu output/i);
    expect(errorBlock).toHaveTextContent(/Installing hashicorp\/azurerm/i);
  });

  it("shows a running progress banner for local Postgres applies", () => {
    renderDetail(
      blockedDeployment({
        status: "applying",
        recipeId: "lab-postgres-flexible-azure",
        local: true,
        runtimeId: "floci-az",
        plan: undefined,
        policy: undefined,
      }),
    );

    expect(screen.getByText("OpenTofu is still running")).toBeInTheDocument();
    expect(screen.getByText(/1-2 minutes/i)).toBeInTheDocument();
  });
});

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

describe("DeploymentDetail what changed", () => {
  it("titles the plan section What changed after apply and links mappable resources", () => {
    const navigateToResource = vi.fn();
    renderDetail(
      blockedDeployment({
        status: "applied",
        policy: undefined,
        plan: {
          add: 1,
          change: 0,
          destroy: 1,
          changes: [
            {
              address: "aws_s3_bucket.site",
              type: "aws_s3_bucket",
              name: "site",
              actions: ["create"],
            },
            {
              address: "aws_vpc.main",
              type: "aws_vpc",
              name: "main",
              actions: ["delete"],
            },
          ],
        },
      }),
      vi.fn(),
      { navigateToResource },
    );

    expect(screen.getByText("What changed")).toBeInTheDocument();
    expect(screen.queryByText("Plan")).not.toBeInTheDocument();

    const link = screen.getByRole("button", {
      name: "Open aws_s3_bucket.site in inventory",
    });
    fireEvent.click(link);
    expect(navigateToResource).toHaveBeenCalledWith({
      provider: "aws",
      tab: "s3",
      resourceKey: "site",
    });

    // Unknown types stay plain text (no inventory button).
    expect(
      screen.queryByRole("button", { name: "Open aws_vpc.main in inventory" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("aws_vpc.main")).toBeInTheDocument();
  });

  it("keeps the Plan title when still planned and still offers inventory links", () => {
    const navigateToResource = vi.fn();
    renderDetail(
      blockedDeployment({
        status: "planned",
        policy: undefined,
        plan: {
          add: 1,
          change: 0,
          destroy: 0,
          changes: [
            {
              address: "aws_lambda_function.api",
              type: "aws_lambda_function",
              name: "api",
              actions: ["create"],
            },
          ],
        },
      }),
      vi.fn(),
      { navigateToResource },
    );

    expect(screen.getByText("Plan")).toBeInTheDocument();
    expect(screen.queryByText("What changed")).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Open aws_lambda_function.api in inventory",
      }),
    );
    expect(navigateToResource).toHaveBeenCalledWith({
      provider: "aws",
      tab: "lambda",
      resourceKey: "api",
    });
  });
});
