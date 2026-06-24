// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { X } from "lucide-react";

import { KqlQueryRunControls, type KqlQueryRunControlsProps } from "@/components/kql/KqlQueryRunControls";
import { cn } from "@/lib/utils";
import type { WafGroupByField, WafGroupByOption } from "@/lib/waf-query-execution";
import { Button } from "@/components/ui/button";

export type WafQueryRunControlsProps = KqlQueryRunControlsProps;

export function WafQueryRunControls(props: WafQueryRunControlsProps) {
  return <KqlQueryRunControls {...props} />;
}

export type WafQueryGroupByBarProps = {
  running: boolean;
  groupByFields: WafGroupByField[];
  groupByOptions: WafGroupByOption[];
  onToggleGroupBy: (field: WafGroupByField, enabled: boolean) => void;
  onClearGroupBy: () => void;
};

export function WafQueryGroupByBar({
  running,
  groupByFields,
  groupByOptions,
  onToggleGroupBy,
  onClearGroupBy,
}: WafQueryGroupByBarProps) {
  const grouped = groupByFields.length > 0;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border bg-muted/15 px-3 py-2">
      <span className="shrink-0 text-xs font-medium text-muted-foreground">Summarise by</span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
        {groupByOptions.map((option) => {
          const active = groupByFields.includes(option.field);
          return (
            <button
              key={option.field}
              type="button"
              disabled={running}
              aria-pressed={active}
              aria-label={`Group by ${option.label}`}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                "disabled:pointer-events-none disabled:opacity-50",
                active
                  ? "border-primary/40 bg-primary/10 font-medium text-primary"
                  : "border-border bg-background text-muted-foreground hover:border-foreground/20 hover:bg-muted/40 hover:text-foreground",
              )}
              onClick={() => onToggleGroupBy(option.field, !active)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {grouped ? (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 gap-1 px-2 text-xs text-muted-foreground"
          onClick={onClearGroupBy}
        >
          <X className="size-3" />
          Clear
        </Button>
      ) : null}
      {grouped ? (
        <p className="w-full text-xs text-amber-700 dark:text-amber-400">
          Showing counts per dimension. Clear summarisation to inspect individual requests.
        </p>
      ) : null}
    </div>
  );
}