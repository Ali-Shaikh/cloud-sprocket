import { describe, expect, it } from "vitest";

import { localDeploymentOutputLink, toLocalStackUrl } from "./DeployView";

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
});
