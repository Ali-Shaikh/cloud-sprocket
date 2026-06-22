// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useMemo, useState } from "react";
import { ExternalLink, Globe, Network, Play, Shield } from "lucide-react";

import { KqlEditor } from "@/components/kql/KqlEditor";
import { LogQueryResultPanel } from "@/components/log-analytics/LogQueryResultPanel";
import { EmptyState } from "@/components/empty-state";
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
  type AfdAccessLogFilters,
  type AfdAccessLogMode,
} from "@/lib/afd-kql";
import type { AzureLogQueryResult, WorkspaceSnapshot } from "@/types/backend";

export type AzureFrontDoorViewProps = {
  workspace: WorkspaceSnapshot;
  onSelectProfile: (profile: string) => void;
  onSelectEndpoint: (endpoint: string) => void;
  onSelectOriginGroup: (originGroup: string) => void;
  onOpenWafPolicy: (policyName: string) => void;
  onEditInLogAnalytics: (workspace: string, query: string, timespan: string) => void;
  onRunQuery: (
    workspace: string,
    query: string,
    timespan: string,
  ) => Promise<AzureLogQueryResult>;
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
  onSelectProfile,
  onSelectEndpoint,
  onSelectOriginGroup,
  onOpenWafPolicy,
  onEditInLogAnalytics,
  onRunQuery,
}: AzureFrontDoorViewProps) {
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

  const curatedQueries = useMemo(() => AFD_CURATED_QUERIES, []);

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

      <Tabs defaultValue="topology">
        <TabsList>
          <TabsTrigger value="topology">Topology</TabsTrigger>
          <TabsTrigger value="access-logs">Access logs</TabsTrigger>
        </TabsList>

        <TabsContent value="topology" className="space-y-6">
          <section className={sectionCard}>
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-72">
                <div className={cn(fieldLabel, "mb-1")}>Profile</div>
                <Select value={profileName} onValueChange={(value) => value && onSelectProfile(value)}>
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
            {selectedProfile ? (
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span>SKU {selectedProfile.sku || "—"}</span>
                <span>RG {selectedProfile.resourceGroup || "—"}</span>
                <span>{selectedProfile.location || "Global"}</span>
              </div>
            ) : null}
            <p className="text-sm text-muted-foreground">{workspace.azureFrontDoorStatusMessage}</p>
          </section>

          <section className={sectionCard}>
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
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </section>

          <section className={sectionCard}>
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

          <section className={sectionCard}>
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
    </div>
  );
}