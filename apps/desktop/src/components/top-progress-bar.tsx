// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { cn } from "@/lib/utils";

/**
 * A thin indeterminate progress bar pinned to the top edge of its (relatively
 * positioned) container. Shown whenever a background fetch is in flight so the
 * user always has a signal that data is loading, even before any counts appear.
 */
function TopProgressBar({ active }: { active: boolean }) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-x-0 top-0 z-30 h-0.5 overflow-hidden",
        "transition-opacity duration-300",
        active ? "opacity-100" : "opacity-0",
      )}
    >
      {active ? (
        <div className="animate-progress-indeterminate h-full w-1/4 rounded-full bg-primary" />
      ) : null}
    </div>
  );
}

export { TopProgressBar };
