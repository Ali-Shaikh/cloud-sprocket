// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Loader2, Plus, Save, Shield, Trash2 } from "lucide-react";

import { KqlEditor } from "@/components/kql/KqlEditor";
import { LogQueryResultPanel } from "@/components/log-analytics/LogQueryResultPanel";
import { WafOverviewPanel } from "@/components/waf/WafOverviewPanel";
import { WafQueryGroupByBar, WafQueryRunControls } from "@/components/waf/WafQueryExecutionBar";
import { cn } from "@/lib/utils";
import { actionCapabilityState } from "@/lib/action-capabilities";
import {
  buildTrackingReferenceExtendQuery,
  buildTrackingReferenceSearchQuery,
  buildWafFilteredQuery,
  describeWafLogSchema,
  normaliseWafSchema,
  type WafLogFilters,
} from "@/lib/waf-kql";
import {
  buildBlockedRequestsDetailQuery,
  curatedQueriesByCategory,
  WAF_CURATED_QUERY_CATEGORIES,
  type WafCuratedQueryCategory,
} from "@/lib/waf-curated-queries";
import { decodeWafRow, isTuningCandidate } from "@/lib/waf-decode";
import {
  buildWafInvestigationBundle,
  downloadWafInvestigationBundle,
} from "@/lib/waf-investigation-export";
import { notify } from "@/lib/notify";
import {
  buildExecutableWafQuery,
  trimWafQueryPageRows,
  WAF_PAGE_SIZE_OPTIONS,
  wafGroupByOptions,
  wafQueryHasNextPage,
  type WafGroupByField,
} from "@/lib/waf-query-execution";
import {
  timespanDurationFor,
  timespanLabelFor,
  timespanValueFor,
  WAF_DEFAULT_TIMESPAN_VALUE,
  WAF_TIMESPAN_OPTIONS,
} from "@/lib/kql-timespan-options";
import {
  resolveWafPolicySelection,
  resolveWafWorkspaceSelection,
  WAF_ALL_POLICIES_VALUE,
  wafPolicyQueryFilter,
} from "@/lib/waf-selection";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { getCachedWafLogSchema, setCachedWafLogSchema } from "@/lib/waf-schema-cache";
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

/** Fixed probe window: column names do not depend on the query time range. */
const WAF_SCHEMA_PROBE_TIMESPAN = "P1D";

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
    maxRows?: number,
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
  /** Background probe for workspace log columns. Called at most once per workspace per session. */
  onProbeLogSchema?: (workspace: string, timespan: string) => Promise<AzureWafLogSchemaProfile>;
  /** Jump to Front Door access logs for the same tracking reference. */
  onCorrelateTrackingRef?: (trackingReference: string, workspace: string, timespan: string) => void;
};

const fieldLabel =
  "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";
const sectionCard = "space-y-4 rounded-lg border border-border bg-card p-[18px] shadow-sm";

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
  onProbeLogSchema,
  onCorrelateTrackingRef,
}: AzureWafViewProps) {
  const workspaces = workspace.azureLogAnalyticsWorkspaces ?? [];
  const policies = workspace.azureWafPolicies ?? [];
  const resolvedWorkspace = useMemo(
    () => resolveWafWorkspaceSelection(workspaces, workspace.selectedAzureLogWorkspace),
    [workspaces, workspace.selectedAzureLogWorkspace],
  );
  const resolvedPolicy = useMemo(
    () => resolveWafPolicySelection(policies, workspace.selectedAzureWafPolicy, true),
    [policies, workspace.selectedAzureWafPolicy],
  );
  const selectedWorkspace = resolvedWorkspace.workspace;
  const configPolicy = resolvedPolicy.configPolicy;
  const [queryPolicyValue, setQueryPolicyValue] = useState(WAF_ALL_POLICIES_VALUE);
  const [activeTab, setActiveTab] = useState("logs");
  const selectionSyncRef = useRef({ workspace: "", policy: "" });
  const [schemaRevision, setSchemaRevision] = useState(0);
  const [schemaProbeHint, setSchemaProbeHint] = useState<string | null>(null);
  const schemaProbeTokenRef = useRef(0);

  const schema = useMemo(() => {
    const cached = getCachedWafLogSchema(selectedWorkspace);
    if (cached) {
      return normaliseWafSchema(cached);
    }
    return normaliseWafSchema(workspace.azureWafLogSchema);
    // schemaRevision bumps when a background probe completes.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- revision tracks cache writes
  }, [selectedWorkspace, workspace.azureWafLogSchema, schemaRevision]);
  const schemaDescription = useMemo(() => describeWafLogSchema(schema), [schema]);
  const policyDetail = workspace.azureWafPolicyDetail;
  const fireCounts = workspace.azureWafRuleFireCounts ?? [];
  const writeCapability = actionCapabilityState(workspace, "waf", "setMode", "azure");
  const canWrite = writeCapability.enabled;
  const writeDisabledReason = writeCapability.reason;
  const inventoryLoadingLabel = azureInventoryLoadingLabel(workspace, "waf");
  const inventoryControlsBusy = inventoryLoading || workspaceSelectionLoading;

  const [query, setQuery] = useState("");
  const [timespanValue, setTimespanValue] = useState<string>(WAF_DEFAULT_TIMESPAN_VALUE);
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
  const [pageSize, setPageSize] = useState<number>(WAF_PAGE_SIZE_OPTIONS[2]);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [groupByFields, setGroupByFields] = useState<WafGroupByField[]>([]);
  const runTokenRef = useRef(0);
  const curatedByCategory = useMemo(() => curatedQueriesByCategory(), []);
  const groupByOptions = useMemo(() => wafGroupByOptions(schema), [schema]);
  const groupedResults = groupByFields.length > 0;

  const inventoryReady = !inventoryLoading && workspaces.length > 0;
  const overviewReady =
    inventoryReady &&
    selectedWorkspace.trim() !== "" &&
    !workspaceSelectionLoading &&
    !configLoading &&
    !schemaProbeHint;

  const queryPolicy = wafPolicyQueryFilter(queryPolicyValue);

  const overviewRefreshKey = useMemo(
    () =>
      [
        selectedWorkspace,
        queryPolicy ?? "",
        timespanDurationFor(timespanValue, WAF_TIMESPAN_OPTIONS),
        schema.detected ? "1" : "0",
        schema.mode,
        schema.tableName,
      ].join("|"),
    [selectedWorkspace, queryPolicy, timespanValue, schema.detected, schema.mode, schema.tableName],
  );
  const debouncedOverviewKey = useDebouncedValue(overviewRefreshKey, 300);

  useEffect(() => {
    if (inventoryLoading) {
      return;
    }
    if (policies.length === 1) {
      setQueryPolicyValue(policies[0]!.name);
      return;
    }
    if (policies.length > 1) {
      setQueryPolicyValue((current) => {
        if (current === WAF_ALL_POLICIES_VALUE) {
          return current;
        }
        return policies.some((policy) => policy.name === current)
          ? current
          : WAF_ALL_POLICIES_VALUE;
      });
    }
  }, [inventoryLoading, policies]);

  useEffect(() => {
    if (!overviewReady || !selectedWorkspace) {
      return;
    }
    const persisted = workspace.selectedAzureLogWorkspace?.trim();
    if (persisted === selectedWorkspace) {
      selectionSyncRef.current.workspace = selectedWorkspace;
      return;
    }
    if (selectionSyncRef.current.workspace === selectedWorkspace) {
      return;
    }
    selectionSyncRef.current.workspace = selectedWorkspace;
    onSelectWorkspace(selectedWorkspace);
  }, [
    overviewReady,
    selectedWorkspace,
    workspace.selectedAzureLogWorkspace,
    onSelectWorkspace,
  ]);

  useEffect(() => {
    if (inventoryLoading || !configPolicy) {
      return;
    }
    const sessionPolicy = workspace.selectedAzureWafPolicy?.trim();
    if (
      sessionPolicy === configPolicy &&
      policyDetail?.name === configPolicy
    ) {
      selectionSyncRef.current.policy = configPolicy;
      return;
    }
    if (!resolvedPolicy.needsSync || selectionSyncRef.current.policy === configPolicy) {
      return;
    }
    selectionSyncRef.current.policy = configPolicy;
    onSelectPolicy(configPolicy);
  }, [
    inventoryLoading,
    configPolicy,
    workspace.selectedAzureWafPolicy,
    policyDetail?.name,
    resolvedPolicy.needsSync,
    onSelectPolicy,
  ]);

  useEffect(() => {
    if (!selectedWorkspace || !onListSaved) {
      setSaved([]);
      return;
    }
    void onListSaved(selectedWorkspace).then(setSaved).catch(() => setSaved([]));
  }, [selectedWorkspace, onListSaved]);

  useEffect(() => {
    if (!selectedWorkspace.trim() || !workspace.azureWafLogSchema?.detected) {
      return;
    }
    if (getCachedWafLogSchema(selectedWorkspace)) {
      return;
    }
    setCachedWafLogSchema(selectedWorkspace, workspace.azureWafLogSchema);
    setSchemaRevision((current) => current + 1);
  }, [selectedWorkspace, workspace.azureWafLogSchema]);

  useEffect(() => {
    if (activeTab !== "logs" || !selectedWorkspace.trim() || !onProbeLogSchema) {
      return;
    }
    if (getCachedWafLogSchema(selectedWorkspace)) {
      return;
    }

    const token = ++schemaProbeTokenRef.current;
    const deferId = window.setTimeout(() => {
      setSchemaProbeHint("Checking log columns…");
      void onProbeLogSchema(selectedWorkspace, WAF_SCHEMA_PROBE_TIMESPAN)
        .then((probed) => {
          if (token !== schemaProbeTokenRef.current) {
            return;
          }
          setCachedWafLogSchema(selectedWorkspace, probed);
          setSchemaRevision((current) => current + 1);
        })
        .catch(() => undefined)
        .finally(() => {
          if (token === schemaProbeTokenRef.current) {
            setSchemaProbeHint(null);
          }
        });
    }, 0);

    return () => {
      window.clearTimeout(deferId);
      schemaProbeTokenRef.current += 1;
      setSchemaProbeHint(null);
    };
  }, [activeTab, onProbeLogSchema, selectedWorkspace]);

  const timeRangeLabel = useMemo(
    () => timespanLabelFor(timespanValue, WAF_TIMESPAN_OPTIONS),
    [timespanValue],
  );
  const timespan = timespanDurationFor(timespanValue, WAF_TIMESPAN_OPTIONS);

  const baseFilters = useMemo<WafLogFilters>(
    () => ({
      ...filters,
      policy: filters.policy ?? queryPolicy,
    }),
    [filters, queryPolicy],
  );

  const canRun = selectedWorkspace.trim() !== "" && query.trim() !== "" && !running;

  useEffect(() => {
    setPage(1);
    setHasNextPage(false);
  }, [query, timespanValue, pageSize, groupByFields, filters, queryPolicy]);

  async function run(activeQuery = query, nextPage = page) {
    if (!selectedWorkspace.trim() || !activeQuery.trim() || running) return;
    const token = ++runTokenRef.current;
    setRunning(true);
    setError(null);
    try {
      const built = buildExecutableWafQuery(activeQuery, schema, {
        groupByFields,
        page: nextPage,
        pageSize,
      });
      const queryResult = await onRunQuery(
        selectedWorkspace,
        built.query,
        timespan,
        built.maxRows,
      );
      if (token !== runTokenRef.current) return;
      const trimmedRows = trimWafQueryPageRows(queryResult.rows, built.pageSize);
      setResult({ ...queryResult, rows: trimmedRows });
      setHasNextPage(wafQueryHasNextPage(queryResult.rows.length, built.pageSize));
      setPage(nextPage);
    } catch (caught) {
      if (token !== runTokenRef.current) return;
      setError(caught instanceof Error ? caught.message : String(caught));
      setResult(null);
      setHasNextPage(false);
    } finally {
      if (token === runTokenRef.current) {
        setRunning(false);
      }
    }
  }

  function changePage(nextPage: number) {
    if (nextPage < 1 || running || !query.trim()) {
      return;
    }
    void run(query, nextPage);
  }

  function exportInvestigationBundle() {
    if (!result) {
      return;
    }
    const decodedRows = groupedResults
      ? undefined
      : result.rows.map((row) => decodeWafRow(result.columns, row, schema.columns));
    const bundle = buildWafInvestigationBundle({
      subscription: workspace.profile?.displayName,
      workspace: selectedWorkspace,
      query,
      timespan,
      timeRangeLabel,
      policyName: queryPolicy ?? configPolicy,
      schemaProfile: schema,
      result,
      decodedRows,
      page,
      pageSize,
      grouped: groupedResults,
    });
    downloadWafInvestigationBundle(bundle);
    notify("success", "SOC investigation bundle downloaded");
  }

  function toggleGroupByField(field: WafGroupByField, enabled: boolean) {
    setGroupByFields((current) => {
      if (enabled) {
        return current.includes(field) ? current : [...current, field];
      }
      return current.filter((entry) => entry !== field);
    });
  }

  function clearGroupByFields() {
    setGroupByFields([]);
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
    void run(nextQuery, 1);
  }

  function loadCurated(build: (schema: AzureWafLogSchemaProfile, filters?: WafLogFilters) => string) {
    setQuery(build(schema, baseFilters));
    setError(null);
    setPage(1);
  }

  function loadSavedEntry(entry: AzureLogAnalyticsSavedQuery) {
    setQuery(entry.query);
    if (entry.timespan != null) {
      setTimespanValue(timespanValueFor(entry.timespan, WAF_TIMESPAN_OPTIONS));
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
    void run(nextQuery, 1);
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

  function applyExclusionSuggestion(exclusion: AzureWafExclusion) {
    if (!canWrite) {
      return;
    }
    setNewExclusion({
      matchVariable: exclusion.matchVariable,
      selectorMatchOperator: exclusion.selectorMatchOperator,
      selector: exclusion.selector ?? "",
      ruleSetType: exclusion.ruleSetType,
    });
    setActiveTab("config");
    setAddExclusionOpen(true);
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
          WAF Security
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {workspace.profile?.displayName || "Subscription"} · Front Door WAF investigation and policy
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

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="logs">Logs</TabsTrigger>
          <TabsTrigger value="config">Config</TabsTrigger>
        </TabsList>

        <TabsContent value="logs" className="mt-4 space-y-4">
          {inventoryLoading ? (
            <InventoryLoadingState variant="banner" label={inventoryLoadingLabel} />
          ) : null}
          <WafOverviewPanel
            workspace={selectedWorkspace}
            policy={queryPolicy ?? ""}
            schema={schema}
            timespan={timespan}
            timeRangeLabel={timeRangeLabel}
            disabled={inventoryControlsBusy || !selectedWorkspace.trim()}
            ready={overviewReady}
            refreshKey={debouncedOverviewKey}
            onRunQuery={onRunQuery}
            onOpenBlocked={() => {
              const nextQuery = buildBlockedRequestsDetailQuery(schema, baseFilters);
              setQuery(nextQuery);
              setFilters((current) => ({ ...current, actions: ["Block", "block"] }));
              void run(nextQuery);
            }}
            onOpenRule={(ruleName) => {
              setFilters((current) => ({ ...current, ruleName }));
              const nextQuery = buildWafFilteredQuery(schema, {
                ...baseFilters,
                ruleName,
              });
              setQuery(nextQuery);
              void run(nextQuery);
            }}
          />
          <section className={cn(sectionCard, inventoryLoading ? "opacity-60" : undefined)}>
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-72">
                <div className={cn(fieldLabel, "mb-1")}>Workspace</div>
                <Select
                  value={selectedWorkspace}
                  disabled={inventoryControlsBusy}
                  onValueChange={(value) => {
                    if (!value) {
                      return;
                    }
                    selectionSyncRef.current.workspace = value;
                    setQueryPolicyValue(
                      policies.length === 1 ? policies[0]!.name : WAF_ALL_POLICIES_VALUE,
                    );
                    setResult(null);
                    setError(null);
                    onSelectWorkspace(value);
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
                    {WAF_TIMESPAN_OPTIONS.map((option) => (
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
                  value={queryPolicyValue}
                  disabled={inventoryControlsBusy || policies.length === 0}
                  onValueChange={(value) => {
                    if (!value) {
                      return;
                    }
                    setQueryPolicyValue(value);
                    if (value !== WAF_ALL_POLICIES_VALUE) {
                      selectionSyncRef.current.policy = value;
                      onSelectPolicy(value);
                    }
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
                    {policies.length > 1 ? (
                      <SelectItem value={WAF_ALL_POLICIES_VALUE}>All policies</SelectItem>
                    ) : null}
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
              {schemaProbeHint ? (
                <div className="mt-1 text-muted-foreground">{schemaProbeHint}</div>
              ) : null}
            </div>

            <div className="rounded-lg border border-border bg-muted/10 p-4 space-y-3">
              <div>
                <h3 className="text-sm font-semibold">Track a request</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Paste an X-Azure-Ref from a response header or support ticket.
                </p>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[280px] flex-1">
                  <div className={cn(fieldLabel, "mb-1")}>Tracking reference</div>
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
                  size="sm"
                  onClick={() => applyTrackingLookup("extend")}
                  disabled={!trackingRef.trim() || running}
                >
                  Look up ref
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => applyTrackingLookup("search")}
                  disabled={!trackingRef.trim() || running}
                >
                  Search table
                </Button>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-muted/10 p-4 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold">Filter logs</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Narrow the query before you run it. Policy filter uses the selection above.
                  </p>
                </div>
                <Button variant="secondary" size="sm" disabled={running} onClick={applyFilteredQuery}>
                  Apply filters to query
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <div className={cn(fieldLabel, "mb-1")}>Client IP</div>
                  <Input
                    value={filters.clientIP ?? ""}
                    onChange={(event) =>
                      setFilters((current) => ({ ...current, clientIP: event.target.value }))
                    }
                    placeholder="e.g. 203.0.113.10"
                  />
                </div>
                <div>
                  <div className={cn(fieldLabel, "mb-1")}>Host</div>
                  <Input
                    value={filters.host ?? ""}
                    onChange={(event) => setFilters((current) => ({ ...current, host: event.target.value }))}
                    placeholder="e.g. api.example.com"
                  />
                </div>
                <div>
                  <div className={cn(fieldLabel, "mb-1")}>Rule name</div>
                  <Input
                    value={filters.ruleName ?? ""}
                    onChange={(event) =>
                      setFilters((current) => ({ ...current, ruleName: event.target.value }))
                    }
                    placeholder="e.g. 942100"
                  />
                </div>
                <div>
                  <div className={cn(fieldLabel, "mb-1")}>URI contains</div>
                  <Input
                    value={filters.uriContains ?? ""}
                    onChange={(event) =>
                      setFilters((current) => ({ ...current, uriContains: event.target.value }))
                    }
                    placeholder="e.g. /api/login"
                  />
                </div>
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
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className={fieldLabel}>KQL query</div>
                <WafQueryRunControls
                  running={running}
                  canRun={canRun}
                  pageSize={pageSize}
                  onRun={() => void run(query, 1)}
                  onCancel={cancelRun}
                  onPageSizeChange={setPageSize}
                  onEditInLogAnalytics={() =>
                    onEditInLogAnalytics(selectedWorkspace, query, timespan)
                  }
                  editDisabled={!query.trim()}
                />
              </div>
              <div className="overflow-hidden rounded-lg border border-border bg-background">
                <KqlEditor
                  value={query}
                  onChange={setQuery}
                  onRun={() => void run(query, 1)}
                  disabled={running}
                  className="rounded-none border-0 focus-within:ring-0"
                />
                <WafQueryGroupByBar
                  running={running}
                  groupByFields={groupByFields}
                  groupByOptions={groupByOptions}
                  onToggleGroupBy={toggleGroupByField}
                  onClearGroupBy={clearGroupByFields}
                />
              </div>
            </div>

            {workspace.azureWafStatusMessage ? (
              <p className="text-sm text-muted-foreground">{workspace.azureWafStatusMessage}</p>
            ) : null}
          </section>

          <LogQueryResultPanel
            result={result}
            error={error}
            timeRangeLabel={timeRangeLabel}
            emptyTitle="No WAF log results yet"
            emptyDescription="Look up a tracking reference or run a curated WAF query."
            wafColumnMap={groupedResults ? undefined : schema.columns}
            pagination={
              result
                ? {
                    page,
                    pageSize,
                    hasNextPage,
                    onPageChange: changePage,
                    disabled: running,
                  }
                : undefined
            }
            onCorrelateTrackingRef={
              onCorrelateTrackingRef && schema.mode !== "applicationGateway"
                ? (trackingReference) =>
                    onCorrelateTrackingRef(trackingReference, selectedWorkspace, timespan)
                : undefined
            }
            onSuggestExclusion={canWrite ? applyExclusionSuggestion : undefined}
            onExportInvestigation={result ? exportInvestigationBundle : undefined}
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
                  value={configPolicy}
                  disabled={inventoryLoading || configLoading || policies.length === 0}
                  onValueChange={(value) => {
                    if (!value) {
                      return;
                    }
                    selectionSyncRef.current.policy = value;
                    setQueryPolicyValue(value);
                    onSelectPolicy(value);
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
            {writeDisabledReason ? (
              <p className="text-sm text-muted-foreground">{writeDisabledReason}</p>
            ) : null}

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