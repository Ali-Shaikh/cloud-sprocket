// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useSyncExternalStore } from "react";
import { toast } from "sonner";

import type { JobStatus } from "@/types/backend";

export type NotificationTone = "success" | "error" | "warning" | "info" | "in-progress";

/** A single actionable button surfaced on a toast and in the history drawer. */
export interface NotificationAction {
  label: string;
  run: () => void;
}

/** A notification as kept in history; the visible toast mirrors this record. */
export interface NotificationRecord {
  id: string;
  tone: NotificationTone;
  title: string;
  description?: string;
  /** Date.now() of the latest occurrence. */
  timestamp: number;
  read: boolean;
  /** Collapsed-burst multiplier, always >= 1. */
  count: number;
  action?: NotificationAction;
}

/** Optional tuning for a single notify() call. */
export interface NotifyOptions {
  /** Stable id; if it matches an existing record/toast, the toast updates in place. */
  id?: string;
  /** Collapse identical bursts; defaults to `${tone}|${title}|${description ?? ""}`. */
  dedupeKey?: string;
  action?: NotificationAction;
  /** Override the default lifecycle duration, in milliseconds. */
  durationMs?: number;
}

/** Read-only view of the store handed to React via useNotifications(). */
export interface NotificationStore {
  /** Newest first, capped at 100. */
  records: NotificationRecord[];
  /** Number of records with read === false. */
  unreadCount: number;
  markAllRead(): void;
  /** Remove from history and dismiss the matching toast. */
  dismiss(id: string): void;
  /** Clear history and dismiss all visible toasts. */
  clearAll(): void;
}

const HISTORY_CAP = 100;
const DEDUPE_WINDOW_MS = 4000;

/** Default auto-dismiss durations. Errors and in-progress toasts persist. */
const TONE_DURATIONS: Record<NotificationTone, number> = {
  success: 4000,
  info: 6000,
  warning: 6000,
  "in-progress": Number.POSITIVE_INFINITY,
  error: Number.POSITIVE_INFINITY,
};

// Module-level store so notify()/notifyJob() can be called from outside React.
let records: NotificationRecord[] = [];
const listeners = new Set<() => void>();

// Cache the snapshot so useSyncExternalStore sees a stable reference until a
// mutation actually happens, otherwise it would loop.
let snapshot: NotificationStore = buildSnapshot();

function buildSnapshot(): NotificationStore {
  return {
    records,
    unreadCount: records.reduce((total, record) => (record.read ? total : total + 1), 0),
    markAllRead,
    dismiss,
    clearAll,
  };
}

function emit(): void {
  snapshot = buildSnapshot();
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): NotificationStore {
  return snapshot;
}

/** Appends a title with a " (×N)" suffix once a burst has collapsed. */
function withCount(title: string, count: number): string {
  return count > 1 ? `${title} (×${count})` : title;
}

/** Fires the sonner toast that mirrors a record's current state. */
function fireToast(record: NotificationRecord, duration: number): void {
  const action = record.action
    ? { label: record.action.label, onClick: record.action.run }
    : undefined;
  const options = {
    id: record.id,
    description: record.description,
    duration,
    ...(action ? { action } : {}),
  };
  const title = withCount(record.title, record.count);
  switch (record.tone) {
    case "success":
      toast.success(title, options);
      break;
    case "error":
      toast.error(title, options);
      break;
    case "warning":
      toast.warning(title, options);
      break;
    case "in-progress":
      toast.loading(title, options);
      break;
    default:
      toast.info(title, options);
  }
}

/** Inserts a record at the top of history and enforces the cap. */
function pushRecord(record: NotificationRecord): void {
  records = [record, ...records].slice(0, HISTORY_CAP);
  emit();
}

let idCounter = 0;

function nextId(): string {
  idCounter += 1;
  return `notif-${idCounter}`;
}

// Track each record's dedupe key so a burst can find its predecessor without
// re-deriving the key (which may have been supplied explicitly).
const dedupeKeys = new Map<string, string>();

function dedupeKeyFor(record: NotificationRecord): string {
  return (
    dedupeKeys.get(record.id) ?? `${record.tone}|${record.title}|${record.description ?? ""}`
  );
}

/**
 * Fires a toast and records a notification in history. Success, info and
 * warning toasts auto-dismiss; errors and in-progress toasts persist until they
 * are dismissed or resolved. Identical bursts within a short window collapse
 * into a single record with a count. Returns the toast/record id used.
 */
export function notify(
  tone: NotificationTone,
  title: string,
  description?: string,
  options?: NotifyOptions,
): string {
  const duration = options?.durationMs ?? TONE_DURATIONS[tone];
  const dedupeKey = options?.dedupeKey ?? `${tone}|${title}|${description ?? ""}`;
  const now = Date.now();

  // Collapse a recent identical burst onto the existing record/toast.
  const existing = records.find(
    (record) =>
      dedupeKeyFor(record) === dedupeKey && now - record.timestamp <= DEDUPE_WINDOW_MS,
  );
  if (existing) {
    const updated: NotificationRecord = {
      ...existing,
      count: existing.count + 1,
      timestamp: now,
      read: false,
      action: options?.action ?? existing.action,
    };
    records = [updated, ...records.filter((record) => record.id !== existing.id)].slice(
      0,
      HISTORY_CAP,
    );
    dedupeKeys.set(updated.id, dedupeKey);
    emit();
    fireToast(updated, duration);
    return updated.id;
  }

  const id = options?.id ?? nextId();
  const record: NotificationRecord = {
    id,
    tone,
    title,
    description,
    timestamp: now,
    read: false,
    count: 1,
    action: options?.action,
  };
  dedupeKeys.set(id, dedupeKey);
  pushRecord(record);
  fireToast(record, duration);
  return id;
}

/**
 * Mirrors a backend job into a single record/toast keyed by the job id: a
 * spinner while queued or running, then success or a persistent error. Job
 * records update in place and are exempt from burst collapsing.
 */
export function notifyJob(job: JobStatus): void {
  const tone: NotificationTone =
    job.status === "failed" ? "error" : job.status === "completed" ? "success" : "in-progress";
  const duration = TONE_DURATIONS[tone];
  const now = Date.now();

  const existing = records.find((record) => record.id === job.jobId);
  const record: NotificationRecord = {
    id: job.jobId,
    tone,
    title: job.label,
    description: job.message,
    timestamp: now,
    read: false,
    count: 1,
    action: existing?.action,
  };
  if (existing) {
    records = [record, ...records.filter((candidate) => candidate.id !== job.jobId)].slice(
      0,
      HISTORY_CAP,
    );
    emit();
  } else {
    pushRecord(record);
  }
  fireToast(record, duration);
}

export function markAllRead(): void {
  if (records.every((record) => record.read)) {
    return;
  }
  records = records.map((record) => (record.read ? record : { ...record, read: true }));
  emit();
}

export function dismiss(id: string): void {
  const next = records.filter((record) => record.id !== id);
  if (next.length !== records.length) {
    records = next;
    dedupeKeys.delete(id);
    emit();
  }
  toast.dismiss(id);
}

export function clearAll(): void {
  if (records.length > 0) {
    records = [];
    dedupeKeys.clear();
    emit();
  }
  toast.dismiss();
}

/**
 * Subscribes a React component to the notification store. Safe to call from
 * any component; the underlying store lives at module scope.
 */
export function useNotifications(): NotificationStore {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Test-only helper to reset the store between cases. */
export function __resetNotifications(): void {
  records = [];
  dedupeKeys.clear();
  idCounter = 0;
  snapshot = buildSnapshot();
}

/** Test-only helper to read the current store snapshot without React. */
export function __getNotifications(): NotificationStore {
  return getSnapshot();
}
