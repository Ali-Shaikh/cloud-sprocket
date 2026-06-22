// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Boxes,
  ChevronLeft,
  ChevronRight,
  DatabaseZap,
  RefreshCw,
  Search,
} from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { InlineBanner } from "@/components/inline-banner";
import { ProviderIcon } from "@/components/provider-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { backendRequest } from "@/lib/backend";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import type {
  IndexedResource,
  IndexedResourceFilter,
  IndexedResourceList,
  InventoryRun,
} from "@/types/backend";

const PAGE_SIZE = 25;

export interface ResourcesViewProps {
  currentScopeId?: string;
  currentWorkspaceLabel?: string;
}

function formatDate(value?: string): string {
  if (!value) return "Not yet indexed";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function titleCase(value: string): string {
  return value
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function statusVariant(status?: string): "outline" | "success" | "warning" | "destructive" {
  const value = status?.toLowerCase() ?? "";
  if (["running", "available", "active", "enabled", "succeeded", "completed"].some((item) => value.includes(item))) {
    return "success";
  }
  if (["failed", "error", "terminated", "deleted"].some((item) => value.includes(item))) {
    return "destructive";
  }
  if (["pending", "stopped", "disabled", "degraded"].some((item) => value.includes(item))) {
    return "warning";
  }
  return "outline";
}

function DetailList({ values }: { values?: Record<string, string> }) {
  const entries = Object.entries(values ?? {}).sort(([left], [right]) => left.localeCompare(right));
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">No values recorded.</p>;
  }
  return (
    <dl className="divide-y divide-border rounded-lg border border-border">
      {entries.map(([key, value]) => (
        <div key={key} className="grid grid-cols-[minmax(7rem,0.7fr)_minmax(0,1.3fr)] gap-3 px-3 py-2.5 text-sm">
          <dt className="font-medium text-muted-foreground">{titleCase(key)}</dt>
          <dd className="break-all text-foreground">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function ResourcesView({
  currentScopeId,
  currentWorkspaceLabel = "Open workspace",
}: ResourcesViewProps) {
  const [query, setQuery] = useState("");
  const [service, setService] = useState("");
  const [provider, setProvider] = useState("all");
  const [scope, setScope] = useState("all");
  const [includeStale, setIncludeStale] = useState(false);
  const [offset, setOffset] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const [result, setResult] = useState<IndexedResourceList>({
    resources: [],
    total: 0,
    limit: PAGE_SIZE,
    offset: 0,
  });
  const [runs, setRuns] = useState<InventoryRun[]>([]);
  const [selected, setSelected] = useState<IndexedResource>();
  const [loading, setLoading] = useState(true);
  const [indexing, setIndexing] = useState(false);
  const [error, setError] = useState("");
  const requestSequence = useRef(0);
  const debouncedQuery = useDebouncedValue(query, 250);
  const debouncedService = useDebouncedValue(service, 250);

  const filter = useMemo<IndexedResourceFilter>(
    () => ({
      scopeId: scope === "current" ? currentScopeId : undefined,
      provider: provider === "all" ? undefined : provider,
      service: debouncedService.trim() || undefined,
      query: debouncedQuery.trim() || undefined,
      includeStale,
      limit: PAGE_SIZE,
      offset,
    }),
    [currentScopeId, debouncedQuery, debouncedService, includeStale, offset, provider, scope],
  );

  const loadStatus = useCallback(async () => {
    const inventoryRuns = await backendRequest<InventoryRun[]>("inventory.status");
    setRuns(inventoryRuns);
  }, []);

  useEffect(() => {
    const requestId = ++requestSequence.current;
    setLoading(true);
    setError("");
    void Promise.all([
      backendRequest<IndexedResourceList>("resources.list", { ...filter }),
      backendRequest<InventoryRun[]>("inventory.status"),
    ])
      .then(([resources, inventoryRuns]) => {
        if (requestId !== requestSequence.current) return;
        setResult(resources);
        setRuns(inventoryRuns);
      })
      .catch((cause: unknown) => {
        if (requestId !== requestSequence.current) return;
        setError(cause instanceof Error ? cause.message : "Could not load indexed resources.");
      })
      .finally(() => {
        if (requestId === requestSequence.current) setLoading(false);
      });
  }, [filter, reloadKey]);

  const latestRun = useMemo(() => {
    if (scope === "current" && currentScopeId) {
      return runs.find((run) => run.scopeId === currentScopeId);
    }
    return [...runs].sort((left, right) => right.startedAt.localeCompare(left.startedAt))[0];
  }, [currentScopeId, runs, scope]);

  const pageStart = result.total === 0 ? 0 : result.offset + 1;
  const pageEnd = Math.min(result.offset + result.resources.length, result.total);
  const hasPrevious = result.offset > 0;
  const hasNext = result.nextOffset != null;

  function resetPage(): void {
    setOffset(0);
  }

  async function indexCurrentWorkspace(): Promise<void> {
    if (!currentScopeId) return;
    setIndexing(true);
    setError("");
    try {
      await backendRequest<InventoryRun>("inventory.refresh");
      await loadStatus();
      setScope("current");
      setOffset(0);
      setReloadKey((current) => current + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not index the open workspace.");
    } finally {
      setIndexing(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-start gap-4">
        <div>
          <h1 className="text-[1.375rem] font-[750] tracking-[-0.015em]">Resources</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Search the local resource index across cloud providers and workspaces.
          </p>
        </div>
        <Button className="ml-auto" onClick={() => void indexCurrentWorkspace()} disabled={!currentScopeId || indexing}>
          <RefreshCw className={indexing ? "animate-spin" : ""} />
          {indexing ? "Indexing..." : "Index open workspace"}
        </Button>
      </header>

      {error ? (
        <InlineBanner tone="destructive" title="Resource index unavailable" description={error} />
      ) : null}

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Matching resources</div>
          <div className="mt-2 text-2xl font-bold tracking-tight">{loading ? "..." : result.total.toLocaleString("en-GB")}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Indexed workspaces</div>
          <div className="mt-2 text-2xl font-bold tracking-tight">{runs.length.toLocaleString("en-GB")}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Last indexed</div>
          <div className="mt-2 truncate text-sm font-semibold">{formatDate(latestRun?.completedAt ?? latestRun?.startedAt)}</div>
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <div className="grid gap-3 border-b border-border p-4 lg:grid-cols-[minmax(14rem,1.5fr)_minmax(10rem,0.8fr)_minmax(10rem,0.8fr)_minmax(11rem,0.9fr)_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                resetPage();
              }}
              placeholder="Search names, IDs and tags"
              aria-label="Search resources"
              className="pl-9"
            />
          </div>
          <Input
            value={service}
            onChange={(event) => {
              setService(event.target.value);
              resetPage();
            }}
            placeholder="Service, for example ec2"
            aria-label="Filter by service"
          />
          <Select value={provider} onValueChange={(value) => { setProvider(value); resetPage(); }}>
            <SelectTrigger aria-label="Filter by provider"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All providers</SelectItem>
              <SelectItem value="aws">AWS</SelectItem>
              <SelectItem value="azure">Microsoft Azure</SelectItem>
              <SelectItem value="gcp">Google Cloud</SelectItem>
            </SelectContent>
          </Select>
          <Select value={scope} onValueChange={(value) => { setScope(value); resetPage(); }}>
            <SelectTrigger aria-label="Filter by workspace"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All indexed workspaces</SelectItem>
              {currentScopeId ? <SelectItem value="current">{currentWorkspaceLabel}</SelectItem> : null}
            </SelectContent>
          </Select>
          <label className="flex h-9 items-center justify-between gap-3 whitespace-nowrap rounded-md border border-input px-3 text-sm">
            Include stale
            <Switch checked={includeStale} onCheckedChange={(checked) => { setIncludeStale(checked); resetPage(); }} />
          </label>
        </div>

        {loading ? (
          <div className="grid min-h-72 place-items-center text-sm text-muted-foreground">
            <span className="flex items-center gap-2"><RefreshCw className="size-4 animate-spin" /> Loading resource index...</span>
          </div>
        ) : result.resources.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={runs.length === 0 ? <DatabaseZap /> : <Boxes />}
              title={runs.length === 0 ? "No workspace has been indexed" : "No resources match these filters"}
              description={runs.length === 0 ? "Build a local index from the open workspace to make its resources searchable." : "Change the search or filters to broaden the result set."}
              action={runs.length === 0 && currentScopeId ? <Button onClick={() => void indexCurrentWorkspace()}>Index open workspace</Button> : undefined}
            />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Resource</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>Region</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Workspace</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.resources.map((resource) => (
                <TableRow key={`${resource.scopeId}:${resource.id}`} className="cursor-pointer" onClick={() => setSelected(resource)}>
                  <TableCell>
                    <button type="button" className="max-w-[24rem] text-left" onClick={() => setSelected(resource)}>
                      <span className="block truncate font-semibold text-foreground">{resource.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{titleCase(resource.type)}</span>
                    </button>
                  </TableCell>
                  <TableCell><span className="flex items-center gap-2"><ProviderIcon provider={resource.provider} size={18} />{resource.provider.toUpperCase()}</span></TableCell>
                  <TableCell>{resource.service}</TableCell>
                  <TableCell>{resource.region || "Global"}</TableCell>
                  <TableCell>
                    <span className="flex flex-wrap gap-1">
                      {resource.status ? <Badge variant={statusVariant(resource.status)}>{resource.status}</Badge> : <span className="text-muted-foreground">Unknown</span>}
                      {resource.stale ? <Badge variant="warning">Stale</Badge> : null}
                    </span>
                  </TableCell>
                  <TableCell><span className="font-mono text-xs text-muted-foreground">{resource.scopeId}</span></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <div className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-3 text-sm text-muted-foreground">
          <span>{pageStart.toLocaleString("en-GB")} to {pageEnd.toLocaleString("en-GB")} of {result.total.toLocaleString("en-GB")}</span>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" disabled={!hasPrevious || loading} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
              <ChevronLeft /> Previous
            </Button>
            <Button variant="outline" size="sm" disabled={!hasNext || loading} onClick={() => setOffset(result.nextOffset ?? offset)}>
              Next <ChevronRight />
            </Button>
          </div>
        </div>
      </section>

      <Sheet open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(undefined); }}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          {selected ? (
            <>
              <SheetHeader>
                <div className="mb-2 flex items-center gap-3">
                  <div className="grid size-10 place-items-center rounded-lg bg-muted"><ProviderIcon provider={selected.provider} size={24} /></div>
                  <div className="min-w-0">
                    <SheetTitle className="truncate">{selected.name}</SheetTitle>
                    <SheetDescription>{titleCase(selected.type)} in {selected.service}</SheetDescription>
                  </div>
                </div>
              </SheetHeader>
              <div className="space-y-6">
                <section className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Identity</h3>
                  <DetailList values={{ provider: selected.provider, workspace: selected.scopeId, account: selected.accountId, region: selected.region || "Global", resourceId: selected.id, sourceReference: selected.sourceRef ?? "" }} />
                </section>
                <section className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Attributes</h3>
                  <DetailList values={selected.attributes} />
                </section>
                <section className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tags</h3>
                  <DetailList values={selected.tags} />
                </section>
                <p className="text-xs text-muted-foreground">Last seen {formatDate(selected.lastSeenAt)}</p>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
