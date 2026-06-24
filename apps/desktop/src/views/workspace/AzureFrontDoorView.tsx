// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useEffect, useMemo, useRef, useState } from "react";
import { Eraser, ExternalLink, Globe, Network, Play, RotateCw, Shield } from "lucide-react";

import { KqlEditor } from "@/components/kql/KqlEditor";
import { LogQueryResultPanel } from "@/components/log-analytics/LogQueryResultPanel";
import { EmptyState } from "@/components/empty-state";
import { InventoryLoadingState } from "@/components/inventory-loading-state";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusPill } from "@/components/status-pill";
import { cn } from "@/lib/utils";
import { AFD_CURATED_QUERIES } from "@/lib/afd-curated-queries";
import {
  buildAfdAccessFilteredQuery,
  buildAfdTrackingReferenceSearchQuery,
  type AfdAccessLogFilters,
  type AfdAccessLogMode,
} from "@/lib/afd-kql";
import type { AzureLogQueryResult, WorkspaceSnapshot } from "@/types/backend";

export type AzureFrontDoorViewProps = {
  workspace: WorkspaceSnapshot;
  inventoryLoading?: boolean;
  actionStatus?: string;
  onRefresh: () => void;
  onSelectProfile: (profile: string) => void;
  onSelectEndpoint: (endpoint: string) => void;
  onSelectOriginGroup: (originGroup: string) => void;
  onPurgeCache: (
    profileName: string,
    endpointName: string,
    contentPaths: string[],
    domains: string[],
  ) => void;
  onOpenWafPolicy: (policyName: string) => void;
  onEditInLogAnalytics: (workspace: string, query: string, timespan: string) => void;
  onRunQuery: (
    workspace: string,
    query: string,
    timespan: string,
  ) => Promise<AzureLogQueryResult>;
  initialTrackingReference?: string;
  initialLogWorkspace?: string;
  initialTimespan?: string;
};

const fieldLabel =
  "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";
const sectionCard = "space-y-4 rounded-lg border border-border bg-card p-[18px] shadow-sm";

function enabledStatus(state?: string): "on" | "off" | "warning" {
  const normalised = (state ?? "").toLowerCase();
  if (normalised === "enabled") {
    return "on";
  }
  if (normalised === "disabled") {
    return "warning";
  }
  return "off";
}

export default function AzureFrontDoorView({
  workspace,
  inventoryLoading = false,
  actionStatus,
  onRefresh,
  onSelectProfile,
  onSelectEndpoint,
  onSelectOriginGroup,
  onPurgeCache,
  onOpenWafPolicy,
  onEditInLogAnalytics,
  onRunQuery,
  initialTrackingReference,
  initialLogWorkspace,
  initialTimespan,
}: AzureFrontDoorViewProps) {
  const canWrite = workspace.azureWritesEnabled;
  const profiles = workspace.azureFrontDoorProfiles ?? [];
  const endpoints = workspace.azureFrontDoorEndpoints ?? [];
  const originGroups = workspace.azureFrontDoorOriginGroups ?? [];
  const origins = workspace.azureFrontDoorOrigins ?? [];
  const logWorkspaces = workspace.azureLogAnalyticsWorkspaces ?? [];

  const profileName =
    workspace.selectedAzureFrontDoorProfile ?? profiles[0]?.name ?? "";
  const selectedProfile = profiles.find((item) => item.name === profileName);
  const endpointName = workspace.selectedAzureFrontDoorEndpoint ?? "";
  const originGroupName = workspace.selectedAzureFrontDoorOriginGroup ?? "";

  const [logWorkspace, setLogWorkspace] = useState(
    workspace.selectedAzureLogWorkspace ?? logWorkspaces[0]?.name ?? "",
  );
  const [logMode, setLogMode] = useState<AfdAccessLogMode>("azureDiagnostics");
  const [logTable, setLogTable] = useState("AzureDiagnostics");
  const [timespan, setTimespan] = useState("P1D");
  const [query, setQuery] = useState(() =>
    buildAfdAccessFilteredQuery("azureDiagnostics", "AzureDiagnostics"),
  );
  const [filters, setFilters] = useState<AfdAccessLogFilters>({});
  const [queryResult, setQueryResult] = useState<AzureLogQueryResult | null>(null);
  const [queryRunning, setQueryRunning] = useState(false);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [purgeEndpoint, setPurgeEndpoint] = useState<string | null>(null);
  const [purgePaths, setPurgePaths] = useState("/*");
  const [purgeDomains, setPurgeDomains] = useState("");
  const [activeTab, setActiveTab] = useState("topology");
  const prefillTokenRef = useRef(0);

  const curatedQueries = useMemo(() => AFD_CURATED_QUERIES, []);

  useEffect(() => {
    const trackingReference = initialTrackingReference?.trim();
    if (!trackingReference) {
      return;
    }
    const token = ++prefillTokenRef.current;
    setActiveTab("access-logs");
    if (initialLogWorkspace?.trim()) {
      setLogWorkspace(initialLogWorkspace.trim());
    }
    if (initialTimespan?.trim()) {
      setTimespan(initialTimespan.trim());
    }
    const nextFilters: AfdAccessLogFilters = { trackingReference };
    setFilters(nextFilters);
    const nextQuery = buildAfdTrackingReferenceSearchQuery(logMode, logTable, trackingReference);
    setQuery(nextQuery);
    const workspaceName = (initialLogWorkspace?.trim() || logWorkspace).trim();
    if (!workspaceName) {
      return;
    }
    void onRunQuery(workspaceName, nextQuery, initialTimespan?.trim() || timespan)
      .then((result) => {
        if (token !== prefillTokenRef.current) {
          return;
        }
        setQueryResult(result);
        setQueryError(null);
      })
      .catch((error) => {
        if (token !== prefillTokenRef.current) {
          return;
        }
        setQueryError(error instanceof Error ? error.message : "Query failed.");
        setQueryResult(null);
      });
  }, [initialTrackingReference, initialLogWorkspace, initialTimespan]);

  const topologyLoadingLabel =
    inventoryLoading && profiles.length > 0
      ? "Refreshing Front Door topology..."
      : workspace.azureFrontDoorStatusMessage || "Loading Front Door topology...";
  const showFullTopologyLoader =
    inventoryLoading && endpoints.length === 0 && originGroups.length === 0;

  async function runQuery(nextQuery = query): Promise<void> {
    const workspaceName = logWorkspace.trim();
    if (!workspaceName) {
      setQueryError("Select a Log Analytics workspace first.");
      return;
    }
    setQueryRunning(true);
    setQueryError(null);
    try {
      const result = await onRunQuery(workspaceName, nextQuery, timespan);
      setQueryResult(result);
    } catch (error) {
      setQueryError(error instanceof Error ? error.message : "Query failed.");
      setQueryResult(null);
    } finally {
      setQueryRunning(false);
    }
  }

  function applyCurated(build: (mode: AfdAccessLogMode, tableName: string, filters?: AfdAccessLogFilters) => string): void {
    const nextQuery = build(logMode, logTable, filters);
    setQuery(nextQuery);
    void runQuery(nextQuery);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-[1.375rem] font-[750] tracking-[-0.015em]">Front Door</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {workspace.profile?.displayName || "Subscription"} · profile topology and access logs
        </p>
      </header>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="topology">Topology</TabsTrigger>
          <TabsTrigger value="access-logs">Access logs</TabsTrigger>
        </TabsList>

        <TabsContent value="topology" className="space-y-6">
          {inventoryLoading ? (
            <InventoryLoadingState variant="banner" label={topologyLoadingLabel} />
          ) : null}

          <section className={sectionCard}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-wrap items-end gap-3">
              <div className="w-72">
                <div className={cn(fieldLabel, "mb-1")}>Profile</div>
                <Select
                  value={profileName}
                  disabled={inventoryLoading}
                  onValueChange={(value) => value && onSelectProfile(value)}
                >
                  <SelectTrigger aria-label="Select Front Door profile">
                    <SelectValue placeholder="Select profile" />
                  </SelectTrigger>
                  <SelectContent>
                    {profiles.map((item) => (
                      <SelectItem key={item.name} value={item.name}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedProfile?.wafPolicyName ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => onOpenWafPolicy(selectedProfile.wafPolicyName!)}
                >
                  <Shield className="h-4 w-4" />
                  Open WAF policy · {selectedProfile.wafPolicyName}
                </Button>
              ) : null}
              </div>
              <Button variant="outline" size="sm" disabled={inventoryLoading} onClick={onRefresh}>
                <RotateCw />
                Refresh topology
              </Button>
            </div>
            {selectedProfile ? (
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span>SKU {selectedProfile.sku || "—"}</span>
                <span>RG {selectedProfile.resourceGroup || "—"}</span>
                <span>{selectedProfile.location || "Global"}</span>
              </div>
            ) : null}
            {!inventoryLoading ? (
              <p className="text-sm text-muted-foreground">{workspace.azureFrontDoorStatusMessage}</p>
            ) : null}
            {actionStatus ? <p className="text-sm text-muted-foreground">{actionStatus}</p> : null}
          </section>

          {profiles.length === 0 && !inventoryLoading ? (
            <EmptyState
              icon={<Network />}
              title="No Front Door profiles"
              description="Ensure the Azure CLI front-door extension is installed and this subscription has AFD Standard or Premium profiles."
            />
          ) : null}

          {showFullTopologyLoader ? (
            <section className={sectionCard}>
              <InventoryLoadingState
                variant="panel"
                label={`${topologyLoadingLabel} This can take a few seconds while endpoints, origin groups, and origins are loaded from Azure.`}
              />
            </section>
          ) : (
            <>
          <section className={cn(sectionCard, inventoryLoading ? "opacity-60" : undefined)}>
            <h2 className="text-base font-bold">Endpoints</h2>
            <div className="overflow-hidden rounded-lg border border-border">
              {endpoints.length === 0 ? (
                <EmptyState
                  icon={<Globe />}
                  title="No endpoints"
                  description="Select a profile with endpoints to browse."
                  className="border-0"
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Hostname</TableHead>
                      <TableHead>State</TableHead>
                      {canWrite ? <TableHead className="w-[120px]">Actions</TableHead> : null}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {endpoints.map((item) => (
                      <TableRow
                        key={item.name}
                        data-state={item.name === endpointName ? "selected" : undefined}
                        className="cursor-pointer"
                        onClick={() => onSelectEndpoint(item.name)}
                      >
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell className="font-mono text-xs">{item.hostName || "—"}</TableCell>
                        <TableCell>
                          <StatusPill status={enabledStatus(item.enabledState)} label={item.enabledState || "Unknown"} />
                        </TableCell>
                        {canWrite ? (
                          <TableCell>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={inventoryLoading}
                              onClick={(event) => {
                                event.stopPropagation();
                                setPurgePaths("/*");
                                setPurgeDomains(item.hostName ?? "");
                                setPurgeEndpoint(item.name);
                              }}
                            >
                              <Eraser />
                              Purge cache
                            </Button>
                          </TableCell>
                        ) : null}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </section>

          <section className={cn(sectionCard, inventoryLoading ? "opacity-60" : undefined)}>
            <div className="flex flex-wrap items-end gap-3">
              <h2 className="text-base font-bold">Origin groups</h2>
            </div>
            <div className="overflow-hidden rounded-lg border border-border">
              {originGroups.length === 0 ? (
                <EmptyState
                  icon={<Network />}
                  title="No origin groups"
                  description="Select a profile with origin groups to browse."
                  className="border-0"
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Health probe</TableHead>
                      <TableHead>Load balancing</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {originGroups.map((item) => (
                      <TableRow
                        key={item.name}
                        data-state={item.name === originGroupName ? "selected" : undefined}
                        className="cursor-pointer"
                        onClick={() => onSelectOriginGroup(item.name)}
                      >
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell className="font-mono text-xs">{item.healthProbe || "—"}</TableCell>
                        <TableCell className="text-xs">{item.loadBalancing || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </section>

          <section className={cn(sectionCard, inventoryLoading ? "opacity-60" : undefined)}>
            <h2 className="text-base font-bold">
              Origins{originGroupName ? ` · ${originGroupName}` : ""}
            </h2>
            {origins.length === 0 ? (
              <EmptyState
                icon={<Network />}
                title="No origins"
                description="Select an origin group to list its origins."
                className="border-0"
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Host</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Weight</TableHead>
                    <TableHead>State</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {origins.map((item) => (
                    <TableRow key={item.name}>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell className="font-mono text-xs">{item.hostName || "—"}</TableCell>
                      <TableCell>{item.priority ?? "—"}</TableCell>
                      <TableCell>{item.weight ?? "—"}</TableCell>
                      <TableCell>
                        <StatusPill status={enabledStatus(item.enabledState)} label={item.enabledState || "Unknown"} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </section>
            </>
          )}
        </TabsContent>

        <TabsContent value="access-logs" className="space-y-6">
          <section className={sectionCard}>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <div>
                <div className={cn(fieldLabel, "mb-1")}>Log Analytics workspace</div>
                <Select value={logWorkspace} onValueChange={(value) => value && setLogWorkspace(value)}>
                  <SelectTrigger aria-label="Select Log Analytics workspace">
                    <SelectValue placeholder="Workspace" />
                  </SelectTrigger>
                  <SelectContent>
                    {logWorkspaces.map((item) => (
                      <SelectItem key={item.name} value={item.name}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <div className={cn(fieldLabel, "mb-1")}>Log mode</div>
                <Select
                  value={logMode}
                  onValueChange={(value) => {
                    const mode = value as AfdAccessLogMode;
                    const table = mode === "azureDiagnostics" ? "AzureDiagnostics" : "AFDAccessLogs";
                    setLogMode(mode);
                    setLogTable(table);
                    setQuery(buildAfdAccessFilteredQuery(mode, table, filters));
                  }}
                >
                  <SelectTrigger aria-label="Select access log mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="azureDiagnostics">AzureDiagnostics</SelectItem>
                    <SelectItem value="resourceSpecific">Resource-specific (AFDAccessLogs)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <div className={cn(fieldLabel, "mb-1")}>Table</div>
                <Input value={logTable} onChange={(event) => setLogTable(event.target.value)} />
              </div>
              <div>
                <div className={cn(fieldLabel, "mb-1")}>Timespan</div>
                <Input value={timespan} onChange={(event) => setTimespan(event.target.value)} />
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <Input
                placeholder="Host filter"
                value={filters.host ?? ""}
                onChange={(event) => setFilters((current) => ({ ...current, host: event.target.value }))}
              />
              <Input
                placeholder="Client IP"
                value={filters.clientIP ?? ""}
                onChange={(event) => setFilters((current) => ({ ...current, clientIP: event.target.value }))}
              />
              <Input
                placeholder="HTTP status"
                value={filters.httpStatus ?? ""}
                onChange={(event) => setFilters((current) => ({ ...current, httpStatus: event.target.value }))}
              />
              <Input
                placeholder="Tracking reference"
                value={filters.trackingReference ?? ""}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, trackingReference: event.target.value }))
                }
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {curatedQueries.map((item) => (
                <Button key={item.id} variant="outline" size="sm" onClick={() => applyCurated(item.build)}>
                  {item.label}
                </Button>
              ))}
              <Button
                size="sm"
                className="gap-2"
                disabled={queryRunning}
                onClick={() => {
                  const nextQuery = buildAfdAccessFilteredQuery(logMode, logTable, filters);
                  setQuery(nextQuery);
                  void runQuery(nextQuery);
                }}
              >
                <Play className="h-4 w-4" />
                Run query
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => onEditInLogAnalytics(logWorkspace, query, timespan)}
              >
                <ExternalLink className="h-4 w-4" />
                Edit in Log Analytics
              </Button>
            </div>
          </section>

          <section className={sectionCard}>
            <KqlEditor
              value={query}
              onChange={setQuery}
              onRun={() => void runQuery()}
              disabled={queryRunning}
            />
            {queryError ? <p className="text-sm text-destructive">{queryError}</p> : null}
            <LogQueryResultPanel
              result={queryResult}
              error={queryError}
              emptyTitle="No access log results yet"
              emptyDescription="Run a curated access-log query or adjust filters."
            />
          </section>
        </TabsContent>
      </Tabs>

      <AlertDialog
        open={purgeEndpoint != null}
        onOpenChange={(open) => {
          if (!open) {
            setPurgeEndpoint(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Purge Front Door cache?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Purges cached content for endpoint <span className="font-medium">{purgeEndpoint}</span> on
                  profile <span className="font-medium">{profileName}</span>. Paths are relative to the endpoint
                  hostname.
                </p>
                <div>
                  <div className={fieldLabel}>Content paths (one per line)</div>
                  <textarea
                    className="mt-1 min-h-[88px] w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm"
                    value={purgePaths}
                    onChange={(event) => setPurgePaths(event.target.value)}
                    spellCheck={false}
                  />
                </div>
                <div>
                  <div className={fieldLabel}>Domains (optional, comma-separated)</div>
                  <Input
                    value={purgeDomains}
                    onChange={(event) => setPurgeDomains(event.target.value)}
                    placeholder="api.example.com, www.example.com"
                    spellCheck={false}
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!purgeEndpoint || !profileName}
              onClick={() => {
                if (!purgeEndpoint || !profileName) {
                  return;
                }
                const contentPaths = purgePaths
                  .split(/\r?\n/)
                  .map((line) => line.trim())
                  .filter(Boolean);
                const domains = purgeDomains
                  .split(",")
                  .map((part) => part.trim())
                  .filter(Boolean);
                onPurgeCache(profileName, purgeEndpoint, contentPaths, domains);
                setPurgeEndpoint(null);
              }}
            >
              Purge
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}