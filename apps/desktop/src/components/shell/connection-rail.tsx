// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { Code2, Plus, Rocket, Server } from "lucide-react";

import { cn } from "@/lib/utils";
import { PROVIDER_ACCENTS, ProviderIcon } from "@/components/provider-icon";
import type { Status } from "@/components/status-dot";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { AppMenu } from "./app-menu";
import type { ConnectionRailProps } from "./types";

const STATUS_BG: Record<Status, string> = {
  on: "bg-[color:var(--success)]",
  off: "bg-muted-foreground",
  error: "bg-destructive",
  warning: "bg-[color:var(--warning)]",
};

/**
 * The 68px dark rail down the left edge: brand mark, one item per connection,
 * an optional add button, and the app menu footer.
 */
function ConnectionRail({
  connections,
  activeId,
  onSelect,
  onAddConnection,
  menu,
}: ConnectionRailProps) {
  return (
    <nav
      data-slot="connection-rail"
      className="flex h-full flex-col items-center gap-1.5 bg-rail py-3"
    >
      <TooltipProvider>
        <div className="mb-2 grid size-10 place-items-center rounded-[11px] bg-gradient-to-br from-primary to-purple-500 text-[15px] font-extrabold text-white shadow-md">
          CS
        </div>

        {connections.map((c) => {
          const active = c.id === activeId;
          const accent = c.accentColor ?? (c.provider ? PROVIDER_ACCENTS[c.provider] : undefined);
          const tooltip = c.tooltip ?? c.label;
          return (
            <Tooltip key={c.id}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={tooltip}
                  aria-current={active ? "page" : undefined}
                  onClick={() => onSelect(c.id)}
                  className={cn(
                    "relative grid size-11 place-items-center rounded-[13px] transition-all",
                    active ? "rounded-[15px]" : "hover:rounded-[15px] hover:bg-white/[0.06]",
                  )}
                >
                  {active && (
                    <span className="absolute -left-3 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r bg-white" />
                  )}
                  {active && accent ? (
                    <span
                      className="absolute bottom-2 left-0.5 top-2 w-[3px] rounded-sm"
                      style={{ backgroundColor: accent }}
                    />
                  ) : null}
                  {c.kind === "local" ? (
                    <span
                      className={cn(
                        "grid size-8 place-items-center rounded-[9px] bg-white/[0.08] transition-colors",
                        active && "bg-white/[0.12] shadow-[0_0_0_1.5px_rgba(255,255,255,0.35)]",
                      )}
                    >
                      <Server className="size-5 text-sky-400" />
                    </span>
                  ) : c.kind === "deploy" ? (
                    <span
                      className={cn(
                        "grid size-8 place-items-center rounded-[9px] bg-white/[0.08] transition-colors",
                        active && "bg-white/[0.12] shadow-[0_0_0_1.5px_rgba(255,255,255,0.35)]",
                      )}
                    >
                      <Rocket className="size-5 text-violet-400" />
                    </span>
                  ) : c.kind === "tools" ? (
                    <span
                      className={cn(
                        "grid size-8 place-items-center rounded-[9px] bg-white/[0.08] transition-colors",
                        active && "bg-white/[0.12] shadow-[0_0_0_1.5px_rgba(255,255,255,0.35)]",
                      )}
                    >
                      <Code2 className="size-5 text-amber-300" />
                    </span>
                  ) : (
                    <ProviderIcon
                      provider={c.provider ?? c.id}
                      size={32}
                      variant="rail"
                      className={cn(
                        active && "bg-white/[0.12] shadow-[0_0_0_1.5px_rgba(255,255,255,0.35)]",
                      )}
                    />
                  )}
                  <span
                    className={cn(
                      "absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-[2.5px] border-rail",
                      STATUS_BG[c.status],
                    )}
                  />
                  {c.profileBadge ? (
                    <span className="absolute -right-0.5 -top-0.5 grid min-w-[14px] place-items-center rounded-full border-2 border-rail bg-primary px-[3px] text-[8px] font-bold leading-none text-white">
                      {c.profileBadge}
                    </span>
                  ) : null}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">{tooltip}</TooltipContent>
            </Tooltip>
          );
        })}

        {onAddConnection && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="Connect a cloud"
                onClick={onAddConnection}
                className="grid size-11 place-items-center rounded-[13px] border-[1.5px] border-dashed border-white/25 text-[#9aa3b2] transition-colors hover:border-primary hover:text-white"
              >
                <Plus />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Connect a cloud</TooltipContent>
          </Tooltip>
        )}

        <div className="flex-1" />

        <AppMenu {...menu} />
      </TooltipProvider>
    </nav>
  );
}

export { ConnectionRail };