// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { describe, expect, it } from "vitest";

import {
  findSqsQueueByUrl,
  isSqsQueueUrl,
  sqsQueueNameFromUrl,
  sqsQueueUrlIsIncomplete,
  sqsQueueUrlsMatch,
  sqsRegionFromUrl,
} from "./sqs-queue-url";

describe("sqs queue URL helpers", () => {
  it("parses the queue name from AWS and LocalStack URLs", () => {
    expect(sqsQueueNameFromUrl("https://sqs.us-east-1.amazonaws.com/123456789012/process-order")).toBe(
      "process-order",
    );
    expect(sqsQueueNameFromUrl("http://localhost:4566/000000000000/lab-events")).toBe("lab-events");
    expect(sqsQueueNameFromUrl("https://sqs.eu-west-1.amazonaws.com/lab-events")).toBe("lab-events");
  });

  it("flags truncated AWS-format URLs that omit the account id", () => {
    expect(sqsQueueUrlIsIncomplete("https://sqs.us-east-1.amazonaws.com/lab-events")).toBe(true);
    expect(sqsQueueUrlIsIncomplete("https://sqs.us-east-1.amazonaws.com/123456789012/lab-events")).toBe(
      false,
    );
    expect(sqsQueueUrlIsIncomplete("http://localhost:4566/000000000000/lab-events")).toBe(false);
  });

  it("matches the same queue across AWS and LocalStack URL shapes", () => {
    expect(
      sqsQueueUrlsMatch(
        "https://sqs.us-east-1.amazonaws.com/123456789012/lab-events",
        "http://localhost:4566/000000000000/lab-events",
      ),
    ).toBe(true);
    expect(
      sqsQueueUrlsMatch(
        "https://sqs.us-east-1.amazonaws.com/lab-events",
        "http://localhost:4566/000000000000/lab-events",
      ),
    ).toBe(true);
  });

  it("selects inventory queues when the lab output URL is truncated", () => {
    const queues = [
      { queueUrl: "http://localhost:4566/000000000000/lab-events", queueName: "lab-events" },
    ];
    expect(findSqsQueueByUrl(queues, "https://sqs.us-east-1.amazonaws.com/lab-events")?.queueName).toBe(
      "lab-events",
    );
  });

  it.each([
    ["https://sqs.amazonaws.com/123456789012/orders", true],
    ["https://sqs.us-east-1.amazonaws.com/123456789012/lab-events", true],
    ["https://SQS.EU-WEST-1.amazonaws.com/123456789012/lab-events", true],
    ["https://sqs.us-gov-west-1.amazonaws.com/123456789012/lab-events", true],
    ["sqs.eu-west-2.amazonaws.com/123456789012/lab-events", true],
    ["http://localhost:4566/000000000000/lab-events", true],
    ["http://localhost/000000000000/lab-events", true],
    ["https://sqs.us-east-1.localhost.localstack.cloud:4566/000000000000/lab-events", true],
    ["https://localhost.localstack.cloud/000000000000/lab-events", true],
    ["http://lab.localstack.cloud/000000000000/lab-events", true],
    ["http://queues.localhost/000000000000/lab-events", true],
    ["https://evilamazonaws.com/sqs.us-east-1.amazonaws.com/123/lab-events", false],
    ["https://amazonaws.com.evil.com/sqs.us-east-1.amazonaws.com/123/lab-events", false],
    ["https://sqs.amazonaws.com.evil.com/123456789012/lab-events", false],
    ["https://sqs.us-east-1.amazonaws.com.evil.com/123456789012/lab-events", false],
    ["https://not-sqs.us-east-1.amazonaws.com/123456789012/lab-events", false],
    ["https://abc123.execute-api.us-east-1.amazonaws.com", false],
    ["https://s3.us-east-1.amazonaws.com/demo-bucket", false],
    ["http://localhost:4566/", false],
    ["http://localhost:4566", false],
    ["https://evil.localstack.cloud.evil.com/000000000000/lab-events", false],
    ["not a url", false],
    ["", false],
  ])("classifies %s as an SQS URL: %s", (value, expected) => {
    expect(isSqsQueueUrl(value)).toBe(expected);
  });

  it.each([
    ["https://sqs.us-east-1.amazonaws.com/123456789012/name", "us-east-1"],
    ["https://sqs.eu-west-2.amazonaws.com/123456789012/name", "eu-west-2"],
    ["https://SQS.US-WEST-2.amazonaws.com/123456789012/name", "us-west-2"],
    ["https://sqs.amazonaws.com/123456789012/name", ""],
    ["http://localhost:4566/000000000000/lab-events", ""],
    ["https://localhost.localstack.cloud/000000000000/lab-events", ""],
    ["https://sqs.us-east-1.localhost.localstack.cloud/000000000000/lab-events", ""],
    ["https://not-sqs.us-east-1.amazonaws.com/123456789012/name", ""],
    ["https://sqs.us-east-1.amazonaws.com.evil.com/123456789012/name", ""],
    ["", ""],
  ])("reads the region from %s", (value, region) => {
    expect(sqsRegionFromUrl(value)).toBe(region);
  });
});
