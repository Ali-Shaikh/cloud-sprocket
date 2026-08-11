// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { ChevronDown, Clock, Loader2, RefreshCw, Server } from "lucide-react";

import { useCollapsedNavGroups } from "@/hooks/use-collapsed-nav-groups";
import { cn } from "@/lib/utils";
import { ProviderIcon } from "@/components/provider-icon";
import { StatusDot } from "@/components/status-dot";

import type { ContextNavProps, NavGroup } from "./types";

const navItemBase =
  "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13.5px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar";

const groupHeaderBase =
  "px-2 pb-1.5 pt-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground";

/** Sum of numeric item counts, shown on a collapsed header so nothing goes invisible. */
function groupCountSum(group: NavGroup): number | null {
  let sum = 0;
  let found = false;
  for (const item of group.items) {
    const count = typeof item.count === "string" ? Number(item.count) : item.count;
    if (typeof count === "number" && Number.isFinite(count)) {
      sum += count;
      found = true;
    }
  }
  return found ? sum : null;
}

/**
 * The 256px contextual sidebar: a connection header, grouped navigation items,
 * and a footer with the Activity toggle plus any caller-supplied buttons.
 */
function ContextNav({
  connection,
  groups,
  activeItemId,
  onSelectItem,
  onShowActivity,
  activityActive,
  footer,
}: ContextNavProps) {
  const { isCollapsed, toggleGroup } = useCollapsedNavGroups();
  return (
    <aside
      data-slot="context-nav"
      className="flex h-full min-h-0 flex-col overflow-hidden border-r border-border bg-sidebar"
    >
      <div className="border-b border-border px-4 pb-3 pt-4">
        <div className="flex items-center gap-2.5">
          <div className="grid size-8 shrink-0 place-items-center">
            {connection.provider ? (
              <ProviderIcon provider={connection.provider} size={32} variant="nav" />
            ) : (
              <Server className="size-[22px] text-sky-500" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div
              className="line-clamp-2 break-words text-sm font-bold leading-snug"
              title={connection.name}
            >
              {connection.name}
            </div>
            <div
              className="line-clamp-2 break-words text-xs leading-snug text-muted-foreground"
              title={connection.meta}
            >
              {connection.meta}
            </div>
          </div>
        </div>
        <div className="mt-2.5 flex items-center gap-1.5">
          <StatusDot status={connection.status} ring />
          <span className="text-xs text-muted-foreground">{connection.statusText}</span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
        {groups.map((group) => {
          const collapsible = Boolean(group.collapsible && group.id);
          const collapsed = collapsible && isCollapsed(group.id!);
          const collapsedCount = collapsed ? groupCountSum(group) : null;
          return (
          <div key={group.id ?? group.label}>
            {collapsible ? (
              <button
                type="button"
                aria-expanded={!collapsed}
                onClick={() => toggleGroup(group.id!)}
                className={cn(
                  groupHeaderBase,
                  "flex w-full items-center gap-1 rounded-md text-left transition-colors hover:text-foreground",
                )}
              >
                <ChevronDown
                  aria-hidden
                  className={cn("size-3 shrink-0 transition-transform", collapsed && "-rotate-90")}
                />
                <span className="truncate">{group.label}</span>
                {collapsedCount != null && (
                  <span className="ml-auto rounded-full bg-muted px-1.5 py-px text-[11px] font-bold normal-case tracking-normal">
                    {collapsedCount}
                  </span>
                )}
              </button>
            ) : (
              <div className={groupHeaderBase}>{group.label}</div>
            )}
            {!collapsed && group.items.map((item) => {
              // A parent tab stays highlighted when one of its sub-pages is
              // active (composite ids look like "s3:objects"), while the active
              // sub-page item also highlights via the exact match.
              const active =
                item.id === activeItemId || activeItemId.startsWith(`${item.id}:`);
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-label={
                    item.countRefreshable
                      ? `${item.label} (open to load inventory)`
                      : item.label
                  }
                  title={
                    item.countRefreshable
                      ? "Inventory not loaded yet. Open this service to load counts."
                      : undefined
                  }
                  disabled={item.comingSoon}
                  onClick={() => onSelectItem(item.id)}
                  className={cn(
                    navItemBase,
                    item.comingSoon
                      ? "cursor-not-allowed opacity-70"
                      : active
                        ? "bg-primary/10 font-semibold text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {item.iconUrl ? (
                    <img
                      src={item.iconUrl}
                      alt=""
                      className="size-[18px] shrink-0 object-contain"
                    />
                  ) : Icon ? (
                    <Icon
                      className={cn("size-[18px] shrink-0", active ? "opacity-100" : "opacity-85")}
                    />
                  ) : null}
                  <span className="truncate">{item.label}</span>
                  {item.comingSoon ? (
                    <span className="ml-auto shrink-0 rounded-full bg-muted px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                      Soon
                    </span>
                  ) : item.countLoading ? (
                    <Loader2 className="ml-auto size-3.5 shrink-0 animate-spin text-muted-foreground" />
                  ) : item.countRefreshable ? (
                    <RefreshCw
                      className="ml-auto size-3.5 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                  ) : item.count != null ? (
                    <span
                      className={cn(
                        "ml-auto rounded-full px-1.5 py-px text-[11px] font-bold",
                        active ? "bg-background text-primary" : "bg-muted text-muted-foreground",
                      )}
                    >
                      {item.count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
          );
        })}
      </div>

      <div className="border-t border-border">
        <div className="grid gap-1 p-2.5">
          <button
            type="button"
            aria-label="Recent activity"
            onClick={onShowActivity}
            className={cn(
              navItemBase,
              activityActive
                ? "bg-primary/10 font-semibold text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Clock className="size-[18px]" />
            <span className="truncate">Recent activity</span>
          </button>
          {footer}
        </div>
      </div>
    </aside>
  );
}

export { ContextNav };
