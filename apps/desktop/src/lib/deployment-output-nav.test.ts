// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { describe, expect, it } from "vitest";

import { deploymentOutputNavigateParams } from "./deployment-output-nav";
import { planNavigateToResource } from "./navigate-to-resource";

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
      context: { sqsRegion: "us-east-1" },
    });
  });

  it("selects the queue region before the queue when the URL is in another region", () => {
    const queueUrl = "https://sqs.eu-west-1.amazonaws.com/123456789012/lab-events";
    const params = deploymentOutputNavigateParams(
      { providerId: "aws" },
      { name: "events_queue_url", value: queueUrl },
    );

    expect(params).toEqual({
      provider: "aws",
      tab: "sqs",
      resourceKey: queueUrl,
      context: { sqsRegion: "eu-west-1" },
    });
    expect(planNavigateToResource(params!)).toMatchObject({
      tabId: "sqs",
      selections: [
        { method: "aws.sqs.selectRegion", params: { region: "eu-west-1" } },
        { method: "aws.sqs.selectQueue", params: { queueUrl } },
      ],
    });
  });

  it("does not invent a region for LocalStack queue URLs", () => {
    expect(
      deploymentOutputNavigateParams(
        { providerId: "aws" },
        {
          name: "queue_url",
          value: "http://localhost:4566/000000000000/lab-events",
        },
      ),
    ).toEqual({
      provider: "aws",
      tab: "sqs",
      resourceKey: "http://localhost:4566/000000000000/lab-events",
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
