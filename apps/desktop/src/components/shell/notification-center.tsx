import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

import type { NotificationCenterProps, NotificationRecord, NotificationTone } from "./types";

/** Per-tone icon and colour, matching the StatusDot / status-pill token approach. */
const TONE_ICON: Record<NotificationTone, LucideIcon> = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
  "in-progress": Loader2,
};

const TONE_COLOUR: Record<NotificationTone, string> = {
  success: "text-[color:var(--success)]",
  error: "text-destructive",
  warning: "text-[color:var(--warning)]",
  info: "text-primary",
  "in-progress": "text-primary",
};

/** Coarse relative time: "just now" / "Nm ago" / "Nh ago" / "Nd ago". */
function formatRelativeTime(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) {
    return "just now";
  }
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  return `${Math.floor(hours / 24)}d ago`;
}

function NotificationRow({
  record,
  onDismiss,
}: {
  record: NotificationRecord;
  onDismiss: (id: string) => void;
}) {
  const Icon = TONE_ICON[record.tone];
  const spinning = record.tone === "in-progress";

  return (
    <div
      className={cn(
        "group relative flex gap-3 border-b border-border py-3 pl-3 pr-1 last:border-0",
        !record.read && "bg-muted/40",
      )}
    >
      {!record.read ? (
        <span
          aria-hidden
          className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary"
        />
      ) : null}
      <Icon
        className={cn(
          "mt-0.5 size-4 shrink-0",
          TONE_COLOUR[record.tone],
          spinning && "animate-spin motion-reduce:animate-none",
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="text-sm text-foreground">
          {record.title}
          {record.count > 1 ? (
            <span className="ml-1.5 text-xs font-medium text-muted-foreground">
              ×{record.count}
            </span>
          ) : null}
        </div>
        {record.description ? (
          <div className="mt-0.5 break-words text-xs text-muted-foreground">
            {record.description}
          </div>
        ) : null}
        <div className="mt-0.5 font-mono text-xs text-muted-foreground">
          {formatRelativeTime(record.timestamp)}
        </div>
        {record.action ? (
          <Button
            variant="ghost"
            size="sm"
            className="mt-1 -ml-3 h-7 px-3"
            onClick={record.action.run}
          >
            {record.action.label}
          </Button>
        ) : null}
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="size-7 shrink-0 text-muted-foreground"
        aria-label="Dismiss notification"
        onClick={() => onDismiss(record.id)}
      >
        <X />
      </Button>
    </div>
  );
}

/**
 * M9 notification history: a right-side Sheet listing past notifications
 * newest first, each with a tone icon, title (with a "×N" dedupe count),
 * description, relative timestamp, optional action, and a dismiss control.
 * Unread rows get a subtle accent. Mirrors the ActivityDrawer shell.
 */
function NotificationCenter({
  open,
  onOpenChange,
  records,
  onDismiss,
  onClearAll,
}: NotificationCenterProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-[440px] max-w-[440px] flex-col gap-0 p-0"
      >
        <SheetHeader className="flex-row items-center justify-between gap-2 border-b border-border px-5 py-4">
          <SheetTitle>Notifications</SheetTitle>
          {records.length > 0 ? (
            <Button variant="ghost" size="sm" className="-mr-2" onClick={onClearAll}>
              Clear all
            </Button>
          ) : null}
        </SheetHeader>

        {records.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No notifications yet.
          </p>
        ) : (
          <ScrollArea className="min-h-0 flex-1">
            <div className="px-2 py-1">
              {records.map((record) => (
                <NotificationRow key={record.id} record={record} onDismiss={onDismiss} />
              ))}
            </div>
          </ScrollArea>
        )}
      </SheetContent>
    </Sheet>
  );
}

export { NotificationCenter, formatRelativeTime };
