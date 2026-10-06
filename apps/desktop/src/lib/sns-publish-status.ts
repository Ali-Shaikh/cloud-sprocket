// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

export type SnsPublishStatusEvent = {
  serial: number;
  latestSerial: number;
  text: string;
  failed: boolean;
};

// Keeps an older publish failure visible without letting that older request
// replace the status of a newer publish.
export function applySnsPublishStatus(
  current: string,
  failures: ReadonlyMap<number, string>,
  event: SnsPublishStatusEvent,
): { status: string; failures: Map<number, string> } {
  const nextFailures = new Map(failures);
  if (event.failed) {
    nextFailures.set(event.serial, event.text);
  } else {
    nextFailures.delete(event.serial);
  }

  if (event.serial !== event.latestSerial) {
    if (!event.failed || !event.text || current.includes(event.text)) {
      return { status: current, failures: nextFailures };
    }
    return { status: `${current} ${event.text}`.trim(), failures: nextFailures };
  }

  const shownFailures = [...nextFailures.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([, message]) => message);
  if (event.failed) {
    return { status: shownFailures.join(" "), failures: nextFailures };
  }
  const status =
    shownFailures.length > 0 ? `${event.text} ${shownFailures.join(" ")}` : event.text;
  return { status, failures: new Map() };
}
