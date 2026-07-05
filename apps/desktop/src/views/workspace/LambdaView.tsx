// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useEffect, useMemo, useRef, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { Copy, Loader2, Play, Plus, RefreshCw, Server, Upload } from "lucide-react";

import { cn } from "@/lib/utils";
import { notify } from "@/lib/notify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { EmptyState } from "@/components/empty-state";
import {
  ResourceInspectorHeader,
  ResourceInspectorPanel,
  ResourceInventoryShell,
} from "@/components/inventory/resource-inspector";
import { ResourceTable } from "@/components/inventory/resource-table";
import { StatusPill } from "@/components/status-pill";
import type { Status } from "@/components/status-dot";
import { DetailFieldList } from "./detail-fields";
import { actionCapabilityState, actionDisabledReason } from "@/lib/action-capabilities";
import type {
  AwsLambdaCreateInput,
  AwsLambdaInvokeResult,
  LambdaCreateCodeSource,
  WorkspaceSnapshot,
} from "@/types/backend";

export type LambdaViewProps = {
  workspace: WorkspaceSnapshot;
  actionStatus: string;
  invokeResult: AwsLambdaInvokeResult | null;
  invokeInFlight: boolean;
  createInFlight?: boolean;
  onRefresh: () => void;
  onSelectRegion: (region: string) => void;
  onSelectFunction: (functionName: string) => void;
  onInvoke: (functionName: string, payload: unknown) => void;
  onCreate?: (input: AwsLambdaCreateInput) => void;
  onDeleteFunction?: (functionName: string) => void;
  openCreateForm?: boolean;
  onCreateFormOpenChange?: (open: boolean) => void;
};

const CODE_SOURCE_OPTIONS: Array<{ value: LambdaCreateCodeSource; label: string }> = [
  { value: "starter", label: "Starter template" },
  { value: "inline", label: "Inline handler" },
  { value: "zip", label: "Zip file" },
];

const RUNTIME_OPTIONS = [
  { value: "nodejs22.x", label: "Node.js 22" },
  { value: "nodejs20.x", label: "Node.js 20" },
  { value: "python3.12", label: "Python 3.12" },
  { value: "python3.11", label: "Python 3.11" },
] as const;

const DEFAULT_CREATE_RUNTIME = RUNTIME_OPTIONS[1].value;

type PendingLambdaInvoke = {
  functionName: string;
  payload: string;
};

type PendingLambdaCreate = AwsLambdaCreateInput;

const fieldLabel =
  "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

const sectionCard = "space-y-4 rounded-lg border border-border bg-card p-[18px] shadow-sm";

const snippetCard = "rounded-lg border border-border bg-muted/40 p-3";

const defaultPayload = '{\n  "test": true\n}';

/** Maps a Lambda function state onto the StatusPill palette. */
function lambdaStateStatus(state?: string): Status {
  const normalised = state?.toLowerCase();
  if (normalised === "active") {
    return "on";
  }
  if (normalised === "pending") {
    return "warning";
  }
  if (normalised === "inactive" || normalised === "failed") {
    return "error";
  }
  return "off";
}

function lambdaConsoleUrl(region: string | undefined, functionName: string): string {
  const consoleRegion = region || "us-east-1";
  return `https://${consoleRegion}.console.aws.amazon.com/lambda/home?region=${consoleRegion}#/functions/${functionName}?tab=code`;
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function copyToClipboard(value: string, label = "Copied to clipboard"): void {
  if (navigator.clipboard) {
    void navigator.clipboard.writeText(value).then(() => {
      notify("success", label);
    });
  }
}

function formatPayload(payload: string | undefined): string {
  if (!payload) {
    return "";
  }
  try {
    return JSON.stringify(JSON.parse(payload), null, 2);
  } catch {
    return payload;
  }
}

function isTauriDesktop(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function defaultHandlerForRuntime(runtime: string): string {
  if (runtime.startsWith("python")) {
    return "lambda_function.handler";
  }
  return "index.handler";
}

function defaultStarterSource(runtime: string): string {
  if (runtime.startsWith("python")) {
    return `def handler(event, context):
    return {
        "statusCode": 200,
        "body": "Hello from CloudSprocket",
    }
`;
  }
  return `exports.handler = async (event) => {
  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true, message: "Hello from CloudSprocket" }),
  };
};
`;
}

function validateFunctionName(name: string): string | undefined {
  const trimmed = name.trim();
  if (!trimmed) {
    return "Function name is required.";
  }
  if (!/^[a-zA-Z0-9-_]{1,64}$/.test(trimmed)) {
    return "Use 1-64 letters, numbers, hyphens, or underscores.";
  }
  return undefined;
}

function parsePayloadText(payloadText: string): { parsed?: unknown; error?: string } {
  const trimmed = payloadText.trim();
  if (!trimmed) {
    return { parsed: {} };
  }
  try {
    return { parsed: JSON.parse(trimmed) };
  } catch {
    return { error: "Payload must be valid JSON before invoking." };
  }
}

/**
 * v0.6 Lambda panel: regional inventory, describe + recent logs, and the one
 * safe write action (test invoke). Mirrors the Compute view layout patterns.
 */
export default function LambdaView({
  workspace,
  actionStatus,
  invokeResult,
  invokeInFlight,
  createInFlight = false,
  onRefresh,
  onSelectRegion,
  onSelectFunction,
  onInvoke,
  onCreate,
  onDeleteFunction,
  openCreateForm = false,
  onCreateFormOpenChange,
}: LambdaViewProps) {
  const [filterText, setFilterText] = useState("");
  const [pending, setPending] = useState<PendingLambdaInvoke | undefined>(undefined);
  const [pendingCreate, setPendingCreate] = useState<PendingLambdaCreate | undefined>(undefined);
  const [createFormOpen, setCreateFormOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createRuntime, setCreateRuntime] = useState<string>(DEFAULT_CREATE_RUNTIME);
  const [createHandler, setCreateHandler] = useState(defaultHandlerForRuntime(DEFAULT_CREATE_RUNTIME));
  const [createMemory, setCreateMemory] = useState("128");
  const [createTimeout, setCreateTimeout] = useState("30");
  const [createDescription, setCreateDescription] = useState("");
  const [createCodeSource, setCreateCodeSource] = useState<LambdaCreateCodeSource>("starter");
  const [createHandlerSource, setCreateHandlerSource] = useState(defaultStarterSource(DEFAULT_CREATE_RUNTIME));
  const [createZipSourcePath, setCreateZipSourcePath] = useState("");
  const [createZipLabel, setCreateZipLabel] = useState("");
  const [createError, setCreateError] = useState<string | undefined>(undefined);
  const [payloadText, setPayloadText] = useState(defaultPayload);
  const [payloadError, setPayloadError] = useState<string | undefined>(undefined);
  const [inspectorOpen, setInspectorOpen] = useState(Boolean(workspace.selectedLambdaFunctionName));
  const lastSelectedFunctionRef = useRef(workspace.selectedLambdaFunctionName || "");

  const regions =
    workspace.lambdaRegions.length > 0 ? workspace.lambdaRegions : workspace.ec2Regions;

  const selectedFunction = workspace.lambdaFunctions.find(
    (fn) => fn.functionName === workspace.selectedLambdaFunctionName,
  );

  const filteredFunctions = useMemo(() => {
    const query = filterText.trim().toLowerCase();
    if (!query) {
      return workspace.lambdaFunctions;
    }
    return workspace.lambdaFunctions.filter((fn) =>
      [fn.functionName, fn.runtime, fn.description, fn.state]
        .some((value) => value?.toLowerCase().includes(query)),
    );
  }, [filterText, workspace.lambdaFunctions]);

  const statusMessage =
    actionStatus || workspace.lambdaStatusMessage || "Lambda inventory is waiting for an open AWS workspace.";

  const isLocalEndpoint = Boolean(workspace.awsEndpointUrl);
  const showConsoleActions = !isLocalEndpoint && Boolean(selectedFunction);
  const invokeCapability = actionCapabilityState(workspace, "lambda", "invoke");
  const createCapability = actionCapabilityState(workspace, "lambda", "create");
  const deleteCapability = actionCapabilityState(workspace, "lambda", "deleteFunction");
  const canInvoke =
    invokeCapability.enabled &&
    !invokeInFlight &&
    !createInFlight &&
    Boolean(selectedFunction?.functionName);
  const canCreate =
    createCapability.enabled &&
    !invokeInFlight &&
    !createInFlight &&
    Boolean(onCreate) &&
    Boolean(workspace.selectedLambdaRegion);
  const invokeDisabledReason = canInvoke
    ? undefined
    : actionDisabledReason(
        workspace,
        "lambda",
        "invoke",
        !selectedFunction?.functionName ? "Select a function to invoke." : undefined,
      );
  const createDisabledReason = canCreate
    ? undefined
    : actionDisabledReason(
        workspace,
        "lambda",
        "create",
        !workspace.selectedLambdaRegion ? "Select a region before creating a function." : undefined,
      );

  useEffect(() => {
    if (openCreateForm) {
      setCreateFormOpen(true);
      onCreateFormOpenChange?.(false);
    }
  }, [openCreateForm, onCreateFormOpenChange]);

  useEffect(() => {
    const nextFunctionName = workspace.selectedLambdaFunctionName || "";
    if (nextFunctionName !== lastSelectedFunctionRef.current) {
      lastSelectedFunctionRef.current = nextFunctionName;
      setInspectorOpen(Boolean(nextFunctionName));
    }
  }, [workspace.selectedLambdaFunctionName]);

  const copySnippets = selectedFunction
    ? [
        {
          label: "Function name",
          value: selectedFunction.functionName,
        },
        {
          label: "AWS CLI invoke command",
          value: `aws lambda invoke --function-name ${selectedFunction.functionName}${
            workspace.selectedLambdaRegion ? ` --region ${workspace.selectedLambdaRegion}` : ""
          } --payload '${JSON.stringify({ test: true })}' response.json`,
        },
        ...(showConsoleActions
          ? [
              {
                label: "AWS Console URL",
                value: lambdaConsoleUrl(workspace.selectedLambdaRegion, selectedFunction.functionName),
              },
            ]
          : []),
        {
          label: "Function detail JSON",
          value: JSON.stringify(
            {
              region: workspace.selectedLambdaRegion,
              function: selectedFunction,
            },
            null,
            2,
          ),
        },
      ]
    : [];

  function handleInvokeClick(): void {
    if (!selectedFunction?.functionName || invokeInFlight) {
      return;
    }
    const { parsed, error } = parsePayloadText(payloadText);
    if (error || parsed === undefined) {
      setPayloadError(error);
      return;
    }
    setPayloadError(undefined);
    setPending({
      functionName: selectedFunction.functionName,
      payload: JSON.stringify(parsed, null, 2),
    });
  }

  function resetCreateForm(): void {
    setCreateName("");
    setCreateRuntime(DEFAULT_CREATE_RUNTIME);
    setCreateHandler(defaultHandlerForRuntime(DEFAULT_CREATE_RUNTIME));
    setCreateMemory("128");
    setCreateTimeout("30");
    setCreateDescription("");
    setCreateCodeSource("starter");
    setCreateHandlerSource(defaultStarterSource(DEFAULT_CREATE_RUNTIME));
    setCreateZipSourcePath("");
    setCreateZipLabel("");
    setCreateError(undefined);
  }

  async function chooseCreateZip(): Promise<void> {
    if (!isTauriDesktop()) {
      setCreateError("Zip upload is available in the desktop app.");
      return;
    }
    const selectedPath = await openDialog({
      multiple: false,
      directory: false,
      filters: [{ name: "Zip archive", extensions: ["zip"] }],
    });
    if (typeof selectedPath !== "string") {
      return;
    }
    setCreateZipSourcePath(selectedPath);
    setCreateZipLabel(selectedPath.split(/[\\/]/).pop() || selectedPath);
    setCreateError(undefined);
  }

  function handleCreateClick(): void {
    if (!canCreate) {
      return;
    }
    const nameError = validateFunctionName(createName);
    const memory = Number.parseInt(createMemory, 10);
    const timeout = Number.parseInt(createTimeout, 10);
    if (nameError) {
      setCreateError(nameError);
      return;
    }
    if (!Number.isFinite(memory) || memory < 128 || memory > 10240) {
      setCreateError("Memory must be between 128 and 10240 MB.");
      return;
    }
    if (!Number.isFinite(timeout) || timeout < 1 || timeout > 900) {
      setCreateError("Timeout must be between 1 and 900 seconds.");
      return;
    }
    const handler = createHandler.trim() || defaultHandlerForRuntime(createRuntime);
    const payload: AwsLambdaCreateInput = {
      functionName: createName.trim(),
      runtime: createRuntime,
      handler,
      memorySize: memory,
      timeout,
      description: createDescription.trim() || undefined,
    };
    if (createCodeSource === "inline") {
      if (!createHandlerSource.trim()) {
        setCreateError("Inline handler source is required.");
        return;
      }
      payload.handlerSource = createHandlerSource;
    } else if (createCodeSource === "zip") {
      if (!createZipSourcePath.trim()) {
        setCreateError("Choose a zip file before creating.");
        return;
      }
      payload.zipSourcePath = createZipSourcePath;
    }
    setCreateError(undefined);
    setCreateFormOpen(false);
    setPendingCreate(payload);
  }

  function confirmCreate(): void {
    if (!pendingCreate || !onCreate) {
      return;
    }
    onCreate(pendingCreate);
    setPendingCreate(undefined);
    setCreateFormOpen(false);
    resetCreateForm();
  }

  function confirmInvoke(): void {
    if (!pending) {
      return;
    }
    const { parsed, error } = parsePayloadText(pending.payload);
    if (error || parsed === undefined) {
      setPayloadError(error);
      setPending(undefined);
      return;
    }
    onInvoke(pending.functionName, parsed);
    setPending(undefined);
  }

  if (workspace.provider?.providerId && workspace.provider.providerId !== "aws") {
    return (
      <div className="p-6">
        <EmptyState
          icon={<Server />}
          title="Lambda requires an AWS workspace"
          description="Open an AWS profile from Connect to list and invoke functions (works on LocalStack and real AWS)."
        />
      </div>
    );
  }

  const tableEmptyState =
    workspace.lambdaFunctions.length === 0 ? (
      <EmptyState
        icon={<Server />}
        title="No functions"
        description={
          workspace.selectedLambdaRegion
            ? `No Lambda functions were returned for ${workspace.selectedLambdaRegion}.`
            : "Select a region to list Lambda functions."
        }
        className="border-0"
      />
    ) : (
      <EmptyState
        icon={<Server />}
        title="No matches"
        description="No Lambda functions match the current filter."
        className="border-0"
      />
    );

  const inspectorContent = selectedFunction ? (
    <ResourceInspectorPanel>
      <ResourceInspectorHeader
        icon={Server}
        eyebrow="Function"
        title={selectedFunction.functionName}
        onClose={() => setInspectorOpen(false)}
      />

      <DetailFieldList
        fields={[
          { label: "Runtime", value: selectedFunction.runtime || "Unknown" },
          {
            label: "Memory (MB)",
            value: selectedFunction.memorySize ? String(selectedFunction.memorySize) : "Unknown",
          },
          {
            label: "Timeout (s)",
            value: selectedFunction.timeout ? String(selectedFunction.timeout) : "Unknown",
          },
          { label: "Handler", value: selectedFunction.handler || "Unknown" },
          { label: "State", value: selectedFunction.state || "Unknown" },
          { label: "Last Modified", value: selectedFunction.lastModified || "Unknown" },
          { label: "Log Group", value: selectedFunction.logGroup || "Unknown" },
          { label: "Description", value: selectedFunction.description || "No description" },
        ]}
        emptyText="No function details are available."
      />

      {selectedFunction.recentLogs && selectedFunction.recentLogs.length > 0 ? (
        <div>
          <div className={fieldLabel}>Recent CloudWatch Logs</div>
          <div
            className={cn(
              snippetCard,
              "max-h-48 overflow-auto whitespace-pre-wrap font-mono text-[11px]",
            )}
          >
            {selectedFunction.recentLogs.join("\n")}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No recent CloudWatch log events were returned for this function.
        </p>
      )}

      <div>
        <div className={fieldLabel}>Test invoke (safe write action)</div>
        <Textarea
          className="mt-1 h-28 font-mono text-xs"
          value={payloadText}
          onChange={(event) => {
            setPayloadText(event.target.value);
            setPayloadError(undefined);
          }}
          placeholder='{"key": "value"}'
        />
        {payloadError ? (
          <p className="mt-1 text-xs text-destructive">{payloadError}</p>
        ) : null}
        {invokeDisabledReason ? (
          <p className="mt-1 text-xs text-muted-foreground">{invokeDisabledReason}</p>
        ) : null}
        <div className="mt-2 flex gap-2">
          <Button
            size="sm"
            disabled={!canInvoke}
            title={invokeDisabledReason}
            onClick={handleInvokeClick}
          >
            <Play className="mr-1 h-3 w-3" />
            Invoke
          </Button>
          {onDeleteFunction && selectedFunction ? (
            <Button
              size="sm"
              variant="destructive"
              disabled={!deleteCapability.enabled || invokeInFlight || createInFlight}
              title={deleteCapability.enabled ? undefined : deleteCapability.reason}
              onClick={() => onDeleteFunction(selectedFunction.functionName)}
            >
              Delete function
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setPayloadText(defaultPayload);
              setPayloadError(undefined);
            }}
          >
            Reset payload
          </Button>
        </div>
      </div>

      {invokeResult ? (
        <div>
          <div className={fieldLabel}>Last invoke result</div>
          <div className={snippetCard}>
            {invokeResult.error ? (
              <div className="text-xs text-destructive">Error: {invokeResult.error}</div>
            ) : (
              <div className="text-xs">
                Status: {invokeResult.statusCode}
                {invokeResult.executedVersion ? ` (v${invokeResult.executedVersion})` : ""}
              </div>
            )}
            {invokeResult.functionError ? (
              <div className="text-xs text-destructive">Error: {invokeResult.functionError}</div>
            ) : null}
            {invokeResult.logResult ? (
              <div className="mt-1 border-t pt-1 font-mono text-[10px] whitespace-pre-wrap">
                {invokeResult.logResult}
              </div>
            ) : null}
            {invokeResult.payload ? (
              <div className="mt-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-1 text-[10px]"
                  onClick={() => {
                    copyToClipboard(formatPayload(invokeResult.payload), "Response copied");
                  }}
                >
                  <Copy className="mr-1 h-3 w-3" />
                  Copy response
                </Button>
                <pre className="mt-1 max-h-32 overflow-auto rounded bg-background p-2 text-[10px]">
                  {formatPayload(invokeResult.payload)}
                </pre>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div>
        <div className={fieldLabel}>Copy actions</div>
        {copySnippets.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Select a function to generate copy actions.
          </p>
        ) : (
          <div className="mt-2 space-y-3">
            {copySnippets.map((snippet) => (
              <div key={snippet.label} className={snippetCard}>
                <div className="flex items-center justify-between gap-2">
                  <span className={fieldLabel}>{snippet.label}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      copyToClipboard(snippet.value, `${snippet.label} copied`);
                    }}
                  >
                    <Copy />
                    Copy
                  </Button>
                </div>
                <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-xs">
                  {snippet.value}
                </pre>
              </div>
            ))}
          </div>
        )}
      </div>
    </ResourceInspectorPanel>
  ) : null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-[1.375rem] font-[750] tracking-[-0.015em]">Lambda</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {countLabel(workspace.lambdaFunctions.length, "function", "functions")} ·{" "}
          {workspace.selectedLambdaRegion || "no region selected"}
        </p>
      </header>

      {invokeInFlight ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
          <Loader2 className="size-5 shrink-0 animate-spin text-primary" />
          <span className="font-medium">Lambda invoke running</span>
          <span className="text-muted-foreground">{actionStatus}</span>
        </div>
      ) : null}

      <section className={sectionCard}>
        <div>
          <h2 className="text-base font-bold">Lambda Fleet</h2>
          <p className="text-sm text-muted-foreground">
            Regional function inventory with configuration, recent logs, and a safe test invoke.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
            <div className={fieldLabel}>Selected Region</div>
            <p className="truncate text-sm">
              {workspace.selectedLambdaRegion || "No region selected"}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
            <div className={fieldLabel}>Selected Function</div>
            <p className="truncate text-sm font-mono">
              {selectedFunction?.functionName || "No function selected"}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
            <div className={fieldLabel}>Functions</div>
            <p className="truncate text-sm">
              {countLabel(workspace.lambdaFunctions.length, "function", "functions")}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
            <div className={fieldLabel}>Endpoint</div>
            <p className="truncate text-sm">
              {workspace.awsEndpointUrl || "Default AWS endpoint"}
            </p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{statusMessage}</p>
      </section>

      <section className={sectionCard}>
        <div>
          <h2 className="text-base font-bold">Function Inventory</h2>
          <p className="text-sm text-muted-foreground">
            Select a region, filter functions, then choose one for details, logs, and invoke.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="w-56">
            <div className={cn(fieldLabel, "mb-1")}>Region</div>
            <Select
              value={workspace.selectedLambdaRegion ?? ""}
              onValueChange={(value) => {
                if (value) {
                  onSelectRegion(value);
                }
              }}
            >
              <SelectTrigger aria-label="Select region">
                <SelectValue placeholder="Select region" />
              </SelectTrigger>
              <SelectContent>
                {regions.map((region) => (
                  <SelectItem key={region} value={region}>
                    {region}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="outline"
            disabled={!workspace.selectedLambdaRegion || invokeInFlight || createInFlight}
            onClick={onRefresh}
          >
            <RefreshCw />
            Refresh Lambda
          </Button>
          {onCreate ? (
            <Button
              disabled={!canCreate}
              title={createDisabledReason}
              onClick={() => {
                setCreateFormOpen(true);
              }}
            >
              <Plus />
              Create function
            </Button>
          ) : null}
          <div className="min-w-56 flex-1">
            <div className={cn(fieldLabel, "mb-1")}>Filter</div>
            <Input
              value={filterText}
              placeholder="Filter functions"
              onChange={(event) => {
                setFilterText(event.target.value);
              }}
            />
          </div>
          <div className="pb-2 text-xs text-muted-foreground">
            {filteredFunctions.length}/{workspace.lambdaFunctions.length} shown
          </div>
        </div>

        <ResourceInventoryShell
          table={
            <ResourceTable
              columns={[
                { id: "name", label: "Name" },
                { id: "runtime", label: "Runtime" },
                { id: "memory", label: "Memory" },
                { id: "lastModified", label: "Last Modified", cellClassName: "text-xs text-muted-foreground" },
                { id: "state", label: "State" },
              ]}
              rows={filteredFunctions}
              selectedKey={workspace.selectedLambdaFunctionName}
              getRowKey={(fn) => fn.functionName}
              onRowClick={(fn) => {
                onSelectFunction(fn.functionName);
                setInspectorOpen(true);
              }}
              renderCell={(fn, columnId) => {
                if (columnId === "name") {
                  return <span className="font-mono text-sm">{fn.functionName}</span>;
                }
                if (columnId === "runtime") {
                  return fn.runtime || "Unknown";
                }
                if (columnId === "memory") {
                  return fn.memorySize ? `${fn.memorySize} MB` : "Unknown";
                }
                if (columnId === "lastModified") {
                  return fn.lastModified || "Unknown";
                }
                if (columnId === "state") {
                  return (
                    <StatusPill
                      status={lambdaStateStatus(fn.state)}
                      label={fn.state || "Unknown"}
                    />
                  );
                }
                return null;
              }}
              emptyState={tableEmptyState}
            />
          }
          inspectorContent={inspectorContent}
          inspectorOpen={inspectorOpen}
          onInspectorOpenChange={setInspectorOpen}
          inspectorAriaLabel="Lambda function details"
        />

        {!invokeInFlight ? (
          <p className="text-sm text-muted-foreground">{statusMessage}</p>
        ) : null}
      </section>

      <AlertDialog
        open={createFormOpen}
        onOpenChange={(open) => {
          setCreateFormOpen(open);
          if (!open) {
            resetCreateForm();
          }
        }}
      >
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Create Lambda function</AlertDialogTitle>
            <AlertDialogDescription>
              Deploy a function to the selected local endpoint using a starter template, inline
              handler code, or a zip archive.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <div>
              <div className={fieldLabel}>Function name</div>
              <Input
                value={createName}
                placeholder="my-function"
                onChange={(event) => {
                  setCreateName(event.target.value);
                  setCreateError(undefined);
                }}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <div className={fieldLabel}>Runtime</div>
                <Select
                  value={createRuntime}
                  onValueChange={(value) => {
                    setCreateRuntime(value);
                    setCreateHandler(defaultHandlerForRuntime(value));
                    if (createCodeSource === "inline") {
                      setCreateHandlerSource(defaultStarterSource(value));
                    }
                  }}
                >
                  <SelectTrigger aria-label="Select runtime">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RUNTIME_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <div className={fieldLabel}>Handler</div>
                <Input
                  value={createHandler}
                  onChange={(event) => {
                    setCreateHandler(event.target.value);
                  }}
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <div className={fieldLabel}>Memory (MB)</div>
                <Input
                  value={createMemory}
                  inputMode="numeric"
                  onChange={(event) => {
                    setCreateMemory(event.target.value);
                  }}
                />
              </div>
              <div>
                <div className={fieldLabel}>Timeout (s)</div>
                <Input
                  value={createTimeout}
                  inputMode="numeric"
                  onChange={(event) => {
                    setCreateTimeout(event.target.value);
                  }}
                />
              </div>
            </div>
            <div>
              <div className={fieldLabel}>Description (optional)</div>
              <Input
                value={createDescription}
                onChange={(event) => {
                  setCreateDescription(event.target.value);
                }}
              />
            </div>
            <div>
              <div className={fieldLabel}>Code source</div>
              <Select
                value={createCodeSource}
                onValueChange={(value) => {
                  const source = value as LambdaCreateCodeSource;
                  setCreateCodeSource(source);
                  if (source === "inline") {
                    setCreateHandlerSource(defaultStarterSource(createRuntime));
                  }
                  if (source !== "zip") {
                    setCreateZipSourcePath("");
                    setCreateZipLabel("");
                  }
                  setCreateError(undefined);
                }}
              >
                <SelectTrigger aria-label="Select code source">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CODE_SOURCE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {createCodeSource === "inline" ? (
              <div>
                <div className={fieldLabel}>Handler source</div>
                <Textarea
                  className="h-36 font-mono text-xs"
                  value={createHandlerSource}
                  onChange={(event) => {
                    setCreateHandlerSource(event.target.value);
                  }}
                />
              </div>
            ) : null}
            {createCodeSource === "zip" ? (
              <div className="space-y-2">
                <div className={fieldLabel}>Deployment package</div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => void chooseCreateZip()}>
                    <Upload />
                    Choose zip
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {createZipLabel || "No zip selected"}
                  </span>
                </div>
                {!isTauriDesktop() ? (
                  <p className="text-xs text-muted-foreground">
                    Zip upload requires the desktop app. Use inline handler code in the browser mock.
                  </p>
                ) : null}
              </div>
            ) : null}
            {createError ? <p className="text-xs text-destructive">{createError}</p> : null}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleCreateClick}>Review create</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(pendingCreate)}
        onOpenChange={(open) => {
          if (!open) {
            setPendingCreate(undefined);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Lambda create</AlertDialogTitle>
            <AlertDialogDescription>
              This will create a new function on the selected local endpoint profile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <DetailFieldList
            fields={
              pendingCreate
                ? [
                    { label: "Function", value: pendingCreate.functionName },
                    { label: "Runtime", value: pendingCreate.runtime },
                    { label: "Handler", value: pendingCreate.handler || defaultHandlerForRuntime(pendingCreate.runtime) },
                    {
                      label: "Memory (MB)",
                      value: String(pendingCreate.memorySize ?? 128),
                    },
                    { label: "Timeout (s)", value: String(pendingCreate.timeout ?? 30) },
                    {
                      label: "Code source",
                      value: pendingCreate.zipSourcePath
                        ? "Zip file"
                        : pendingCreate.handlerSource
                          ? "Inline handler"
                          : "Starter template",
                    },
                    { label: "Region", value: workspace.selectedLambdaRegion || "Unknown" },
                    {
                      label: "Endpoint",
                      value: workspace.awsEndpointUrl || "Default AWS endpoint",
                    },
                  ]
                : []
            }
            emptyText="No create details are available."
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmCreate}>Create function</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(pending)}
        onOpenChange={(open) => {
          if (!open) {
            setPending(undefined);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Lambda invoke</AlertDialogTitle>
            <AlertDialogDescription>
              This will execute a test invocation against the selected profile endpoint.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <DetailFieldList
            fields={
              pending
                ? [
                    { label: "Function", value: pending.functionName },
                    { label: "Region", value: workspace.selectedLambdaRegion || "Unknown" },
                    {
                      label: "Endpoint",
                      value: workspace.awsEndpointUrl || "Default AWS endpoint",
                    },
                  ]
                : []
            }
            emptyText="No invoke details are available."
          />
          <div className="max-h-48 overflow-auto rounded border bg-muted/40 p-3 font-mono text-xs whitespace-pre-wrap">
            {pending?.payload}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmInvoke}>Invoke function</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}