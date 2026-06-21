// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { Loader2 } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";

/**
 * First-load placeholder for a workspace data view. Shown while the workspace
 * inventory is still being fetched, so the user sees an explicit "loading"
 * state instead of a panel full of zeroes. Subsequent refreshes keep the
 * existing data on screen and rely on the top progress bar instead.
 */
function WorkspaceSkeleton({ label = "workspace" }: { label?: string }) {
  return (
    <div className="mx-auto max-w-6xl space-y-6" data-slot="workspace-skeleton">
      <header className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          <span>Fetching {label}...</span>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="space-y-3 rounded-lg border border-border bg-card p-[18px] shadow-sm"
          >
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-7 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>

      <div className="space-y-2 rounded-lg border border-border bg-card p-[18px] shadow-sm">
        <Skeleton className="h-4 w-40" />
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-9 w-full" />
        ))}
      </div>
    </div>
  );
}

export { WorkspaceSkeleton };
