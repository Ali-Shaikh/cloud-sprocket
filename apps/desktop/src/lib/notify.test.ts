// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";

import {
  __getNotifications,
  __resetNotifications,
  clearAll,
  dismiss,
  markAllRead,
  notify,
  notifyJob,
} from "./notify";

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

// The mocked toast namespace, typed for convenient assertions.
const mockToast = toast as unknown as {
  success: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  warning: ReturnType<typeof vi.fn>;
  info: ReturnType<typeof vi.fn>;
  loading: ReturnType<typeof vi.fn>;
  dismiss: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  __resetNotifications();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("notify", () => {
  it("adds one record and fires a success toast that auto-dismisses", () => {
    notify("success", "Saved", "All changes stored.");

    const store = __getNotifications();
    expect(store.records).toHaveLength(1);
    expect(store.unreadCount).toBe(1);
    expect(store.records[0]).toMatchObject({
      tone: "success",
      title: "Saved",
      description: "All changes stored.",
      read: false,
      count: 1,
    });
    expect(mockToast.success).toHaveBeenCalledTimes(1);
    expect(mockToast.success).toHaveBeenCalledWith(
      "Saved",
      expect.objectContaining({ duration: 4000, description: "All changes stored." }),
    );
  });

  it("fires a persistent error toast", () => {
    notify("error", "Upload failed", "The network dropped.");

    expect(mockToast.error).toHaveBeenCalledWith(
      "Upload failed",
      expect.objectContaining({ duration: Number.POSITIVE_INFINITY }),
    );
  });

  it("collapses identical bursts inside the window into one record with a count", () => {
    vi.useFakeTimers();

    const firstId = notify("warning", "Rate limited");
    const secondId = notify("warning", "Rate limited");

    expect(firstId).toBe(secondId);
    const store = __getNotifications();
    expect(store.records).toHaveLength(1);
    expect(store.records[0].count).toBe(2);
    // The visible toast title and the history title gain a (×N) suffix.
    expect(mockToast.warning).toHaveBeenCalledTimes(2);
    expect(mockToast.warning).toHaveBeenLastCalledWith(
      "Rate limited (×2)",
      expect.objectContaining({ id: firstId }),
    );
  });

  it("creates separate records once the dedupe window has elapsed", () => {
    vi.useFakeTimers();

    notify("info", "Sync started");
    vi.advanceTimersByTime(4001);
    notify("info", "Sync started");

    const store = __getNotifications();
    expect(store.records).toHaveLength(2);
    expect(store.records.every((record) => record.count === 1)).toBe(true);
  });

  it("passes an action button through to the toast and stores it on the record", () => {
    const run = vi.fn();
    notify("info", "Update ready", undefined, { action: { label: "Reload", run } });

    expect(mockToast.info).toHaveBeenCalledWith(
      "Update ready",
      expect.objectContaining({
        action: expect.objectContaining({ label: "Reload" }),
      }),
    );
    const store = __getNotifications();
    expect(store.records[0].action?.label).toBe("Reload");
  });
});

describe("notifyJob", () => {
  it("keeps a single record across queued -> running -> completed", () => {
    notifyJob({ jobId: "job-1", label: "Refresh", status: "queued", message: "Queued." });
    notifyJob({ jobId: "job-1", label: "Refresh", status: "running", message: "Working." });
    notifyJob({ jobId: "job-1", label: "Refresh", status: "completed", message: "Done." });

    const store = __getNotifications();
    expect(store.records).toHaveLength(1);
    expect(store.records[0].id).toBe("job-1");
    expect(store.records[0].tone).toBe("success");
    expect(mockToast.loading).toHaveBeenCalledWith("Refresh", expect.objectContaining({ id: "job-1" }));
    expect(mockToast.success).toHaveBeenCalledWith("Refresh", expect.objectContaining({ id: "job-1" }));
  });

  it("renders a failed job as a persistent error", () => {
    notifyJob({ jobId: "job-2", label: "Deploy", status: "failed", message: "Boom." });

    const store = __getNotifications();
    expect(store.records[0].tone).toBe("error");
    expect(mockToast.error).toHaveBeenCalledWith(
      "Deploy",
      expect.objectContaining({ id: "job-2", duration: Number.POSITIVE_INFINITY }),
    );
  });
});

describe("history management", () => {
  it("caps history at 100 records, newest first", () => {
    for (let index = 0; index < 105; index += 1) {
      notify("info", `Event ${index}`, undefined, { dedupeKey: `event-${index}` });
    }

    const store = __getNotifications();
    expect(store.records).toHaveLength(100);
    expect(store.records[0].title).toBe("Event 104");
  });

  it("markAllRead clears the unread count", () => {
    notify("info", "One", undefined, { dedupeKey: "one" });
    notify("info", "Two", undefined, { dedupeKey: "two" });
    expect(__getNotifications().unreadCount).toBe(2);

    markAllRead();
    expect(__getNotifications().unreadCount).toBe(0);
    expect(__getNotifications().records.every((record) => record.read)).toBe(true);
  });

  it("dismiss removes the record and dismisses the matching toast", () => {
    const id = notify("info", "Removable");

    dismiss(id);
    expect(__getNotifications().records).toHaveLength(0);
    expect(mockToast.dismiss).toHaveBeenCalledWith(id);
  });

  it("clearAll empties history and dismisses every toast", () => {
    notify("info", "A", undefined, { dedupeKey: "a" });
    notify("info", "B", undefined, { dedupeKey: "b" });

    clearAll();
    expect(__getNotifications().records).toHaveLength(0);
    expect(mockToast.dismiss).toHaveBeenCalledWith();
  });
});
