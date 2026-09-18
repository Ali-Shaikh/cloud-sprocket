// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { describe, expect, it } from "vitest";

import { deploymentOutputNavigateParams } from "./deployment-output-nav";

describe("deploymentOutputNavigateParams", () => {
  it("maps bucket outputs to S3", () => {
    expect(
      deploymentOutputNavigateParams(
        { providerId: "aws" },
        { name: "website_bucket", value: "demo-site" },
      ),
    ).toEqual({ provider: "aws", tab: "s3", resourceKey: "demo-site" });
  });

  it("skips URL-shaped values", () => {
    expect(
      deploymentOutputNavigateParams(
        { providerId: "aws" },
        { name: "api_url", value: "https://example.com" },
      ),
    ).toBeNull();
  });

  it("maps SQS queue_url outputs to the SQS tab even when the value is a URL", () => {
    expect(
      deploymentOutputNavigateParams(
        { providerId: "aws" },
        {
          name: "queue_url",
          value: "https://sqs.us-east-1.amazonaws.com/123456789012/lab-events",
        },
      ),
    ).toEqual({
      provider: "aws",
      tab: "sqs",
      resourceKey: "https://sqs.us-east-1.amazonaws.com/123456789012/lab-events",
    });
  });

  it("maps azure storage account outputs", () => {
    expect(
      deploymentOutputNavigateParams(
        { providerId: "azure" },
        { name: "storage_account_name", value: "stlab" },
      ),
    ).toEqual({ provider: "azure", tab: "azure-storage", resourceKey: "stlab" });
  });

  it("does not treat generic server-named outputs as postgres", () => {
    expect(
      deploymentOutputNavigateParams(
        { providerId: "azure" },
        { name: "app_service_name", value: "lab-web" },
      ),
    ).toBeNull();
  });
});
