// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

/** Regional host `sqs.<region>.amazonaws.com`. Region is letters, digits, and hyphens. */
const SQS_REGIONAL_HOST = /^sqs\.([a-z0-9-]+)\.amazonaws\.com$/;

function parsedQueueUrl(queueUrl: string): URL | null {
  const trimmed = queueUrl.trim();
  if (!trimmed) return null;
  try {
    const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    return new URL(withProtocol);
  } catch {
    return null;
  }
}

function pathSegments(queueUrl: string): string[] {
  const parsed = parsedQueueUrl(queueUrl);
  if (parsed) {
    return parsed.pathname.split("/").filter(Boolean);
  }
  const trimmed = queueUrl.trim();
  if (!trimmed) return [];
  return trimmed.split("/").filter(Boolean);
}

function isSqsAwsHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "sqs.amazonaws.com" || SQS_REGIONAL_HOST.test(host);
}

function isLocalStackHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "localhost.localstack.cloud" ||
    host.endsWith(".localstack.cloud")
  );
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
  const parsed = parsedQueueUrl(value);
  if (!parsed) return false;
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  if (isSqsAwsHostname(parsed.hostname)) return true;
  if (!isLocalStackHostname(parsed.hostname)) return false;
  return parsed.pathname.split("/").filter(Boolean).length >= 1;
}

/**
 * Region embedded in an AWS SQS queue URL.
 * LocalStack hosts and URLs with no region return an empty string. The region is never guessed.
 */
export function sqsRegionFromUrl(queueUrl: string): string {
  const parsed = parsedQueueUrl(queueUrl);
  if (!parsed || !isSqsAwsHostname(parsed.hostname)) return "";
  return SQS_REGIONAL_HOST.exec(parsed.hostname.toLowerCase())?.[1] ?? "";
}
