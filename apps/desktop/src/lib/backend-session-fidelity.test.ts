// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { beforeEach, describe, expect, it } from "vitest";

import { backendRequest } from "@/lib/backend";
import type { SessionSnapshot } from "@/types/backend";

describe("mock session provider fidelity", () => {
  beforeEach(async () => {
    // Reset mock session through the public reset path when available.
    try {
      await backendRequest("app.reset", { confirmation: "RESET" });
    } catch {
      // Browser mock always supports app.reset; ignore if a prior test left a
      // non-mock environment.
    }
  });

  it("refuses session.selectProvider while locked (F-011)", async () => {
    await backendRequest("session.lock");
    const locked = await backendRequest<SessionSnapshot>("session.get");
    expect(locked.isLocked).toBe(true);

    await expect(
      backendRequest<SessionSnapshot>("session.selectProvider", {
        providerId: "azure",
      }),
    ).rejects.toThrow(/session\.unlock/);

    const stillLocked = await backendRequest<SessionSnapshot>("session.get");
    expect(stillLocked.isLocked).toBe(true);
  });

  it("clears profile selection on session.selectProvider after unlock", async () => {
    await backendRequest("session.lock");
    await backendRequest("session.unlock");

    const next = await backendRequest<SessionSnapshot>("session.selectProvider", {
      providerId: "azure",
    });

    expect(next.isLocked).toBe(false);
    expect(next.currentProviderId).toBe("azure");
    expect(next.selectedProfileId).toBeUndefined();
    expect(next.selectedAuthMethod).toBeUndefined();
  });

  it("refuses session.selectProfile while locked (F-011)", async () => {
    await backendRequest("session.lock");
    await expect(
      backendRequest<SessionSnapshot>("session.selectProfile", {
        providerId: "azure",
        profileId: "sub-001",
      }),
    ).rejects.toThrow(/session\.unlock/);
  });

  it("selects profile after unlock", async () => {
    await backendRequest("session.lock");
    await backendRequest("session.unlock");
    const next = await backendRequest<SessionSnapshot>("session.selectProfile", {
      providerId: "azure",
      profileId: "sub-001",
    });

    expect(next.isLocked).toBe(false);
    expect(next.currentProviderId).toBe("azure");
    expect(next.selectedProfileId).toBe("sub-001");
    expect(next.selectedAuthMethod).toBeUndefined();
  });
});
