// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useState } from "react";
import { ChevronDown, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { serviceCatalogIconUrl } from "@/lib/service-catalog-icons";
import {
  formatHiddenResourceHit,
  hiddenResourceChipLabel,
} from "@/lib/hidden-resources";
import { cn } from "@/lib/utils";
import type { HiddenResourceHit } from "@/types/backend";

export type HiddenResourcesHintProps = {
  hits: HiddenResourceHit[];
  enablingServiceId?: string | null;
  onEnableService: (hit: HiddenResourceHit) => void;
};

export function HiddenResourcesHint({
  hits,
  enablingServiceId = null,
  onEnableService,
}: HiddenResourcesHintProps) {
  const [expanded, setExpanded] = useState(false);
  if (hits.length === 0) {
    return null;
  }

  const chipLabel = hiddenResourceChipLabel(hits);

  return (
    <section
      className="rounded-lg border border-[color:var(--warning)]/35 bg-[color:var(--warning)]/10 px-3.5 py-2.5 text-sm"
      aria-label="Hidden resources in disabled services"
    >
      <div className="flex flex-wrap items-center gap-2.5">
        <TriangleAlert className="size-4 shrink-0 text-[color:var(--warning)]" aria-hidden />
        <button
          type="button"
          className="min-w-0 flex-1 text-left font-medium"
          onClick={() => {
            setExpanded((open) => !open);
          }}
        >
          <span>{chipLabel}</span>
          <ChevronDown
            className={cn(
              "ml-1.5 inline size-4 align-[-2px] text-muted-foreground transition-transform",
              expanded && "rotate-180",
            )}
            aria-hidden
          />
        </button>
        {!expanded ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="ml-auto h-7 px-3 text-xs"
            onClick={() => {
              setExpanded(true);
            }}
          >
            Review
          </Button>
        ) : null}
      </div>

      {expanded ? (
        <ul className="mt-3 space-y-2 border-t border-[color:var(--warning)]/25 pt-3">
          {hits.map((hit) => {
            const iconUrl = serviceCatalogIconUrl(hit.serviceId);
            const enabling = enablingServiceId === hit.serviceId;
            return (
              <li
                key={`${hit.providerId}:${hit.serviceId}`}
                className="flex flex-wrap items-center gap-3 rounded-md border border-border/70 bg-card/80 px-3 py-2"
              >
                <div className="grid size-8 shrink-0 place-items-center rounded-md bg-muted">
                  {iconUrl ? (
                    <img src={iconUrl} alt="" className="size-5 object-contain" />
                  ) : (
                    <span className="text-[10px] font-bold uppercase text-muted-foreground">
                      {hit.label.slice(0, 3)}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{hit.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatHiddenResourceHit(hit)}
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  className="h-7 px-3 text-xs"
                  disabled={enabling}
                  onClick={() => {
                    onEnableService(hit);
                  }}
                >
                  {enabling ? "Enabling…" : "Enable"}
                </Button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}