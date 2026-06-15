import { describe, expect, it } from "vitest";

import { toLocalStackUrl } from "./DeployView";

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
});
