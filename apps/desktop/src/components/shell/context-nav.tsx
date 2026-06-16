import { Clock, Server } from "lucide-react";

import { cn } from "@/lib/utils";
import { ProviderIcon } from "@/components/provider-icon";
import { StatusDot } from "@/components/status-dot";

import type { ContextNavProps } from "./types";

const navItemBase =
  "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13.5px] font-medium";

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
  return (
    <aside
      data-slot="context-nav"
      className="flex h-full min-h-0 flex-col overflow-hidden border-r border-border bg-sidebar"
    >
      <div className="border-b border-border px-4 pb-3 pt-4">
        <div className="flex items-center gap-2.5">
          <div className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-muted">
            {connection.provider ? (
              <ProviderIcon provider={connection.provider} size={22} />
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
        {groups.map((group) => (
          <div key={group.label}>
            <div className="px-2 pb-1.5 pt-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              {group.label}
            </div>
            {group.items.map((item) => {
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
                  onClick={() => onSelectItem(item.id)}
                  className={cn(
                    navItemBase,
                    active
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
                  {item.count != null && (
                    <span
                      className={cn(
                        "ml-auto rounded-full px-1.5 py-px text-[11px] font-bold",
                        active ? "bg-background text-primary" : "bg-muted text-muted-foreground",
                      )}
                    >
                      {item.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className="grid gap-1 border-t border-border p-2.5">
        <button
          type="button"
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
    </aside>
  );
}

export { ContextNav };
