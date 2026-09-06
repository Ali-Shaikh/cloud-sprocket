// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

/** Azure Storage Queue message cap, matching the daemon adapter. */
export const AZURE_QUEUE_MESSAGE_MAX_BYTES = 64 * 1024;

export function azureQueueMessageUtf8Bytes(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** Trim and reject empty or oversized queue payloads. Throws with daemon-aligned copy. */
export function normaliseAzureQueueMessage(text: string): string {
  const normalised = text.trim();
  if (!normalised) {
    throw new Error("message text is required");
  }
  if (azureQueueMessageUtf8Bytes(normalised) > AZURE_QUEUE_MESSAGE_MAX_BYTES) {
    throw new Error(`message exceeds ${AZURE_QUEUE_MESSAGE_MAX_BYTES} bytes`);
  }
  return normalised;
}

export function azureQueueMessageOversizeReason(text: string): string | undefined {
  const normalised = text.trim();
  if (!normalised) {
    return undefined;
  }
  if (azureQueueMessageUtf8Bytes(normalised) <= AZURE_QUEUE_MESSAGE_MAX_BYTES) {
    return undefined;
  }
  return `Message exceeds ${AZURE_QUEUE_MESSAGE_MAX_BYTES} bytes.`;
}
