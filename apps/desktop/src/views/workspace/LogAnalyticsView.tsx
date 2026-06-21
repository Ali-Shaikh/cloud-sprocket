import { useMemo, useState } from "react";
import { Loader2, Play } from "lucide-react";

import { cn } from "@/lib/utils";
import { LogQueryResultPanel } from "@/components/log-analytics/LogQueryResultPanel";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusPill } from "@/components/status-pill";
import type { AzureLogQueryResult, WorkspaceSnapshot } from "@/types/backend";

export type LogAnalyticsViewProps = {
  workspace: WorkspaceSnapshot;
  workspaceSelectionLoading?: boolean;
  onSelectWorkspace: (workspace: string) => void;
  onRunQuery: (
    workspace: string,
    query: string,
    timespan: string,
  ) => Promise<AzureLogQueryResult>;
};

const fieldLabel =
  "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";
const sectionCard = "space-y-4 rounded-lg border border-border bg-card p-[18px] shadow-sm";

const SAMPLE_QUERY = "AppEvents\n| take 50";

// Timespan presets map to the ISO8601 durations az -t / the Logs API accept.
// "all" sends no timespan, so the query's own time filters (or full retention)
// apply, matching the panel's original behaviour.
const TIMESPAN_OPTIONS = [
  { label: "All time", value: "all", timespan: "" },
  { label: "Last 30 minutes", value: "PT30M", timespan: "PT30M" },
  { label: "Last hour", value: "PT1H", timespan: "PT1H" },
  { label: "Last 24 hours", value: "P1D", timespan: "P1D" },
  { label: "Last 7 days", value: "P7D", timespan: "P7D" },
  { label: "Last 30 days", value: "P30D", timespan: "P30D" },
] as const;

export default function LogAnalyticsView({
  workspace,
  workspaceSelectionLoading = false,
  onSelectWorkspace,
  onRunQuery,
}: LogAnalyticsViewProps) {
  const workspaces = workspace.azureLogAnalyticsWorkspaces ?? [];
  const selected = workspace.selectedAzureLogWorkspace ?? workspaces[0]?.name ?? "";
  const [query, setQuery] = useState(SAMPLE_QUERY);
  const [timespanValue, setTimespanValue] = useState<string>(TIMESPAN_OPTIONS[0].value);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AzureLogQueryResult | null>(null);

  const timeRangeLabel = useMemo(
    () => TIMESPAN_OPTIONS.find((option) => option.value === timespanValue)?.label ?? "All time",
    [timespanValue],
  );

  const canRun = selected.trim() !== "" && query.trim() !== "" && !running;

  async function run() {
    if (!canRun) return;
    setRunning(true);
    setError(null);
    try {
      const timespan =
        TIMESPAN_OPTIONS.find((option) => option.value === timespanValue)?.timespan ?? "";
      const queryResult = await onRunQuery(selected, query, timespan);
      setResult(queryResult);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setResult(null);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-[1.375rem] font-[750] tracking-[-0.015em]">Log Analytics</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {workspace.profile?.displayName || "Subscription"} · KQL query
        </p>
      </header>

      <section className={sectionCard}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-72">
            <div className={cn(fieldLabel, "mb-1")}>Workspace</div>
            <Select
              value={selected}
              disabled={workspaceSelectionLoading}
              onValueChange={(value) => {
                if (value) onSelectWorkspace(value);
              }}
            >
              <SelectTrigger aria-label="Select Log Analytics workspace">
                <SelectValue placeholder="Select workspace" />
              </SelectTrigger>
              <SelectContent>
                {workspaces.map((ws) => (
                  <SelectItem key={ws.customerId || ws.name} value={ws.name}>
                    {ws.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {workspaceSelectionLoading ? (
              <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground" role="status">
                <Loader2 className="size-3.5 animate-spin" />
                Switching workspace...
              </p>
            ) : null}
          </div>
          <div className="w-48">
            <div className={cn(fieldLabel, "mb-1")}>Time range</div>
            <Select value={timespanValue} onValueChange={setTimespanValue}>
              <SelectTrigger aria-label="Select query time range">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMESPAN_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => void run()} disabled={!canRun}>
            {running ? <Loader2 className="animate-spin" /> : <Play />}
            {running ? "Running…" : "Run query"}
          </Button>
        </div>

        <div>
          <div className={cn(fieldLabel, "mb-1")}>KQL query</div>
          <textarea
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            spellCheck={false}
            rows={6}
            aria-label="KQL query"
            className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="AppEvents | take 50"
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">{workspace.azureLogAnalyticsStatusMessage}</p>
          <StatusPill status="warning" label="Local KQL is a subset" />
        </div>
      </section>

      <LogQueryResultPanel
        result={result}
        error={error}
        timeRangeLabel={timeRangeLabel}
      />
    </div>
  );
}