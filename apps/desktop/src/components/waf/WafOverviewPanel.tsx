// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AzureLogQueryResult, AzureWafLogSchemaProfile } from "@/types/backend";
import {
  buildWafOverviewQueries,
  mergeWafOverviewResults,
  type WafOverviewData,
} from "@/lib/waf-overview";

export type WafOverviewPanelProps = {
  workspace: string;
  policy: string;
  schema: AzureWafLogSchemaProfile;
  timespan: string;
  timeRangeLabel: string;
  disabled?: boolean;
  /** When false, overview queries are deferred until workspace/policy inventory is coherent. */
  ready?: boolean;
  /** Bumped when workspace, policy, timespan, or schema identity changes (debounced upstream). */
  refreshKey?: string;
  onRunQuery: (
    workspace: string,
    query: string,
    timespan: string,
    maxRows?: number,
  ) => Promise<AzureLogQueryResult>;
  onOpenBlocked?: () => void;
  onOpenRule?: (ruleName: string) => void;
};

const sectionCard = "space-y-3 rounded-lg border border-border bg-card p-[18px] shadow-sm";
const fieldLabel =
  "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

const OVERVIEW_MAX_ROWS = 12;

export function WafOverviewPanel({
  workspace,
  policy,
  schema,
  timespan,
  timeRangeLabel,
  disabled = false,
  ready = true,
  refreshKey = "",
  onRunQuery,
  onOpenBlocked,
  onOpenRule,
}: WafOverviewPanelProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<WafOverviewData | null>(null);
  const refreshTokenRef = useRef(0);

  const queries = useMemo(
    () =>
      buildWafOverviewQueries(schema, {
        policy: policy.trim() || undefined,
      }),
    [schema, policy],
  );

  async function refresh() {
    if (!workspace.trim() || disabled || !ready) {
      return;
    }
    const token = ++refreshTokenRef.current;
    setLoading(true);
    setError(null);
    const hadOverview = overview != null;
    try {
      const [actions, topRules, topBlockedIPs, blockedTotal] = await Promise.all([
        onRunQuery(workspace, queries.actions, timespan, OVERVIEW_MAX_ROWS),
        onRunQuery(workspace, queries.topRules, timespan, OVERVIEW_MAX_ROWS),
        onRunQuery(workspace, queries.topBlockedIPs, timespan, OVERVIEW_MAX_ROWS),
        onRunQuery(workspace, queries.blockedTotal, timespan, 1),
      ]);
      if (token !== refreshTokenRef.current) {
        return;
      }
      setOverview(
        mergeWafOverviewResults(actions, topRules, topBlockedIPs, blockedTotal, schema),
      );
    } catch (caught) {
      if (token !== refreshTokenRef.current) {
        return;
      }
      if (!hadOverview) {
        setOverview(null);
      }
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      if (token === refreshTokenRef.current) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    void refresh();
    return () => {
      refreshTokenRef.current += 1;
    };
  }, [refreshKey, disabled, ready, queries, workspace, timespan, onRunQuery, schema]);

  const actionHighlights = overview?.actions.slice(0, 4) ?? [];

  return (
    <section className={cn(sectionCard, disabled ? "opacity-60" : undefined)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold">Security overview</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {timeRangeLabel}
            {policy.trim() ? ` · policy ${policy}` : " · all policies"}
            {overview ? ` · ${overview.durationMs} ms` : ""}
          </p>
        </div>
        <Button variant="outline" size="sm" disabled={loading || disabled} onClick={() => void refresh()}>
          {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          Refresh
        </Button>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {loading && !overview ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading WAF aggregates…
        </div>
      ) : null}

      {overview ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <button
              type="button"
              className="rounded-lg border border-border bg-muted/20 p-3 text-left transition-colors hover:bg-muted/40"
              onClick={onOpenBlocked}
              disabled={!onOpenBlocked}
            >
              <div className={fieldLabel}>Blocked</div>
              <div className="mt-1 text-2xl font-bold tabular-nums">{overview.blockedTotal}</div>
            </button>
            {actionHighlights.map((entry) => (
              <div
                key={entry.label}
                className="rounded-lg border border-border bg-muted/20 p-3"
              >
                <div className={fieldLabel}>{entry.label}</div>
                <div className="mt-1 text-2xl font-bold tabular-nums">{entry.count}</div>
              </div>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold">Top rules</h3>
              {overview.topRules.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Rule</TableHead>
                      <TableHead className="text-right">Count</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {overview.topRules.map((entry) => (
                      <TableRow key={entry.label}>
                        <TableCell className="font-mono text-xs">
                          {onOpenRule ? (
                            <button
                              type="button"
                              className="text-left text-primary hover:underline"
                              onClick={() => onOpenRule(entry.label)}
                            >
                              {entry.label}
                            </button>
                          ) : (
                            entry.label
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{entry.count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">No rule activity in this range.</p>
              )}
            </div>

            <div>
              <h3 className="text-sm font-semibold">Top blocked client IPs</h3>
              {overview.topBlockedIPs.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Client IP</TableHead>
                      <TableHead className="text-right">Blocks</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {overview.topBlockedIPs.map((entry) => (
                      <TableRow key={entry.label}>
                        <TableCell className="font-mono text-xs">{entry.label}</TableCell>
                        <TableCell className="text-right tabular-nums">{entry.count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">No blocked clients in this range.</p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}