// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useRef, useState } from "react";

export function useGcpComputeLifecycle() {
  const active = useRef(new Set<string>());
  const [pendingProfiles, setPendingProfiles] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  async function runLifecycle(
    profileId: string,
    run: () => Promise<boolean>,
  ): Promise<boolean> {
    if (active.current.has(profileId)) return false;
    active.current.add(profileId);
    setPendingProfiles(new Set(active.current));
    try {
      return await run();
    } finally {
      active.current.delete(profileId);
      setPendingProfiles(new Set(active.current));
    }
  }

  return { pendingProfiles, runLifecycle };
}
