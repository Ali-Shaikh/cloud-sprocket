// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { Plus, Rocket, Server, Settings } from "lucide-react";

import { cn } from "@/lib/utils";
import { ProviderIcon } from "@/components/provider-icon";
import type { Status } from "@/components/status-dot";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { APP_VERSION } from "@/lib/app-version";

import type { ConnectionRailProps } from "./types";

const STATUS_BG: Record<Status, string> = {
  on: "bg-[color:var(--success)]",
  off: "bg-muted-foreground",
  error: "bg-destructive",
  warning: "bg-[color:var(--warning)]",
};

/**
 * The 68px dark rail down the left edge: brand mark, one item per connection,
 * an optional add button, and the settings + avatar footer.
 */
function ConnectionRail({
  connections,
  activeId,
  onSelect,
  onAddConnection,
  onOpenSettings,
  userInitials,
  showVersion = false,
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
          return (
            <Tooltip key={c.id}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={c.label}
                  aria-current={active ? "page" : undefined}
                  onClick={() => onSelect(c.id)}
                  className={cn(
                    "relative grid size-11 place-items-center rounded-[13px] transition-all",
                    active
                      ? "rounded-[15px] bg-white"
                      : "bg-white/[0.06] text-[#c7ccd6] hover:rounded-[15px] hover:bg-white/15",
                  )}
                >
                  {active && (
                    <span className="absolute -left-3 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r bg-white" />
                  )}
                  {c.kind === "local" ? (
                    <Server
                      className={cn("size-[26px]", active ? "text-rail" : "text-sky-400")}
                    />
                  ) : c.kind === "deploy" ? (
                    <Rocket
                      className={cn("size-[26px]", active ? "text-rail" : "text-violet-400")}
                    />
                  ) : (
                    <ProviderIcon provider={c.provider ?? c.id} size={26} />
                  )}
                  <span
                    className={cn(
                      "absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-[2.5px] border-rail",
                      STATUS_BG[c.status],
                    )}
                  />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">{c.label}</TooltipContent>
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

        {onOpenSettings && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="Settings"
                onClick={onOpenSettings}
                className="grid size-11 place-items-center rounded-[13px] text-[#c7ccd6] transition-colors hover:bg-white/15"
              >
                <Settings className="size-[22px]" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Settings</TooltipContent>
          </Tooltip>
        )}

        <div className="grid size-9 place-items-center rounded-full bg-gradient-to-br from-orange-300 to-pink-400 text-[13px] font-bold text-white">
          {userInitials ?? "CS"}
        </div>

        {showVersion && (
          <span
            className="pb-1 text-[10px] font-medium tracking-wide text-white/40"
            title={`CloudSprocket v${APP_VERSION}`}
          >
            v{APP_VERSION}
          </span>
        )}
      </TooltipProvider>
    </nav>
  );
}

export { ConnectionRail };
