import { useState } from "react";
import { Copy, Loader2, Play, RefreshCw, Server } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
import { StatusPill } from "@/components/status-pill";
import type { Status } from "@/components/status-dot";
import { DetailFieldList } from "./detail-fields";
import type { WorkspaceSnapshot } from "@/types/backend";

export type LambdaViewProps = {
  workspace: WorkspaceSnapshot;
  actionStatus: string;
  invokeResult: any;
  invokeInFlight: boolean;
  onRefresh: () => void;
  onSelectRegion: (region: string) => void;
  onSelectFunction: (functionName: string) => void;
  onInvoke: (functionName: string, payload: unknown) => void;
};

type PendingLambdaInvoke = {
  functionName: string;
  payload: string;
};

const sectionCard = "space-y-4 rounded-lg border border-border bg-card p-[18px] shadow-sm";
const fieldLabel = "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";
const snippetCard = "rounded-lg border border-border bg-muted/40 p-3";

function lambdaStatus(state?: string): Status {
  if (state === "Active" || state === "active") return "on";
  if (state === "Pending" || state === "pending") return "warning";
  if (state === "Inactive" || state === "Failed" || state === "inactive" || state === "failed") return "error";
  return "off";
}

function copyToClipboard(value: string): void {
  if (navigator.clipboard) void navigator.clipboard.writeText(value);
}

function formatPayload(p: unknown): string {
  if (typeof p === "string") return p;
  try { return JSON.stringify(p, null, 2); } catch { return String(p); }
}

export default function LambdaView({
  workspace,
  actionStatus,
  invokeResult,
  invokeInFlight,
  onRefresh,
  onSelectRegion,
  onSelectFunction,
  onInvoke,
}: LambdaViewProps) {
  const [filterText, setFilterText] = useState("");
  const [pending, setPending] = useState<PendingLambdaInvoke | undefined>(undefined);
  const [payloadText, setPayloadText] = useState('{\n  "test": true\n}');

  const selectedFnName = workspace.selectedLambdaFunctionName;
  const selected = workspace.lambdaFunctions?.find((f) => f.functionName === selectedFnName) ??
    workspace.lambdaFunctions?.[0];

  const filtered = (workspace.lambdaFunctions || []).filter((f) =>
    !filterText || f.functionName.toLowerCase().includes(filterText.toLowerCase()) || (f.runtime || "").toLowerCase().includes(filterText.toLowerCase())
  );

  const region = workspace.selectedLambdaRegion || (workspace.lambdaRegions?.[0] ?? workspace.ec2Regions?.[0] ?? "");

  function handleInvokeClick() {
    if (!selected?.functionName) return;
    let parsed: unknown = {};
    try { parsed = JSON.parse(payloadText || "{}"); } catch { parsed = { raw: payloadText }; }
    setPending({ functionName: selected.functionName, payload: JSON.stringify(parsed, null, 2) });
  }

  function confirmInvoke() {
    if (!pending) return;
    let p: unknown = {};
    try { p = JSON.parse(pending.payload); } catch { p = pending.payload; }
    onInvoke(pending.functionName, p);
    setPending(undefined);
  }

  const isAWS = !!workspace.profile && (workspace.provider?.providerId === "aws" || !workspace.provider);

  if (!isAWS) {
    return (
      <div className="p-6">
        <EmptyState icon={<Server />} title="Lambda requires an AWS workspace" description="Open an AWS profile from Connect to list and invoke functions (works on LocalStack and real AWS)." />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Lambda Functions</h2>
          <p className="text-sm text-muted-foreground">Regional list, config + recent logs, safe test invoke (read-mostly; one write action).</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={region || undefined} onValueChange={(r) => onSelectRegion(r)}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Region" /></SelectTrigger>
            <SelectContent>
              {(workspace.lambdaRegions?.length ? workspace.lambdaRegions : workspace.ec2Regions || []).map((r) => (
                <SelectItem key={r} value={r}>{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={!region}>
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh
          </Button>
        </div>
      </div>

      {!region ? (
        <EmptyState icon={<Server />} title="Select a region" description="Choose an AWS region to list Lambda functions (LocalStack or real)." />
      ) : (
        <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-5">
          {/* List */}
          <div className={cn(sectionCard, "lg:col-span-3")}>
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">Functions in {region}</div>
              <input
                className="h-8 w-48 rounded border bg-background px-2 text-sm"
                placeholder="Filter name or runtime..."
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
              />
            </div>
            <div className="max-h-[420px] overflow-auto rounded border">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Runtime</TableHead>
                  <TableHead>Memory</TableHead>
                  <TableHead>Last Modified</TableHead>
                  <TableHead>State</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {filtered.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-muted-foreground">No functions{filterText ? " match filter" : ""}.</TableCell></TableRow>
                  )}
                  {filtered.map((fn) => (
                    <TableRow
                      key={fn.functionName}
                      className={cn("cursor-pointer", selected?.functionName === fn.functionName && "bg-muted/50")}
                      onClick={() => onSelectFunction(fn.functionName)}
                    >
                      <TableCell className="font-mono text-sm">{fn.functionName}</TableCell>
                      <TableCell>{fn.runtime || "—"}</TableCell>
                      <TableCell>{fn.memorySize ? `${fn.memorySize} MB` : "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{fn.lastModified || "—"}</TableCell>
                      <TableCell><StatusPill status={lambdaStatus(fn.state)} label={fn.state || "Unknown"} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="text-[11px] text-muted-foreground">{actionStatus}</div>
          </div>

          {/* Detail + Invoke */}
          <div className={cn(sectionCard, "lg:col-span-2 space-y-4")}>
            <div>
              <div className="flex items-center justify-between">
                <div className={fieldLabel}>Selected function</div>
                {selected && (
                  <Button size="sm" variant="outline" onClick={() => copyToClipboard(selected.functionName)}>
                    <Copy className="mr-1 h-3 w-3" /> Copy name
                  </Button>
                )}
              </div>
              <div className="mt-1 font-mono text-sm">{selected?.functionName || "—"}</div>
            </div>

            {selected && (
              <>
                <div>
                  <div className={fieldLabel}>Configuration</div>
                  <DetailFieldList fields={[
                    { label: "Runtime", value: selected.runtime || "—" },
                    { label: "Memory (MB)", value: selected.memorySize ? String(selected.memorySize) : "—" },
                    { label: "Timeout (s)", value: selected.timeout ? String(selected.timeout) : "—" },
                    { label: "Handler", value: selected.handler || "—" },
                    { label: "State", value: selected.state || "—" },
                    { label: "Last Modified", value: selected.lastModified || "—" },
                    { label: "Log Group", value: selected.logGroup || "—" },
                  ]} emptyText="No configuration details." />
                </div>

                {selected.recentLogs && selected.recentLogs.length > 0 && (
                  <div>
                    <div className={fieldLabel}>Recent CloudWatch Logs (tail)</div>
                    <div className={cn(snippetCard, "max-h-40 overflow-auto text-[11px] font-mono whitespace-pre-wrap")}>
                      {selected.recentLogs.join("\n")}
                    </div>
                  </div>
                )}

                {/* Invoke (the single safe write) */}
                <div>
                  <div className={fieldLabel}>Test invoke (safe write action)</div>
                  <Textarea
                    className="mt-1 h-24 font-mono text-xs"
                    value={payloadText}
                    onChange={(e) => setPayloadText(e.target.value)}
                    placeholder='{"key": "value"}'
                  />
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" onClick={handleInvokeClick} disabled={invokeInFlight || !selected.functionName}>
                      <Play className="mr-1 h-3 w-3" /> Invoke
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setPayloadText('{\n  "test": true\n}')}>Reset payload</Button>
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">{actionStatus}</div>
                </div>

                {invokeResult && (
                  <div>
                    <div className={fieldLabel}>Last invoke result</div>
                    <div className={snippetCard}>
                      <div className="text-xs">Status: {invokeResult.statusCode} {invokeResult.executedVersion ? `(v${invokeResult.executedVersion})` : ""}</div>
                      {invokeResult.functionError && <div className="text-xs text-destructive">Error: {invokeResult.functionError}</div>}
                      {invokeResult.logResult && (
                        <div className="mt-1 text-[10px] font-mono whitespace-pre-wrap border-t pt-1">{invokeResult.logResult}</div>
                      )}
                      {invokeResult.payload && (
                        <div className="mt-1">
                          <Button size="sm" variant="ghost" className="h-6 px-1 text-[10px]" onClick={() => copyToClipboard(formatPayload(invokeResult.payload))}>
                            <Copy className="mr-1 h-3 w-3" /> Copy response
                          </Button>
                          <pre className="mt-1 max-h-32 overflow-auto rounded bg-background p-2 text-[10px]">{formatPayload(invokeResult.payload)}</pre>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}

            {!selected && <div className="text-sm text-muted-foreground">Select a function from the list to view details and invoke.</div>}
          </div>
        </div>
      )}

      <AlertDialog open={!!pending} onOpenChange={() => setPending(undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Lambda invoke</AlertDialogTitle>
            <AlertDialogDescription>
              This will execute <span className="font-mono">{pending?.functionName}</span> with the payload below. This is a test invocation only.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded border bg-muted/40 p-3 text-xs font-mono whitespace-pre-wrap max-h-48 overflow-auto">{pending?.payload}</div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmInvoke}>Invoke function</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
