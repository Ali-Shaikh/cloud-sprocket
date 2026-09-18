// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { describe, expect, it } from "vitest";

import {
  findSqsQueueByUrl,
  isSqsQueueUrl,
  sqsQueueNameFromUrl,
  sqsQueueUrlIsIncomplete,
  sqsQueueUrlsMatch,
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

  it("recognises SQS queue URLs so they are not treated as browser endpoints", () => {
    expect(isSqsQueueUrl("https://sqs.us-east-1.amazonaws.com/123456789012/lab-events")).toBe(true);
    expect(isSqsQueueUrl("https://abc123.execute-api.us-east-1.amazonaws.com")).toBe(false);
  });
});
