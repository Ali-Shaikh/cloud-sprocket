import { StatusDot } from "@/components/status-dot";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

import type { ActivityDrawerProps } from "./types";

/**
 * A right-side Sheet listing recent activity entries, each with a tone dot,
 * message, timestamp, and optional detail.
 */
function ActivityDrawer({
  open,
  onOpenChange,
  title,
  subtitle,
  entries,
}: ActivityDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-[440px] max-w-[440px] flex-col gap-0 p-0"
      >
        <SheetHeader className="border-b border-border px-5 py-4">
          <SheetTitle>{title ?? "Recent activity"}</SheetTitle>
          {subtitle ? <SheetDescription>{subtitle}</SheetDescription> : null}
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-2">
          {entries.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No activity yet.</p>
          ) : (
            entries.map((entry) => (
              <div
                key={entry.id}
                className="flex gap-3 border-b border-border py-3 last:border-0"
              >
                <StatusDot status={entry.tone ?? "off"} className="mt-1.5" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-foreground">{entry.message}</div>
                  <div className="mt-0.5 font-mono text-xs text-muted-foreground">
                    {entry.timestamp}
                  </div>
                  {entry.detail ? (
                    <div className="mt-1 break-words text-xs text-muted-foreground">
                      {entry.detail}
                    </div>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export { ActivityDrawer };
