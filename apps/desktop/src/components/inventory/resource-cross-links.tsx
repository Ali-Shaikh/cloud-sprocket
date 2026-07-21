// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import type { NavigateToResourceParams } from "@/lib/navigate-to-resource";
import type { ResourceCrossLink } from "@/lib/resource-cross-links";
import { cn } from "@/lib/utils";

export type ResourceCrossLinksProps = {
  links: ResourceCrossLink[];
  onNavigate: (params: NavigateToResourceParams) => void;
  className?: string;
};

/**
 * Presentational strip of inspector cross-links (e.g. Open in Logs).
 * Pure link data comes from lib/resource-cross-links; this only renders buttons.
 */
export function ResourceCrossLinks({ links, onNavigate, className }: ResourceCrossLinksProps) {
  if (links.length === 0) {
    return null;
  }

  return (
    <nav
      aria-label="Related resources"
      className={cn("flex flex-wrap items-center gap-x-3 gap-y-1", className)}
    >
      {links.map((link) => (
        <button
          key={link.id}
          type="button"
          onClick={() => onNavigate(link.params)}
          className="inline-flex w-fit items-center gap-1 text-xs text-violet-500 hover:underline"
        >
          {link.label}
        </button>
      ))}
    </nav>
  );
}
