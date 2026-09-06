// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { describe, expect, it } from "vitest";

import {
  AZURE_QUEUE_MESSAGE_MAX_BYTES,
  azureQueueMessageOversizeReason,
  azureQueueMessageUtf8Bytes,
  normaliseAzureQueueMessage,
} from "./azure-queue-message";

describe("normaliseAzureQueueMessage", () => {
  it("trims payload text", () => {
    expect(normaliseAzureQueueMessage("  hello queue  ")).toBe("hello queue");
  });

  it("rejects empty text", () => {
    expect(() => normaliseAzureQueueMessage("  ")).toThrow(/message text is required/);
  });

  it("rejects payloads over 64 KiB", () => {
    const tooLong = "x".repeat(AZURE_QUEUE_MESSAGE_MAX_BYTES + 1);
    expect(azureQueueMessageUtf8Bytes(tooLong)).toBe(AZURE_QUEUE_MESSAGE_MAX_BYTES + 1);
    expect(() => normaliseAzureQueueMessage(tooLong)).toThrow(/exceeds/);
    expect(azureQueueMessageOversizeReason(tooLong)).toMatch(/exceeds/);
  });

  it("counts UTF-8 bytes, not JS string length", () => {
    const euro = "€".repeat(Math.floor(AZURE_QUEUE_MESSAGE_MAX_BYTES / 3) + 1);
    expect(euro.length < AZURE_QUEUE_MESSAGE_MAX_BYTES).toBe(true);
    expect(azureQueueMessageUtf8Bytes(euro) > AZURE_QUEUE_MESSAGE_MAX_BYTES).toBe(true);
    expect(() => normaliseAzureQueueMessage(euro)).toThrow(/exceeds/);
  });

  it("accepts a payload at the byte limit", () => {
    const exact = "x".repeat(AZURE_QUEUE_MESSAGE_MAX_BYTES);
    expect(normaliseAzureQueueMessage(exact)).toBe(exact);
    expect(azureQueueMessageOversizeReason(exact)).toBeUndefined();
  });
});
