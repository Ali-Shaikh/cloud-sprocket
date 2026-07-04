// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useState } from "react";
import { Play, Zap } from "lucide-react";

import { cn } from "@/lib/utils";
import { actionCapabilityState, actionDisabledReason } from "@/lib/action-capabilities";
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
import { InventoryLoadingState } from "@/components/inventory-loading-state";
import { azureInventoryLoadingLabel } from "@/lib/azure-inventory";
import { EmptyState } from "@/components/empty-state";
import { StatusPill } from "@/components/status-pill";
import type { AzureFunctionInvokeResult, WorkspaceSnapshot } from "@/types/backend";

export type AzureFunctionsViewProps = {
  workspace: WorkspaceSnapshot;
  inventoryLoading?: boolean;
  onSelectApp: (appName: string) => void;
  onSelectFunction: (functionName: string) => void;
  onInvoke: (appName: string, functionName: string, payload: string) => Promise<AzureFunctionInvokeResult>;
};

const fieldLabel =
  "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";
const sectionCard = "space-y-4 rounded-lg border border-border bg-card p-[18px] shadow-sm";

export default function AzureFunctionsView({
  workspace,
  inventoryLoading = false,
  onSelectApp,
  onSelectFunction,
  onInvoke,
}: AzureFunctionsViewProps) {
  const apps = workspace.azureFunctionApps ?? [];
  const functions = workspace.azureFunctions ?? [];
  const selectedApp = workspace.selectedAzureFunctionApp ?? apps[0]?.name ?? "";
  const selectedFunction = workspace.selectedAzureFunction ?? "";
  const invokeCapability = actionCapabilityState(workspace, "functions", "invoke", "azure");
  const canWrite = invokeCapability.enabled;

  const [payload, setPayload] = useState('{\n  "name": "world"\n}');
  const [invoking, setInvoking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AzureFunctionInvokeResult | null>(null);

  const canInvoke =
    invokeCapability.enabled && selectedApp !== "" && selectedFunction !== "" && !invoking;
  const invokeDisabledReason = canInvoke
    ? undefined
    : actionDisabledReason(
        workspace,
        "functions",
        "invoke",
        selectedApp === ""
          ? "Select a function app first."
          : selectedFunction === ""
            ? "Select a function to invoke."
            : undefined,
        "azure",
      );

  async function invoke() {
    if (!canInvoke) return;
    setInvoking(true);
    setError(null);
    try {
      setResult(await onInvoke(selectedApp, selectedFunction, payload));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setResult(null);
    } finally {
      setInvoking(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-[1.375rem] font-[750] tracking-[-0.015em]">Functions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {workspace.profile?.displayName || "Subscription"} · Azure Functions
        </p>
      </header>

      {inventoryLoading ? (
        <InventoryLoadingState
          variant="banner"
          label={azureInventoryLoadingLabel(workspace, "functions")}
        />
      ) : null}

      <section className={cn(sectionCard, inventoryLoading ? "opacity-60" : undefined)}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-72">
            <div className={cn(fieldLabel, "mb-1")}>Function app</div>
            <Select
              value={selectedApp}
              onValueChange={(value) => {
                if (value) onSelectApp(value);
              }}
            >
              <SelectTrigger aria-label="Select function app">
                <SelectValue placeholder="Select function app" />
              </SelectTrigger>
              <SelectContent>
                {apps.map((app) => (
                  <SelectItem key={app.name} value={app.name}>
                    {app.name}
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
        <p className="text-sm text-muted-foreground">{workspace.azureFunctionsStatusMessage}</p>
        <div className="overflow-hidden rounded-lg border border-border">
          {inventoryLoading && apps.length === 0 ? (
            <InventoryLoadingState
              label={azureInventoryLoadingLabel(workspace, "functions")}
              className="border-0 bg-transparent"
            />
          ) : functions.length === 0 ? (
            <EmptyState
              icon={<Zap />}
              title="No functions"
              description="No functions were found in the selected Function App."
              className="border-0"
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Trigger</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {functions.map((fn) => (
                  <TableRow
                    key={fn.name}
                    data-state={fn.name === selectedFunction ? "selected" : undefined}
                    className="cursor-pointer"
                    onClick={() => onSelectFunction(fn.name)}
                  >
                    <TableCell className="font-medium">{fn.name}</TableCell>
                    <TableCell>{fn.trigger || "Unknown"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </section>

      <section className={sectionCard}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-bold">Invoke</h2>
          <Button
            onClick={() => void invoke()}
            disabled={!canInvoke}
            title={invokeDisabledReason}
          >
            <Play />
            {invoking ? "Invoking…" : "Invoke"}
          </Button>
        </div>
        {invokeDisabledReason ? (
          <p className="text-sm text-muted-foreground">{invokeDisabledReason}</p>
        ) : null}
        <div>
          <div className={cn(fieldLabel, "mb-1")}>
            Request body{selectedFunction ? ` · ${selectedFunction}` : ""}
          </div>
          <textarea
            value={payload}
            onChange={(event) => setPayload(event.target.value)}
            spellCheck={false}
            rows={5}
            aria-label="Function payload"
            className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {result ? (
          <div className="space-y-2">
            <StatusPill
              status={result.statusCode >= 200 && result.statusCode < 300 ? "on" : "warning"}
              label={`HTTP ${result.statusCode}`}
            />
            <pre className="max-h-64 overflow-auto rounded-lg border border-border bg-muted px-3 py-2 font-mono text-xs text-foreground">
              {result.body || "(empty response)"}
            </pre>
          </div>
        ) : null}
      </section>
    </div>
  );
}
