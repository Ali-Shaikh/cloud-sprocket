import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatusDot } from "@/components/status-dot";
import type { ActivityEntry } from "@/components/shell/types";

export type ActivityViewProps = {
  /** Most recent entries first; the caller decides how many to show. */
  entries: ActivityEntry[];
  onRefreshDiscovery: () => void;
};

/**
 * M7 Activity: Tailwind replacement for the Cloudscape "actions" tab. The
 * backend log stream and recent job history for the open workspace.
 */
export default function ActivityView({ entries, onRefreshDiscovery }: ActivityViewProps) {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex items-start gap-4">
        <div>
          <h1 className="text-[1.375rem] font-[750] tracking-[-0.015em]">Activity</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Backend log stream and recent job history for the open workspace.
          </p>
        </div>
        <Button variant="outline" size="sm" className="ml-auto" onClick={onRefreshDiscovery}>
          <RefreshCw />
          Refresh Discovery
        </Button>
      </header>

      <section className="rounded-lg border border-border bg-card p-2 shadow-sm">
        {entries.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No activity recorded yet.
          </p>
        ) : (
          entries.map((entry) => (
            <div
              key={entry.id}
              className="flex gap-3 border-b border-border px-3 py-3 last:border-0"
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
      </section>
    </div>
  );
}
