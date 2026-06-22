// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useCallback, useEffect, useMemo, useState } from "react";
import { Boxes, Cloud, DatabaseZap, Globe2, Layers3, RefreshCw, Server } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { InlineBanner } from "@/components/inline-banner";
import { ProviderIcon } from "@/components/provider-icon";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { backendRequest } from "@/lib/backend";
import type { CloudOverview, InventoryRun, OverviewDimension } from "@/types/backend";

export interface CloudOverviewViewProps {
  canIndexCurrentWorkspace: boolean;
  onOpenResources: () => void;
}

function titleCase(value: string): string {
  if (value === "global") return "Global";
  return value
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDate(value?: string): string {
  if (!value) return "Incomplete";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function freshness(run: InventoryRun): { label: string; variant: "success" | "warning" | "destructive" } {
  const timestamp = new Date(run.completedAt ?? run.startedAt).getTime();
  const age = Date.now() - timestamp;
  if (!Number.isFinite(timestamp) || run.status !== "completed") return { label: "Needs attention", variant: "destructive" };
  if (age <= 24 * 60 * 60 * 1000) return { label: "Current", variant: "success" };
  if (age <= 7 * 24 * 60 * 60 * 1000) return { label: "Ageing", variant: "warning" };
  return { label: "Stale", variant: "destructive" };
}

function DistributionList({ items, emptyLabel }: { items: OverviewDimension[]; emptyLabel: string }) {
  const maximum = Math.max(...items.map((item) => item.count), 1);
  if (items.length === 0) return <p className="py-8 text-center text-sm text-muted-foreground">{emptyLabel}</p>;
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.key} className="grid grid-cols-[minmax(7rem,0.7fr)_minmax(7rem,1.3fr)_3rem] items-center gap-3">
          <span className="truncate text-sm font-medium" title={item.key}>{titleCase(item.key)}</span>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(5, (item.count / maximum) * 100)}%` }} />
          </div>
          <span className="text-right text-sm font-semibold tabular-nums">{item.count.toLocaleString("en-GB")}</span>
        </div>
      ))}
    </div>
  );
}

export default function CloudOverviewView({ canIndexCurrentWorkspace, onOpenResources }: CloudOverviewViewProps) {
  const [overview, setOverview] = useState<CloudOverview>();
  const [loading, setLoading] = useState(true);
  const [indexing, setIndexing] = useState(false);
  const [error, setError] = useState("");

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setOverview(await backendRequest<CloudOverview>("overview.get"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load the cloud overview.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  async function indexCurrentWorkspace(): Promise<void> {
    setIndexing(true);
    setError("");
    try {
      await backendRequest<InventoryRun>("inventory.refresh");
      await loadOverview();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not index the open workspace.");
    } finally {
      setIndexing(false);
    }
  }

  const providerTotal = overview?.providers.length ?? 0;
  const indexedTotal = overview?.resourceCount ?? 0;
  const providerShare = useMemo(
    () => (overview?.providers ?? []).map((provider) => ({
      ...provider,
      percentage: indexedTotal === 0 ? 0 : Math.round((provider.count / indexedTotal) * 100),
    })),
    [indexedTotal, overview?.providers],
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-start gap-4">
        <div>
          <h1 className="text-[1.375rem] font-[750] tracking-[-0.015em]">Cloud overview</h1>
          <p className="mt-1 text-sm text-muted-foreground">A provider-neutral view of everything indexed by CloudSprocket.</p>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="outline" onClick={onOpenResources}><Boxes /> Explore resources</Button>
          <Button onClick={() => void indexCurrentWorkspace()} disabled={!canIndexCurrentWorkspace || indexing}>
            <RefreshCw className={indexing ? "animate-spin" : ""} />
            {indexing ? "Indexing..." : "Index open workspace"}
          </Button>
        </div>
      </header>

      {error ? <InlineBanner tone="destructive" title="Cloud overview unavailable" description={error} action={{ label: "Retry", onClick: () => void loadOverview() }} /> : null}

      {loading && !overview ? (
        <div className="grid min-h-80 place-items-center text-sm text-muted-foreground"><span className="flex items-center gap-2"><RefreshCw className="size-4 animate-spin" /> Loading cloud overview...</span></div>
      ) : !overview || overview.resourceCount === 0 ? (
        <EmptyState
          icon={<DatabaseZap />}
          title="Your cloud index is empty"
          description="Index the open workspace to populate provider totals, service distribution and inventory freshness."
          action={canIndexCurrentWorkspace ? <Button onClick={() => void indexCurrentWorkspace()}>Index open workspace</Button> : undefined}
        />
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Current resources" value={overview.resourceCount.toLocaleString("en-GB")} icon={<Boxes className="size-4" />} footer="Searchable local records" />
            <StatCard label="Indexed workspaces" value={overview.workspaceCount.toLocaleString("en-GB")} icon={<Server className="size-4" />} footer="Provider profile scopes" />
            <StatCard label="Cloud providers" value={providerTotal.toLocaleString("en-GB")} icon={<Cloud className="size-4" />} footer="Represented in the index" />
            <StatCard label="Stale records" value={overview.staleResourceCount.toLocaleString("en-GB")} icon={<RefreshCw className="size-4" />} footer="Retained for change tracking" />
          </section>

          <section className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
            <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
              <div className="mb-5 flex items-center gap-2"><Cloud className="size-4 text-muted-foreground" /><h2 className="text-sm font-semibold">Provider footprint</h2></div>
              <div className="space-y-3">
                {providerShare.map((provider) => (
                  <div key={provider.key} className="flex items-center gap-3 rounded-lg border border-border p-3">
                    <div className="grid size-10 place-items-center rounded-lg bg-muted"><ProviderIcon provider={provider.key} size={24} /></div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">{provider.key.toUpperCase()}</div>
                      <div className="text-xs text-muted-foreground">{provider.percentage}% of indexed resources</div>
                    </div>
                    <div className="text-xl font-bold tabular-nums">{provider.count.toLocaleString("en-GB")}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
              <div className="mb-5 flex items-center gap-2"><Layers3 className="size-4 text-muted-foreground" /><h2 className="text-sm font-semibold">Services</h2></div>
              <DistributionList items={overview.services.slice(0, 10)} emptyLabel="No services indexed." />
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-[0.7fr_1.3fr]">
            <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
              <div className="mb-5 flex items-center gap-2"><Globe2 className="size-4 text-muted-foreground" /><h2 className="text-sm font-semibold">Regional footprint</h2></div>
              <DistributionList items={overview.regions.slice(0, 10)} emptyLabel="No regions indexed." />
            </div>
            <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
              <div className="border-b border-border px-5 py-4">
                <h2 className="text-sm font-semibold">Inventory freshness</h2>
                <p className="mt-1 text-xs text-muted-foreground">Latest completed index run for each workspace.</p>
              </div>
              <Table>
                <TableHeader><TableRow><TableHead>Workspace</TableHead><TableHead>Provider</TableHead><TableHead>Resources</TableHead><TableHead>Last indexed</TableHead><TableHead>Freshness</TableHead></TableRow></TableHeader>
                <TableBody>
                  {overview.inventoryRuns.map((run) => {
                    const state = freshness(run);
                    return (
                      <TableRow key={run.scopeId}>
                        <TableCell><div className="font-semibold">{run.profileId}</div><div className="font-mono text-xs text-muted-foreground">{run.scopeId}</div></TableCell>
                        <TableCell><span className="flex items-center gap-2"><ProviderIcon provider={run.provider} size={18} />{run.provider.toUpperCase()}</span></TableCell>
                        <TableCell className="font-semibold tabular-nums">{run.resourceCount.toLocaleString("en-GB")}</TableCell>
                        <TableCell className="text-muted-foreground">{formatDate(run.completedAt ?? run.startedAt)}</TableCell>
                        <TableCell><Badge variant={state.variant}>{state.label}</Badge></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
