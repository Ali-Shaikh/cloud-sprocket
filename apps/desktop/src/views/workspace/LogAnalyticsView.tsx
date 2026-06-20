import { useState } from "react";
import { Play, Table2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { StatusPill } from "@/components/status-pill";
import type { AzureLogQueryResult, WorkspaceSnapshot } from "@/types/backend";

export type LogAnalyticsViewProps = {
  workspace: WorkspaceSnapshot;
  onSelectWorkspace: (workspace: string) => void;
  onRunQuery: (workspace: string, query: string) => Promise<AzureLogQueryResult>;
};

const fieldLabel =
  "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";
const sectionCard = "space-y-4 rounded-lg border border-border bg-card p-[18px] shadow-sm";

const SAMPLE_QUERY = "AppEvents\n| take 50";

export default function LogAnalyticsView({
  workspace,
  onSelectWorkspace,
  onRunQuery,
}: LogAnalyticsViewProps) {
  const workspaces = workspace.azureLogAnalyticsWorkspaces ?? [];
  const selected = workspace.selectedAzureLogWorkspace ?? workspaces[0]?.name ?? "";
  const [query, setQuery] = useState(SAMPLE_QUERY);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AzureLogQueryResult | null>(null);

  const canRun = selected.trim() !== "" && query.trim() !== "" && !running;

  async function run() {
    if (!canRun) return;
    setRunning(true);
    setError(null);
    try {
      const queryResult = await onRunQuery(selected, query);
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
          </div>
          <Button onClick={() => void run()} disabled={!canRun}>
            <Play />
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
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </section>

      <section className={sectionCard}>
        <h2 className="text-base font-bold">Results</h2>
        <div className="overflow-auto rounded-lg border border-border">
          {result && result.columns.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  {result.columns.map((column) => (
                    <TableHead key={column}>{column}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.rows.map((row, rowIndex) => (
                  <TableRow key={rowIndex}>
                    {row.map((cell, cellIndex) => (
                      <TableCell
                        key={cellIndex}
                        className="max-w-[320px] truncate font-mono text-xs"
                      >
                        {cell}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState
              icon={<Table2 />}
              title={result ? "No rows" : "No results yet"}
              description={
                result
                  ? "The query ran but returned no rows."
                  : "Run a KQL query to see results here."
              }
              className="border-0"
            />
          )}
        </div>
        {result && result.rows.length > 0 ? (
          <p className="text-xs text-muted-foreground">{result.rows.length} row(s).</p>
        ) : null}
      </section>
    </div>
  );
}
