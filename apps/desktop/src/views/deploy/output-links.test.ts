// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { describe, expect, it } from "vitest";

import {
  deploymentOutputLink,
  getNoRuntimeLogsMessage,
  localDeploymentOutputLink,
  logCommandsForDeployment,
  toLocalStackUrl,
} from "./output-links";

describe("toLocalStackUrl", () => {
  it("rewrites AWS-format load balancer URLs to LocalStack", () => {
    expect(toLocalStackUrl("https://demo.us-east-1.elb.amazonaws.com")).toBe(
      "http://demo.elb.localhost.localstack.cloud:4566",
    );
  });

  it("normalises already LocalStack-shaped load balancer URLs", () => {
    expect(toLocalStackUrl("https://demo.elb.localhost.localstack.cloud")).toBe(
      "http://demo.elb.localhost.localstack.cloud:4566",
    );
  });

  it("normalises LocalStack-shaped load balancer URLs without an explicit port", () => {
    expect(toLocalStackUrl("http://myappaaa-dev-alb.elb.localhost.localstack.cloud")).toBe(
      "http://myappaaa-dev-alb.elb.localhost.localstack.cloud:4566",
    );
  });

  it("upgrades legacy short-form LocalStack load balancer hostnames", () => {
    expect(toLocalStackUrl("myapp-dev.elb.localhost:4566")).toBe(
      "http://myapp-dev.elb.localhost.localstack.cloud:4566",
    );
  });

  it("builds alb_dns_name open links with the gateway port", () => {
    expect(
      localDeploymentOutputLink(
        {
          local: true,
          recipeId: "container-fullstack-aws",
          variables: { app_name: "myappaaa", environment: "dev" },
        },
        { name: "alb_dns_name", value: "myappaaa-dev-alb.elb.localhost.localstack.cloud" },
      ),
    ).toMatchObject({
      url: "http://myappaaa-dev-alb.elb.localhost.localstack.cloud:4566",
      label: "Open on LocalStack",
    });
  });

  it("normalises already LocalStack-shaped S3 website URLs with paths", () => {
    expect(toLocalStackUrl("myapp.s3-website.localhost.localstack.cloud/index.html")).toBe(
      "http://myapp.s3-website.localhost.localstack.cloud:4566/index.html",
    );
  });

  it("leaves unrelated URLs for the direct opener", () => {
    expect(toLocalStackUrl("https://example.com")).toBeNull();
  });

  it("explains how to connect to local RDS endpoints from the host", () => {
    expect(
      localDeploymentOutputLink(
        {
          local: true,
          recipeId: "api-postgres-containers-aws",
          variables: { app_name: "myapp", environment: "dev" },
        },
        {
          name: "database_endpoint",
          value: "localhost.localstack.cloud:4512",
        },
      ),
    ).toMatchObject({
      note: expect.stringContaining("127.0.0.1"),
    });
  });

  it("uses direct S3 website links for local container frontend outputs", () => {
    expect(
      localDeploymentOutputLink(
        {
          local: true,
          recipeId: "container-fullstack-aws",
          variables: { app_name: "myapp", environment: "dev" },
        },
        {
          name: "frontend_url",
          value: "https://e515e021.cloudfront.localhost.localstack.cloud",
        },
      ),
    ).toMatchObject({
      url: "http://myapp-dev-frontend.s3-website.localhost.localstack.cloud:4566",
      label: "Open S3 website on LocalStack",
    });
  });

  it("does not expose LocalStack rewrite links for real cloud deployments", () => {
    expect(
      localDeploymentOutputLink(
        {
          local: false,
          recipeId: "container-fullstack-aws",
          variables: { app_name: "myapp", environment: "dev" },
        },
        {
          name: "frontend_url",
          value: "https://e515e021.cloudfront.localhost.localstack.cloud",
        },
      ),
    ).toBeNull();
  });

  it("opens real cloud HTTP endpoints directly", () => {
    expect(
      deploymentOutputLink(
        {
          local: false,
          recipeId: "api-dynamodb-serverless-aws",
          variables: { app_name: "myapi", environment: "dev" },
        },
        {
          name: "api_endpoint",
          value: "https://abc123.execute-api.us-east-1.amazonaws.com",
        },
      ),
    ).toMatchObject({
      url: "https://abc123.execute-api.us-east-1.amazonaws.com/",
      label: "Open endpoint",
    });
  });

  it("uses unsigned LocalStack log commands without credential environment variables", () => {
    const commands = logCommandsForDeployment({
      id: "dep-1",
      recipeId: "container-fullstack-aws",
      name: "Container full-stack",
      providerId: "aws",
      profileId: "",
      local: true,
      variables: { app_name: "myappaaa", environment: "dev", aws_region: "us-east-1" },
      status: "applied",
      createdAt: "2026-06-15T00:00:00Z",
      updatedAt: "2026-06-15T00:00:00Z",
    });

    expect(commands).toHaveLength(1);
    expect(commands[0].command).toBe(
      'aws --endpoint-url "http://localhost:4566" --no-sign-request logs tail "/ecs/myappaaa-dev" --follow --region "us-east-1"',
    );
    expect(commands[0].command).not.toContain("AWS_ACCESS_KEY_ID");
    expect(commands[0].command).not.toContain("AWS_SECRET_ACCESS_KEY");
  });
});

describe("getNoRuntimeLogsMessage", () => {
  it("uses the S3-specific message only for static-site-aws", () => {
    const msg = getNoRuntimeLogsMessage("static-site-aws");
    expect(msg).toContain("Static S3 sites need S3 or CloudFront access logging configured separately");
    expect(msg).toContain("This recipe does not produce application runtime logs by default");
  });

  it("uses a generic message for labs and other recipes", () => {
    const labMsg = "This lab creates infrastructure resources. Application runtime logs (if any) come from the services created (e.g. Lambda logs in CloudWatch for AWS labs). Use the workspace tabs to inspect.";
    expect(getNoRuntimeLogsMessage("lab-dynamodb-aws")).toBe(labMsg);
    expect(getNoRuntimeLogsMessage("lab-postgres-flexible-azure")).toBe(labMsg);
    expect(getNoRuntimeLogsMessage("lab-secrets-aws")).toBe(labMsg);
    expect(getNoRuntimeLogsMessage("some-other-recipe")).toBe("This recipe does not produce application runtime logs by default.");
  });
});
