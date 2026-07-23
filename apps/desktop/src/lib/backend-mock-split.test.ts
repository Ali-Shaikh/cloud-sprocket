// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { describe, expect, it } from "vitest";

import { backendRequest, isBrowserMockEnabled } from "@/lib/backend";
import type { SessionSnapshot } from "@/types/backend";

// Source-text guards: assert the IPC module never statically imports the mock.
// (Vitest resolves these via Vite; import.meta.url + ?raw keeps us free of @types/node.)
import ipcSource from "./backend-ipc.ts?raw";
import facadeSource from "./backend.ts?raw";

describe("backend mock split (F-003)", () => {
  it("does not statically import backend-mock from the IPC path", () => {
    // Static import of the mock would pull fixtures into every consumer graph.
    expect(ipcSource).not.toMatch(/^\s*import\b[^;]*backend-mock/m);
    expect(facadeSource).not.toMatch(/^\s*import\b[^;]*backend-mock/m);
    expect(facadeSource).toMatch(/from\s+["']\.\/backend-ipc["']/);

    // Mock must only be reached via dynamic import behind the build-time flag.
    expect(ipcSource).toMatch(/await import\(\s*["']\.\/backend-mock["']\s*\)/);
    expect(ipcSource).toMatch(/__ENABLE_BROWSER_MOCK__/);
  });

  it("enables the browser mock under vitest and serves session RPCs", async () => {
    expect(isBrowserMockEnabled()).toBe(true);

    const session = await backendRequest<SessionSnapshot>("session.get");
    expect(session).toEqual(
      expect.objectContaining({
        currentProviderId: expect.any(String),
        isLocked: expect.any(Boolean),
      }),
    );
  });
});
