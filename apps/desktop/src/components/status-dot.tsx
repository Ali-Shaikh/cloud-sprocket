import { cn } from "@/lib/utils";

export type Status = "on" | "off" | "error" | "warning";

const STATUS_COLOUR: Record<Status, string> = {
  on: "bg-[color:var(--success)]",
  off: "bg-muted-foreground",
  error: "bg-destructive",
  warning: "bg-[color:var(--warning)]",
};

const STATUS_RING: Record<Status, string> = {
  on: "ring-[color:var(--success)]/30",
  off: "ring-muted-foreground/30",
  error: "ring-destructive/30",
  warning: "ring-[color:var(--warning)]/30",
};

function StatusDot({
  status,
  pulse = false,
  ring = false,
  className,
  ...props
}: React.ComponentProps<"span"> & {
  status: Status;
  /** Animate with a soft pulse (useful for live / connecting states). */
  pulse?: boolean;
  /** Show a tinted ring around the dot. */
  ring?: boolean;
}) {
  return (
    <span
      data-slot="status-dot"
      data-status={status}
      className={cn(
        "inline-block size-2 shrink-0 rounded-full",
        STATUS_COLOUR[status],
        ring && cn("ring-2", STATUS_RING[status]),
        pulse && "animate-pulse",
        className,
      )}
      {...props}
    />
  );
}

export { StatusDot };
