// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { cn } from "@/lib/utils";
import { StatusDot, type Status } from "@/components/status-dot";

const STATUS_TINT: Record<Status, string> = {
  on: "bg-[color:var(--success)]/10 text-[color:var(--success)]",
  off: "bg-muted text-muted-foreground",
  error: "bg-destructive/10 text-destructive",
  warning: "bg-[color:var(--warning)]/10 text-[color:var(--warning)]",
};

function StatusPill({
  status,
  label,
  pulse = false,
  className,
  ...props
}: React.ComponentProps<"span"> & {
  status: Status;
  label: React.ReactNode;
  pulse?: boolean;
}) {
  return (
    <span
      data-slot="status-pill"
      data-status={status}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        STATUS_TINT[status],
        className,
      )}
      {...props}
    >
      <StatusDot status={status} pulse={pulse} />
      {label}
    </span>
  );
}

export { StatusPill };
