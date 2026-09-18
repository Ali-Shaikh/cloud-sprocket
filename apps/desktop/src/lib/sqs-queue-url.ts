// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

function pathSegments(queueUrl: string): string[] {
  const trimmed = queueUrl.trim();
  if (!trimmed) return [];
  try {
    const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const parsed = new URL(withProtocol);
    return parsed.pathname.split("/").filter(Boolean);
  } catch {
    return trimmed.split("/").filter(Boolean);
  }
}

/** Final path segment of an SQS queue URL (AWS or LocalStack). */
export function sqsQueueNameFromUrl(queueUrl: string): string {
  const segments = pathSegments(queueUrl);
  return segments[segments.length - 1] ?? "";
}

function isAwsAccountId(value: string): boolean {
  return /^\d{12}$/.test(value);
}

/** True when the URL is missing the 12-digit account id path segment. */
export function sqsQueueUrlIsIncomplete(queueUrl: string): boolean {
  const segments = pathSegments(queueUrl);
  if (segments.length === 0) return true;
  if (segments.length === 1) return true;
  return !isAwsAccountId(segments[0]);
}

export function sqsQueueUrlsMatch(left: string, right: string): boolean {
  const a = left.trim();
  const b = right.trim();
  if (!a || !b) return false;
  if (a === b) return true;
  const nameA = sqsQueueNameFromUrl(a);
  const nameB = sqsQueueNameFromUrl(b);
  return Boolean(nameA) && nameA === nameB;
}

export function findSqsQueueByUrl<T extends { queueUrl: string; queueName?: string }>(
  queues: readonly T[],
  selectedUrl: string | undefined,
): T | undefined {
  const wanted = selectedUrl?.trim() ?? "";
  if (!wanted) return undefined;
  const exact = queues.find((queue) => queue.queueUrl === wanted);
  if (exact) return exact;
  const name = sqsQueueNameFromUrl(wanted);
  if (!name) return undefined;
  return queues.find(
    (queue) => queue.queueName === name || sqsQueueNameFromUrl(queue.queueUrl) === name,
  );
}

export function isSqsQueueUrl(value: string): boolean {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return false;
  if (trimmed.includes("sqs.") && trimmed.includes("amazonaws.com")) return true;
  if (trimmed.includes("localhost:4566/") || trimmed.includes("localhost.localstack.cloud")) {
    return pathSegments(value).length >= 1;
  }
  return false;
}
