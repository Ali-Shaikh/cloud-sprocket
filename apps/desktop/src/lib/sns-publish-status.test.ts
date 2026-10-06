// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { describe, expect, it } from "vitest";

import { applySnsPublishStatus, dropFinishedSnsPublishFailures } from "./sns-publish-status";

describe("applySnsPublishStatus", () => {
  it("shows a single success and a single failure", () => {
    const success = applySnsPublishStatus("Publishing message to the topic.", new Map(), {
      serial: 1,
      latestSerial: 1,
      text: "Message published.",
      failed: false,
    });
    expect(success.status).toBe("Message published.");
    expect(success.failures.size).toBe(0);

    const failure = applySnsPublishStatus("Publishing message to the topic.", new Map(), {
      serial: 1,
      latestSerial: 1,
      text: "Topic is missing.",
      failed: true,
    });
    expect(failure.status).toBe("Topic is missing.");
    expect(failure.failures.get(1)).toBe("Topic is missing.");
  });

  it("keeps a newer failure when an older publish succeeds afterwards", () => {
    const failed = applySnsPublishStatus("Publishing message to the topic.", new Map(), {
      serial: 2,
      latestSerial: 2,
      text: "Topic B failed.",
      failed: true,
    });
    const olderSuccess = applySnsPublishStatus(failed.status, failed.failures, {
      serial: 1,
      latestSerial: 2,
      text: "Message published.",
      failed: false,
    });
    expect(olderSuccess.status).toBe("Topic B failed.");
  });

  it("keeps an older failure beside a newer success", () => {
    const olderFailure = applySnsPublishStatus("Publishing message to the topic.", new Map(), {
      serial: 1,
      latestSerial: 2,
      text: "Topic A failed.",
      failed: true,
    });
    expect(olderFailure.status).toBe("Publishing message to the topic. Topic A failed.");

    const newerSuccess = applySnsPublishStatus(olderFailure.status, olderFailure.failures, {
      serial: 2,
      latestSerial: 2,
      text: "Message published.",
      failed: false,
    });
    expect(newerSuccess.status).toBe("Message published. Topic A failed.");
    expect(newerSuccess.failures.size).toBe(0);
  });
});

describe("dropFinishedSnsPublishFailures", () => {
  it("drops a finished failure so a later success does not repeat it", () => {
    const failed = applySnsPublishStatus("Publishing message to the topic.", new Map(), {
      serial: 1,
      latestSerial: 1,
      text: "Topic A failed.",
      failed: true,
    });
    const kept = dropFinishedSnsPublishFailures(failed.failures, new Set());
    const later = applySnsPublishStatus("Selected SNS topic.", kept, {
      serial: 2,
      latestSerial: 2,
      text: "Message published.",
      failed: false,
    });
    expect(later.status).toBe("Message published.");
    expect(later.failures.size).toBe(0);
  });

  it("keeps a failure whose publish is still in flight", () => {
    const failures = new Map<number, string>([
      [1, "Topic A failed."],
      [2, "Topic B failed."],
    ]);
    const kept = dropFinishedSnsPublishFailures(failures, new Set([2]));
    expect(kept.get(1)).toBeUndefined();
    expect(kept.get(2)).toBe("Topic B failed.");
  });
});
