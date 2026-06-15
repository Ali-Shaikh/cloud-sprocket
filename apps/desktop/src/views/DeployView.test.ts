import { describe, expect, it } from "vitest";

import { localDeploymentOutputLink, logCommandsForDeployment, toLocalStackUrl } from "./DeployView";

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

  it("normalises already LocalStack-shaped S3 website URLs with paths", () => {
    expect(toLocalStackUrl("myapp.s3-website.localhost.localstack.cloud/index.html")).toBe(
      "http://myapp.s3-website.localhost.localstack.cloud:4566/index.html",
    );
  });

  it("leaves unrelated URLs for the direct opener", () => {
    expect(toLocalStackUrl("https://example.com")).toBeNull();
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

  it("does not expose direct local links for real cloud deployments", () => {
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
