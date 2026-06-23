// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, ExternalLink, Loader2, Play, Plus, Save, Shield, Square, Trash2 } from "lucide-react";

import { KqlEditor } from "@/components/kql/KqlEditor";
import { LogQueryResultPanel } from "@/components/log-analytics/LogQueryResultPanel";
import { cn } from "@/lib/utils";
import {
  buildTrackingReferenceExtendQuery,
  buildTrackingReferenceSearchQuery,
  buildWafFilteredQuery,
  describeWafLogSchema,
  normaliseWafSchema,
  type WafLogFilters,
} from "@/lib/waf-kql";
import {
  curatedQueriesByCategory,
  WAF_CURATED_QUERY_CATEGORIES,
  type WafCuratedQueryCategory,
} from "@/lib/waf-curated-queries";
import { isTuningCandidate } from "@/lib/waf-decode";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  InventoryLoadingState,
  InventorySelectLoadingHint,
} from "@/components/inventory-loading-state";
import { azureInventoryLoadingLabel } from "@/lib/azure-inventory";
import { StatusPill } from "@/components/status-pill";
import type {
  AzureLogAnalyticsSavedQuery,
  AzureLogQueryResult,
  AzureWafExclusion,
  AzureWafLogSchemaProfile,
  WorkspaceSnapshot,
} from "@/types/backend";

export type AzureWafViewProps = {
  workspace: WorkspaceSnapshot;
  workspaceSelectionLoading?: boolean;
  inventoryLoading?: boolean;
  configLoading?: boolean;
  onSelectWorkspace: (workspace: string) => void;
  onSelectPolicy: (policyName: string) => void;
  onRunQuery: (
    workspace: string,
    query: string,
    timespan: string,
  ) => Promise<AzureLogQueryResult>;
  onEditInLogAnalytics: (workspace: string, query: string, timespan: string) => void;
  onSetMode: (resourceGroup: string, policyName: string, mode: string) => Promise<void>;
  onSetManagedRule: (
    resourceGroup: string,
    policyName: string,
    ruleSetType: string,
    ruleSetVersion: string,
    ruleGroupName: string,
    ruleId: string,
    enabled: boolean,
  ) => Promise<void>;
  onRemoveExclusion: (
    resourceGroup: string,
    policyName: string,
    exclusion: AzureWafExclusion,
  ) => Promise<void>;
  onAddExclusion: (
    resourceGroup: string,
    policyName: string,
    exclusion: AzureWafExclusion,
  ) => Promise<void>;
  onListSaved?: (workspace: string) => Promise<AzureLogAnalyticsSavedQuery[]>;
  onSaveQuery?: (
    workspace: string,
    name: string,
    query: string,
    timespan: string,
    id?: string,
  ) => Promise<AzureLogAnalyticsSavedQuery>;
  onDeleteSaved?: (workspace: string, id: string) => Promise<void>;
};

const fieldLabel =
  "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";
const sectionCard = "space-y-4 rounded-lg border border-border bg-card p-[18px] shadow-sm";

const TIMESPAN_OPTIONS = [
  { label: "Last 24 hours", value: "P1D", timespan: "P1D" },
  { label: "Last 7 days", value: "P7D", timespan: "P7D" },
  { label: "Last 30 days", value: "P30D", timespan: "P30D" },
  { label: "All time", value: "all", timespan: "" },
] as const;

export default function AzureWafView({
  workspace,
  workspaceSelectionLoading = false,
  inventoryLoading = false,
  configLoading = false,
  onSelectWorkspace,
  onSelectPolicy,
  onRunQuery,
  onEditInLogAnalytics,
  onSetMode,
  onSetManagedRule,
  onRemoveExclusion,
  onAddExclusion,
  onListSaved,
  onSaveQuery,
  onDeleteSaved,
}: AzureWafViewProps) {
  const workspaces = workspace.azureLogAnalyticsWorkspaces ?? [];
  const policies = workspace.azureWafPolicies ?? [];
  const selectedWorkspace = workspace.selectedAzureLogWorkspace ?? workspaces[0]?.name ?? "";
  const selectedPolicy = workspace.selectedAzureWafPolicy ?? policies[0]?.name ?? "";
  const schema = useMemo(
    () => normaliseWafSchema(workspace.azureWafLogSchema),
    [workspace.azureWafLogSchema],
  );
  const schemaDescription = useMemo(() => describeWafLogSchema(schema), [schema]);
  const policyDetail = workspace.azureWafPolicyDetail;
  const fireCounts = workspace.azureWafRuleFireCounts ?? [];
  const canWrite = workspace.azureWritesEnabled;
  const inventoryLoadingLabel = azureInventoryLoadingLabel(workspace, "waf");
  const inventoryControlsBusy = inventoryLoading || workspaceSelectionLoading;

  const [query, setQuery] = useState("");
  const [timespanValue, setTimespanValue] = useState<string>(TIMESPAN_OPTIONS[0].value);
  const [trackingRef, setTrackingRef] = useState("");
  const [filters, setFilters] = useState<WafLogFilters>({});
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AzureLogQueryResult | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [pendingMode, setPendingMode] = useState<string | null>(null);
  const [pendingRule, setPendingRule] = useState<{
    ruleId: string;
    ruleGroupName: string;
    enabled: boolean;
  } | null>(null);
  const [pendingExclusion, setPendingExclusion] = useState<AzureWafExclusion | null>(null);
  const [addExclusionOpen, setAddExclusionOpen] = useState(false);
  const [newExclusion, setNewExclusion] = useState<AzureWafExclusion>({
    matchVariable: "RequestHeaderNames",
    selectorMatchOperator: "Equals",
    selector: "",
  });
  const [saved, setSaved] = useState<AzureLogAnalyticsSavedQuery[]>([]);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const runTokenRef = useRef(0);
  const curatedByCategory = useMemo(() => curatedQueriesByCategory(), []);

  useEffect(() => {
    if (!selectedWorkspace || !onListSaved) {
      setSaved([]);
      return;
    }
    void onListSaved(selectedWorkspace).then(setSaved).catch(() => setSaved([]));
  }, [selectedWorkspace, onListSaved]);

  const timeRangeLabel = useMemo(
    () => TIMESPAN_OPTIONS.find((option) => option.value === timespanValue)?.label ?? "Last 24 hours",
    [timespanValue],
  );
  const timespan =
    TIMESPAN_OPTIONS.find((option) => option.value === timespanValue)?.timespan ?? "P1D";

  const baseFilters = useMemo<WafLogFilters>(
    () => ({
      ...filters,
      policy: filters.policy ?? selectedPolicy,
    }),
    [filters, selectedPolicy],
  );

  const canRun = selectedWorkspace.trim() !== "" && query.trim() !== "" && !running;

  async function run(activeQuery = query) {
    if (!selectedWorkspace.trim() || !activeQuery.trim() || running) return;
    const token = ++runTokenRef.current;
    setRunning(true);
    setError(null);
    try {
      const queryResult = await onRunQuery(selectedWorkspace, activeQuery, timespan);
      if (token !== runTokenRef.current) return;
      setResult(queryResult);
    } catch (caught) {
      if (token !== runTokenRef.current) return;
      setError(caught instanceof Error ? caught.message : String(caught));
      setResult(null);
    } finally {
      if (token === runTokenRef.current) {
        setRunning(false);
      }
    }
  }

  function cancelRun() {
    runTokenRef.current += 1;
    setRunning(false);
  }

  function applyTrackingLookup(mode: "extend" | "search") {
    const trimmed = trackingRef.trim();
    if (!trimmed) return;
    const nextQuery =
      mode === "search"
        ? buildTrackingReferenceSearchQuery(schema, trimmed)
        : buildTrackingReferenceExtendQuery(schema, trimmed);
    setQuery(nextQuery);
    void run(nextQuery);
  }

  function loadCurated(build: (schema: AzureWafLogSchemaProfile, filters?: WafLogFilters) => string) {
    setQuery(build(schema, baseFilters));
    setError(null);
  }

  function loadSavedEntry(entry: AzureLogAnalyticsSavedQuery) {
    setQuery(entry.query);
    if (entry.timespan) {
      const match = TIMESPAN_OPTIONS.find((option) => option.timespan === entry.timespan);
      if (match) {
        setTimespanValue(match.value);
      }
    }
    setError(null);
  }

  async function confirmSaveQuery() {
    const name = saveName.trim();
    if (!name || !onSaveQuery || !selectedWorkspace) {
      return;
    }
    await onSaveQuery(selectedWorkspace, name, query, timespan);
    setSaveDialogOpen(false);
    setSaveName("");
    if (onListSaved) {
      const refreshed = await onListSaved(selectedWorkspace);
      setSaved(refreshed);
    }
  }

  async function deleteSaved(id: string) {
    if (!onDeleteSaved || !selectedWorkspace) {
      return;
    }
    await onDeleteSaved(selectedWorkspace, id);
    if (onListSaved) {
      const refreshed = await onListSaved(selectedWorkspace);
      setSaved(refreshed);
    }
  }

  function applyFilteredQuery() {
    const nextQuery = buildWafFilteredQuery(schema, baseFilters);
    setQuery(nextQuery);
    void run(nextQuery);
  }

  async function confirmModeChange() {
    if (!policyDetail || !pendingMode) return;
    setConfigError(null);
    try {
      await onSetMode(policyDetail.resourceGroup, policyDetail.name, pendingMode);
      setPendingMode(null);
    } catch (caught) {
      setConfigError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function confirmRuleChange() {
    if (!policyDetail || !pendingRule) return;
    const ruleSet = policyDetail.managedRuleSets[0];
    if (!ruleSet) return;
    setConfigError(null);
    try {
      await onSetManagedRule(
        policyDetail.resourceGroup,
        policyDetail.name,
        ruleSet.ruleSetType,
        ruleSet.ruleSetVersion,
        pendingRule.ruleGroupName,
        pendingRule.ruleId,
        pendingRule.enabled,
      );
      setPendingRule(null);
    } catch (caught) {
      setConfigError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function confirmExclusionRemove() {
    if (!policyDetail || !pendingExclusion) return;
    setConfigError(null);
    try {
      await onRemoveExclusion(policyDetail.resourceGroup, policyDetail.name, pendingExclusion);
      setPendingExclusion(null);
    } catch (caught) {
      setConfigError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function confirmExclusionAdd() {
    if (!policyDetail) return;
    const matchVariable = newExclusion.matchVariable.trim();
    const selector = newExclusion.selector?.trim() ?? "";
    if (!matchVariable || !selector) {
      setConfigError("Match variable and selector value are required.");
      return;
    }
    setConfigError(null);
    const ruleSetType =
      newExclusion.ruleSetType?.trim() ||
      policyDetail.managedRuleSets[0]?.ruleSetType ||
      "Microsoft_DefaultRuleSet";
    try {
      await onAddExclusion(policyDetail.resourceGroup, policyDetail.name, {
        ...newExclusion,
        matchVariable,
        selector,
        ruleSetType,
      });
      setAddExclusionOpen(false);
      setNewExclusion({
        matchVariable: "RequestHeaderNames",
        selectorMatchOperator: "Equals",
        selector: "",
      });
    } catch (caught) {
      setConfigError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="flex items-center gap-2 text-[1.375rem] font-[750] tracking-[-0.015em]">
          <Shield className="size-6 text-muted-foreground" />
          WAF
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {workspace.profile?.displayName || "Subscription"} · Front Door WAF logs and policy
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusPill
            status={schemaDescription.detected ? "on" : "warning"}
            label={schemaDescription.detected ? "Schema detected" : "Schema assumed"}
          />
          <span className="rounded-md border border-border bg-muted/30 px-2 py-1 text-xs text-muted-foreground">
            {schemaDescription.modeLabel}
          </span>
          <span className="text-xs text-muted-foreground">
            Table <span className="font-mono text-foreground">{schemaDescription.tableLabel}</span>
          </span>
        </div>
      </header>

      <Tabs defaultValue="logs">
        <TabsList>
          <TabsTrigger value="logs">Logs</TabsTrigger>
          <TabsTrigger value="config">Config</TabsTrigger>
        </TabsList>

        <TabsContent value="logs" className="mt-4 space-y-4">
          {inventoryLoading ? (
            <InventoryLoadingState variant="banner" label={inventoryLoadingLabel} />
          ) : null}
          <section className={cn(sectionCard, inventoryLoading ? "opacity-60" : undefined)}>
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-72">
                <div className={cn(fieldLabel, "mb-1")}>Workspace</div>
                <Select
                  value={selectedWorkspace}
                  disabled={inventoryControlsBusy}
                  onValueChange={(value) => {
                    if (value) onSelectWorkspace(value);
                  }}
                >
                  <SelectTrigger aria-label="Select Log Analytics workspace">
                    {inventoryLoading && workspaces.length === 0 ? (
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
                        Loading workspaces...
                      </span>
                    ) : (
                      <SelectValue placeholder="Select workspace" />
                    )}
                  </SelectTrigger>
                  <SelectContent>
                    {workspaces.map((ws) => (
                      <SelectItem key={ws.customerId || ws.name} value={ws.name}>
                        {ws.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <InventorySelectLoadingHint
                  loading={inventoryLoading && workspaces.length === 0}
                  label={inventoryLoadingLabel}
                />
                <InventorySelectLoadingHint
                  loading={workspaceSelectionLoading}
                  label="Switching workspace..."
                />
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
              <div className="w-72">
                <div className={cn(fieldLabel, "mb-1")}>WAF policy</div>
                <Select
                  value={selectedPolicy}
                  disabled={inventoryControlsBusy}
                  onValueChange={(value) => {
                    if (value) onSelectPolicy(value);
                  }}
                >
                  <SelectTrigger aria-label="Select WAF policy">
                    {inventoryLoading && policies.length === 0 ? (
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
                        Loading policies...
                      </span>
                    ) : (
                      <SelectValue placeholder="Select policy" />
                    )}
                  </SelectTrigger>
                  <SelectContent>
                    {policies.map((policy) => (
                      <SelectItem key={policy.name} value={policy.name}>
                        {policy.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              <div className="font-medium text-foreground">{schemaDescription.modeLabel}</div>
              <div className="mt-1">
                Table <span className="font-mono">{schemaDescription.tableLabel}</span>
                {schemaDescription.detected ? " · detected from workspace data" : " · default until schema is probed"}
              </div>
              <div className="mt-1">
                Tracking ref lookup: {schemaDescription.trackingLookup}
              </div>
              {schemaDescription.message ? <div className="mt-1">{schemaDescription.message}</div> : null}
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[280px] flex-1">
                <div className={cn(fieldLabel, "mb-1")}>Tracking reference (X-Azure-Ref)</div>
                <Input
                  value={trackingRef}
                  onChange={(event) => setTrackingRef(event.target.value)}
                  placeholder="20260619T211623Z-abc123"
                  spellCheck={false}
                  aria-label="WAF tracking reference"
                />
              </div>
              <Button
                variant="secondary"
                onClick={() => applyTrackingLookup("extend")}
                disabled={!trackingRef.trim() || running}
              >
                Look up ref
              </Button>
              <Button
                variant="outline"
                onClick={() => applyTrackingLookup("search")}
                disabled={!trackingRef.trim() || running}
              >
                Search table
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <div className={cn(fieldLabel, "mb-1")}>Client IP</div>
                <Input
                  value={filters.clientIP ?? ""}
                  onChange={(event) => setFilters((current) => ({ ...current, clientIP: event.target.value }))}
                  placeholder="Optional filter"
                />
              </div>
              <div>
                <div className={cn(fieldLabel, "mb-1")}>Host</div>
                <Input
                  value={filters.host ?? ""}
                  onChange={(event) => setFilters((current) => ({ ...current, host: event.target.value }))}
                  placeholder="Optional filter"
                />
              </div>
              <div>
                <div className={cn(fieldLabel, "mb-1")}>Rule name</div>
                <Input
                  value={filters.ruleName ?? ""}
                  onChange={(event) => setFilters((current) => ({ ...current, ruleName: event.target.value }))}
                  placeholder="Optional filter"
                />
              </div>
              <div>
                <div className={cn(fieldLabel, "mb-1")}>URI contains</div>
                <Input
                  value={filters.uriContains ?? ""}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, uriContains: event.target.value }))
                  }
                  placeholder="Optional filter"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" disabled={running}>
                    <BookOpen />
                    Curated queries
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="max-h-80 w-96 overflow-y-auto">
                  {(Object.keys(WAF_CURATED_QUERY_CATEGORIES) as WafCuratedQueryCategory[]).map(
                    (category) => {
                      const items = curatedByCategory[category];
                      if (items.length === 0) {
                        return null;
                      }
                      return (
                        <div key={category}>
                          <DropdownMenuLabel>
                            {WAF_CURATED_QUERY_CATEGORIES[category]}
                          </DropdownMenuLabel>
                          {items.map((item) => (
                            <DropdownMenuItem
                              key={item.id}
                              className="flex flex-col items-start gap-0.5"
                              onClick={() => loadCurated(item.build)}
                            >
                              <span className="font-medium">{item.label}</span>
                              <span className="text-xs text-muted-foreground">{item.description}</span>
                            </DropdownMenuItem>
                          ))}
                          <DropdownMenuSeparator />
                        </div>
                      );
                    },
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              {onListSaved ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" disabled={!selectedWorkspace}>
                      <Save />
                      Saved
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="max-h-72 w-96 overflow-y-auto">
                    <DropdownMenuLabel>Saved queries (local)</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {saved.length === 0 ? (
                      <DropdownMenuItem disabled>No saved queries yet</DropdownMenuItem>
                    ) : (
                      saved.map((entry) => (
                        <DropdownMenuItem
                          key={entry.id}
                          className="flex items-start justify-between gap-2"
                          onClick={() => loadSavedEntry(entry)}
                        >
                          <span className="line-clamp-2">
                            <span className="font-medium">{entry.name}</span>
                            <span className="mt-0.5 block font-mono text-xs text-muted-foreground">
                              {entry.query}
                            </span>
                          </span>
                          {onDeleteSaved ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 shrink-0"
                              aria-label={`Delete saved query ${entry.name}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                void deleteSaved(entry.id);
                              }}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          ) : null}
                        </DropdownMenuItem>
                      ))
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
              {onSaveQuery ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!query.trim() || !selectedWorkspace}
                  onClick={() => setSaveDialogOpen(true)}
                >
                  <Save />
                  Save query
                </Button>
              ) : null}
              <Button variant="outline" size="sm" disabled={running} onClick={applyFilteredQuery}>
                Apply filters
              </Button>
            </div>

            <div>
              <div className={cn(fieldLabel, "mb-1")}>KQL query</div>
              <KqlEditor value={query} onChange={setQuery} onRun={() => void run()} disabled={running} />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => void run()} disabled={!canRun}>
                {running ? <Loader2 className="animate-spin" /> : <Play />}
                {running ? "Running…" : "Run query"}
              </Button>
              {running ? (
                <Button variant="outline" onClick={cancelRun}>
                  <Square />
                  Cancel
                </Button>
              ) : null}
              <Button
                variant="outline"
                disabled={!query.trim()}
                onClick={() => onEditInLogAnalytics(selectedWorkspace, query, timespan)}
              >
                <ExternalLink />
                Edit in Log Analytics
              </Button>
              <p className="text-sm text-muted-foreground">{workspace.azureWafStatusMessage}</p>
            </div>
          </section>

          <LogQueryResultPanel
            result={result}
            error={error}
            timeRangeLabel={timeRangeLabel}
            emptyTitle="No WAF log results yet"
            emptyDescription="Look up a tracking reference or run a curated WAF query."
            wafColumnMap={schema.columns}
          />
        </TabsContent>

        <TabsContent value="config" className="mt-4 space-y-4">
          {inventoryLoading ? (
            <InventoryLoadingState variant="banner" label={inventoryLoadingLabel} />
          ) : null}
          {configLoading ? (
            <InventoryLoadingState
              variant="banner"
              label="Loading WAF policy config from Azure..."
            />
          ) : null}
          <section
            className={cn(
              sectionCard,
              inventoryLoading || configLoading ? "opacity-60" : undefined,
            )}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="w-72">
                <div className={cn(fieldLabel, "mb-1")}>Policy</div>
                <Select
                  value={selectedPolicy}
                  disabled={inventoryLoading || configLoading}
                  onValueChange={(value) => {
                    if (value) onSelectPolicy(value);
                  }}
                >
                  <SelectTrigger aria-label="Select WAF policy for config">
                    {inventoryLoading && policies.length === 0 ? (
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
                        Loading policies...
                      </span>
                    ) : (
                      <SelectValue placeholder="Select policy" />
                    )}
                  </SelectTrigger>
                  <SelectContent>
                    {policies.map((policy) => (
                      <SelectItem key={policy.name} value={policy.name}>
                        {policy.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <StatusPill
                status={canWrite ? "on" : "warning"}
                label={canWrite ? "Writes enabled" : "Read-only"}
              />
            </div>

            {configError ? <p className="text-sm text-destructive">{configError}</p> : null}
            <p className="text-sm text-muted-foreground">{workspace.azureWafStatusMessage}</p>

            {policyDetail ? (
              <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
                <div>
                  <dt className={fieldLabel}>Mode</dt>
                  <dd className="mt-1 flex items-center gap-2">
                    <span className="font-mono">{policyDetail.mode}</span>
                    {canWrite ? (
                      <Select
                        value={policyDetail.mode}
                        onValueChange={(value) => {
                          if (value && value !== policyDetail.mode) setPendingMode(value);
                        }}
                      >
                        <SelectTrigger className="h-8 w-36" aria-label="Change WAF mode">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {["Detection", "Prevention"].map((mode) => (
                            <SelectItem key={mode} value={mode}>
                              {mode}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : null}
                  </dd>
                </div>
                <div>
                  <dt className={fieldLabel}>Enabled</dt>
                  <dd className="mt-1">{policyDetail.enabled ? "Yes" : "No"}</dd>
                </div>
                <div>
                  <dt className={fieldLabel}>Resource group</dt>
                  <dd className="mt-1 font-mono text-xs">{policyDetail.resourceGroup}</dd>
                </div>
              </dl>
            ) : configLoading ? (
              <InventoryLoadingState
                variant="inline"
                label="Loading policy detail, managed rules, and exclusions..."
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                No policy detail loaded. WAF config is cloud-only on real Azure profiles.
              </p>
            )}
          </section>

          {policyDetail ? (
            <>
              <section className={sectionCard}>
                <h2 className="text-base font-bold">Rule fire counts (24h)</h2>
                <p className="text-xs text-muted-foreground">
                  Correlates managed rules with recent log volume for tuning candidates.
                </p>
                {fireCounts.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Rule</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead className="text-right">Count</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {fireCounts.map((entry) => (
                        <TableRow key={entry.ruleName}>
                          <TableCell className="font-mono text-xs">{entry.ruleName}</TableCell>
                          <TableCell>
                            {entry.action ?? "—"}
                            {isTuningCandidate(entry.action) ? (
                              <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">
                                Tuning
                              </span>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{entry.count}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-sm text-muted-foreground">No recent rule fires in logs.</p>
                )}
              </section>

              <section className={sectionCard}>
                <h2 className="text-base font-bold">Managed rule overrides</h2>
                {policyDetail.managedRuleOverrides.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Rule ID</TableHead>
                        <TableHead>Group</TableHead>
                        <TableHead>Enabled</TableHead>
                        {canWrite ? <TableHead /> : null}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {policyDetail.managedRuleOverrides.map((override) => (
                        <TableRow key={override.ruleId}>
                          <TableCell className="font-mono text-xs">{override.ruleId}</TableCell>
                          <TableCell>{override.ruleGroupName ?? "—"}</TableCell>
                          <TableCell>{override.enabled ? "Yes" : "No"}</TableCell>
                          {canWrite ? (
                            <TableCell>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  setPendingRule({
                                    ruleId: override.ruleId,
                                    ruleGroupName: override.ruleGroupName ?? "",
                                    enabled: !override.enabled,
                                  })
                                }
                              >
                                {override.enabled ? "Disable" : "Enable"}
                              </Button>
                            </TableCell>
                          ) : null}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-sm text-muted-foreground">No managed rule overrides.</p>
                )}
              </section>

              <section className={sectionCard}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h2 className="text-base font-bold">Exclusions</h2>
                  {canWrite ? (
                    <Button variant="outline" size="sm" onClick={() => setAddExclusionOpen(true)}>
                      <Plus />
                      Add exclusion
                    </Button>
                  ) : null}
                </div>
                {policyDetail.exclusions.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Match variable</TableHead>
                        <TableHead>Operator</TableHead>
                        <TableHead>Selector</TableHead>
                        {canWrite ? <TableHead /> : null}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {policyDetail.exclusions.map((exclusion, index) => (
                        <TableRow key={`${exclusion.matchVariable}-${index}`}>
                          <TableCell>{exclusion.matchVariable}</TableCell>
                          <TableCell>{exclusion.selectorMatchOperator}</TableCell>
                          <TableCell className="font-mono text-xs">{exclusion.selector ?? "—"}</TableCell>
                          {canWrite ? (
                            <TableCell>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPendingExclusion(exclusion)}
                              >
                                Remove
                              </Button>
                            </TableCell>
                          ) : null}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-sm text-muted-foreground">No exclusions configured.</p>
                )}
              </section>

              <section className={sectionCard}>
                <h2 className="text-base font-bold">Custom rules</h2>
                {policyDetail.customRules.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Priority</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>Enabled</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {policyDetail.customRules.map((rule) => (
                        <TableRow key={rule.name}>
                          <TableCell>{rule.name}</TableCell>
                          <TableCell>{rule.priority}</TableCell>
                          <TableCell>{rule.action}</TableCell>
                          <TableCell>{rule.enabled ? "Yes" : "No"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-sm text-muted-foreground">No custom rules.</p>
                )}
              </section>
            </>
          ) : null}
        </TabsContent>
      </Tabs>

      <AlertDialog open={pendingMode != null} onOpenChange={(open) => !open && setPendingMode(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change WAF policy mode?</AlertDialogTitle>
            <AlertDialogDescription>
              Set policy {policyDetail?.name} to {pendingMode}. This affects live traffic handling.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmModeChange()}>Apply</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={pendingRule != null} onOpenChange={(open) => !open && setPendingRule(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingRule?.enabled ? "Enable" : "Disable"} managed rule?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Rule {pendingRule?.ruleId} on policy {policyDetail?.name}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmRuleChange()}>Apply</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={pendingExclusion != null}
        onOpenChange={(open) => !open && setPendingExclusion(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove exclusion?</AlertDialogTitle>
            <AlertDialogDescription>
              Remove {pendingExclusion?.matchVariable} exclusion from policy {policyDetail?.name}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmExclusionRemove()}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={addExclusionOpen} onOpenChange={setAddExclusionOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add WAF exclusion</DialogTitle>
            <DialogDescription>
              Adds a managed-rule exclusion to policy {policyDetail?.name}. Uses the first managed
              rule set on the policy when rule set type is not specified.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <div className={cn(fieldLabel, "mb-1")}>Match variable</div>
              <Select
                value={newExclusion.matchVariable}
                onValueChange={(value) => {
                  if (value) {
                    setNewExclusion((current) => ({ ...current, matchVariable: value }));
                  }
                }}
              >
                <SelectTrigger aria-label="WAF exclusion match variable">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[
                    "RequestHeaderNames",
                    "RequestCookieNames",
                    "QueryStringArgNames",
                    "RequestBodyJsonArgNames",
                    "RequestBodyPostArgNames",
                  ].map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <div className={cn(fieldLabel, "mb-1")}>Operator</div>
              <Select
                value={newExclusion.selectorMatchOperator}
                onValueChange={(value) => {
                  if (value) {
                    setNewExclusion((current) => ({ ...current, selectorMatchOperator: value }));
                  }
                }}
              >
                <SelectTrigger aria-label="WAF exclusion operator">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["Equals", "Contains", "StartsWith", "EndsWith"].map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <div className={cn(fieldLabel, "mb-1")}>Selector value</div>
              <Input
                value={newExclusion.selector ?? ""}
                onChange={(event) =>
                  setNewExclusion((current) => ({ ...current, selector: event.target.value }))
                }
                placeholder="User-Agent"
                spellCheck={false}
                aria-label="WAF exclusion selector value"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddExclusionOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!newExclusion.matchVariable.trim() || !newExclusion.selector?.trim()}
              onClick={() => void confirmExclusionAdd()}
            >
              Add exclusion
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save WAF query</DialogTitle>
            <DialogDescription>
              Saved locally for this Log Analytics workspace. Reuse from the Saved menu or in Log
              Analytics.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={saveName}
            onChange={(event) => setSaveName(event.target.value)}
            placeholder="Anomaly scoring prod"
            aria-label="Saved query name"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!saveName.trim()} onClick={() => void confirmSaveQuery()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}