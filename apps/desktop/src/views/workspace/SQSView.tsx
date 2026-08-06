// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, Inbox, RefreshCw } from "lucide-react";

import { formatEpochSeconds } from "@/lib/format";
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
import { actionCapabilityState, actionDisabledReason } from "@/lib/action-capabilities";
import { DetailFieldList } from "./detail-fields";
import type { AwsSqsPeekResult, WorkspaceSnapshot } from "@/types/backend";

export type SQSViewProps = {
  workspace: WorkspaceSnapshot;
  actionStatus: string;
  peekResult: AwsSqsPeekResult | null;
  peekInFlight: boolean;
  onRefresh: () => void;
  onSelectRegion: (region: string) => void;
  onSelectQueue: (queueUrl: string) => void;
  onPeek: (queueUrl: string) => void;
  onSendMessage: (queueUrl: string, messageBody: string) => void;
  onCreateQueue: (queueName: string) => void;
  onPurgeQueue?: (queueUrl: string) => void;
};

const fieldLabel =
  "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

const sectionCard = "space-y-4 rounded-lg border border-border bg-card p-[18px] shadow-sm";

const snippetCard = "rounded-lg border border-border bg-muted/40 p-3";

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

/**
 * v0.6 SQS panel: regional queue inventory, depth metrics, and a bounded peek
 * that receives messages with visibility timeout 0 (no delete).
 */
export default function SQSView({
  workspace,
  actionStatus,
  peekResult,
  peekInFlight,
  onRefresh,
  onSelectRegion,
  onSelectQueue,
  onPeek,
  onSendMessage,
  onCreateQueue,
  onPurgeQueue,
}: SQSViewProps) {
  const [filterText, setFilterText] = useState("");
  const [peekDialogOpen, setPeekDialogOpen] = useState(false);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [purgeConfirmOpen, setPurgeConfirmOpen] = useState(false);
  const [sendBody, setSendBody] = useState('{"event":"test"}');
  const [newQueueName, setNewQueueName] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(Boolean(workspace.selectedSqsQueueUrl));
  const lastSelectedQueueRef = useRef(workspace.selectedSqsQueueUrl || "");

  const regions =
    workspace.sqsRegions.length > 0
      ? workspace.sqsRegions
      : workspace.dynamodbRegions.length > 0
        ? workspace.dynamodbRegions
        : workspace.lambdaRegions.length > 0
          ? workspace.lambdaRegions
          : workspace.ec2Regions;

  const selectedQueue = workspace.sqsQueues.find(
    (queue) => queue.queueUrl === workspace.selectedSqsQueueUrl,
  );

  const filteredQueues = useMemo(() => {
    const query = filterText.trim().toLowerCase();
    if (!query) {
      return workspace.sqsQueues;
    }
    return workspace.sqsQueues.filter((queue) =>
      [queue.queueName, queue.queueUrl, queue.queueArn]
        .some((value) => value?.toLowerCase().includes(query)),
    );
  }, [filterText, workspace.sqsQueues]);

  const statusMessage =
    actionStatus ||
    workspace.sqsStatusMessage ||
    "SQS inventory is waiting for an open AWS workspace.";

  const peekCapability = actionCapabilityState(workspace, "sqs", "peek");
  const sendCapability = actionCapabilityState(workspace, "sqs", "sendMessage");
  const createQueueCapability = actionCapabilityState(workspace, "sqs", "createQueue");
  const purgeCapability = actionCapabilityState(workspace, "sqs", "purgeQueue");
  const canPeek = peekCapability.enabled && !!selectedQueue?.queueUrl && !peekInFlight;
  const canSend = sendCapability.enabled && !!selectedQueue?.queueUrl && !peekInFlight;
  const canCreateQueue = createQueueCapability.enabled && !!workspace.selectedSqsRegion && !peekInFlight;
  const canPurge =
    Boolean(onPurgeQueue) && purgeCapability.enabled && !!selectedQueue?.queueUrl && !peekInFlight;
  const peekDisabledReason = canPeek
    ? undefined
    : actionDisabledReason(
        workspace,
        "sqs",
        "peek",
        !selectedQueue?.queueUrl ? "Select a queue first." : undefined,
      );
  const sendDisabledReason = canSend
    ? undefined
    : actionDisabledReason(
        workspace,
        "sqs",
        "sendMessage",
        !selectedQueue?.queueUrl ? "Select a queue first." : undefined,
      );
  const createQueueDisabledReason = canCreateQueue
    ? undefined
    : actionDisabledReason(
        workspace,
        "sqs",
        "createQueue",
        !workspace.selectedSqsRegion ? "Select a region first." : undefined,
      );
  const purgeDisabledReason = canPurge
    ? undefined
    : actionDisabledReason(
        workspace,
        "sqs",
        "purgeQueue",
        !selectedQueue?.queueUrl ? "Select a queue first." : undefined,
      );

  const copySnippets = selectedQueue
    ? [
        { label: "Queue name", value: selectedQueue.queueName },
        { label: "Queue URL", value: selectedQueue.queueUrl },
        {
          label: "AWS CLI attributes command",
          value: `aws sqs get-queue-attributes --queue-url ${selectedQueue.queueUrl} --attribute-names All${
            workspace.selectedSqsRegion ? ` --region ${workspace.selectedSqsRegion}` : ""
          }`,
        },
        {
          label: "Queue detail JSON",
          value: JSON.stringify(
            {
              region: workspace.selectedSqsRegion,
              queue: selectedQueue,
            },
            null,
            2,
          ),
        },
      ]
    : [];

  useEffect(() => {
    const nextQueueUrl = workspace.selectedSqsQueueUrl || "";
    if (nextQueueUrl !== lastSelectedQueueRef.current) {
      lastSelectedQueueRef.current = nextQueueUrl;
      setInspectorOpen(Boolean(nextQueueUrl));
    }
  }, [workspace.selectedSqsQueueUrl]);

  if (workspace.provider?.providerId && workspace.provider.providerId !== "aws") {
    return (
      <div className="p-6">
        <EmptyState
          icon={<Inbox />}
          title="SQS requires an AWS workspace"
          description="Open an AWS profile from Connect to list queues and peek messages (works on LocalStack and real AWS)."
        />
      </div>
    );
  }

  const tableEmptyState =
    workspace.sqsQueues.length === 0 ? (
      <EmptyState
        icon={<Inbox />}
        title="No queues"
        description={
          workspace.selectedSqsRegion
            ? `No SQS queues were returned for ${workspace.selectedSqsRegion}.`
            : "Select a region to list SQS queues."
        }
        className="border-0"
      />
    ) : (
      <EmptyState
        icon={<Inbox />}
        title="No matches"
        description="No SQS queues match the current filter."
        className="border-0"
      />
    );

  const inspectorContent = selectedQueue ? (
    <ResourceInspectorPanel>
      <ResourceInspectorHeader
        icon={Inbox}
        eyebrow="Queue"
        title={selectedQueue.queueName}
        subtitle={selectedQueue.queueUrl}
        onClose={() => setInspectorOpen(false)}
      />

      <DetailFieldList
        fields={[
          {
            label: "Visible messages",
            value: String(selectedQueue.approximateNumberOfMessages ?? "Unknown"),
          },
          {
            label: "In flight",
            value: String(selectedQueue.approximateNumberOfMessagesNotVisible ?? "Unknown"),
          },
          {
            label: "Delayed",
            value: String(selectedQueue.approximateNumberOfMessagesDelayed ?? "Unknown"),
          },
          {
            label: "Visibility timeout",
            value:
              selectedQueue.visibilityTimeout != null
                ? `${selectedQueue.visibilityTimeout}s`
                : "Unknown",
          },
          {
            label: "Long polling",
            value:
              selectedQueue.receiveMessageWaitTimeSeconds != null
                ? `${selectedQueue.receiveMessageWaitTimeSeconds}s`
                : "Unknown",
          },
          {
            label: "Created",
            value: formatEpochSeconds(selectedQueue.createdTimestamp),
          },
          { label: "Queue ARN", value: selectedQueue.queueArn || "Unknown" },
        ]}
        emptyText="No queue details are available."
      />

      <div>
        <div className={fieldLabel}>Peek messages (safe write action)</div>
        <p className="mb-3 text-sm text-muted-foreground">
          Receives up to 10 messages with visibility timeout 0. Messages stay on the queue.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={!canPeek}
            title={peekDisabledReason}
            onClick={() => {
              setPeekDialogOpen(true);
            }}
          >
            Peek messages
          </Button>
          <Button
            variant="outline"
            disabled={!canSend}
            title={sendDisabledReason}
            onClick={() => {
              setSendDialogOpen(true);
            }}
          >
            Send message
          </Button>
          {onPurgeQueue ? (
            <Button
              variant="outline"
              disabled={!canPurge}
              title={
                canPurge
                  ? "Delete all messages currently in the queue"
                  : purgeDisabledReason || "Select a queue and enable write mode."
              }
              onClick={() => setPurgeConfirmOpen(true)}
            >
              Purge queue
            </Button>
          ) : null}
        </div>
        {peekDisabledReason || sendDisabledReason || purgeDisabledReason ? (
          <p className="mt-2 text-xs text-muted-foreground">
            {peekDisabledReason || sendDisabledReason || purgeDisabledReason}
          </p>
        ) : null}
      </div>

      {peekResult ? (
        <div>
          <div className={fieldLabel}>Last peek result</div>
          <p className="mb-2 text-sm text-muted-foreground">{peekResult.summary}</p>
          {peekResult.messages.length === 0 ? (
            <p className="text-sm text-muted-foreground">No messages were returned.</p>
          ) : (
            <div className="space-y-2">
              {peekResult.messages.map((message, index) => (
                <div key={`${message.messageId}-${index}`} className={snippetCard}>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="font-mono text-xs">{message.messageId}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-1 text-[10px]"
                      onClick={() => {
                        copyToClipboard(message.body, "Message copied");
                      }}
                    >
                      <Copy className="mr-1 h-3 w-3" />
                      Copy
                    </Button>
                  </div>
                  <pre className="max-h-32 overflow-auto whitespace-pre-wrap font-mono text-[10px]">
                    {message.body}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      <div>
        <div className={fieldLabel}>Copy actions</div>
        {copySnippets.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Select a queue to generate copy actions.
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
        <h1 className="text-[1.375rem] font-[750] tracking-[-0.015em]">SQS</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {countLabel(workspace.sqsQueues.length, "queue", "queues")} ·{" "}
          {workspace.selectedSqsRegion || "no region selected"}
        </p>
      </header>

      {peekInFlight ? (
        <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
          <span className="font-medium">SQS peek running</span>
          <span className="text-muted-foreground"> · receiving up to 10 messages without deleting them.</span>
        </div>
      ) : null}

      <section className={sectionCard}>
        <div>
          <h2 className="text-base font-bold">Queue Fleet</h2>
          <p className="text-sm text-muted-foreground">
            Regional queue inventory with depth, in-flight counts, and a safe peek action.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
            <div className={fieldLabel}>Selected Region</div>
            <p className="truncate text-sm">
              {workspace.selectedSqsRegion || "No region selected"}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
            <div className={fieldLabel}>Selected Queue</div>
            <p className="truncate text-sm font-mono">
              {selectedQueue?.queueName || "No queue selected"}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
            <div className={fieldLabel}>Queues</div>
            <p className="truncate text-sm">
              {countLabel(workspace.sqsQueues.length, "queue", "queues")}
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
          <h2 className="text-base font-bold">Queue Inventory</h2>
          <p className="text-sm text-muted-foreground">
            Select a region, filter queues, then choose one for attributes and peek.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="w-56">
            <div className={cn(fieldLabel, "mb-1")}>Region</div>
            <Select
              value={workspace.selectedSqsRegion ?? ""}
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
            disabled={!workspace.selectedSqsRegion || peekInFlight}
            onClick={onRefresh}
          >
            <RefreshCw />
            Refresh queues
          </Button>
          <Button
            variant="outline"
            disabled={!canCreateQueue}
            title={createQueueDisabledReason}
            onClick={() => {
              setCreateDialogOpen(true);
            }}
          >
            Create queue
          </Button>
          <div className="min-w-56 flex-1">
            <div className={cn(fieldLabel, "mb-1")}>Filter</div>
            <Input
              value={filterText}
              placeholder="Filter queues"
              onChange={(event) => {
                setFilterText(event.target.value);
              }}
            />
          </div>
          <div className="pb-2 text-xs text-muted-foreground">
            {filteredQueues.length}/{workspace.sqsQueues.length} shown
          </div>
        </div>

        <ResourceInventoryShell
          table={
            <ResourceTable
              columns={[
                { id: "name", label: "Name" },
                { id: "visible", label: "Visible" },
                { id: "inFlight", label: "In flight" },
                { id: "delayed", label: "Delayed" },
              ]}
              rows={filteredQueues}
              selectedKey={workspace.selectedSqsQueueUrl}
              getRowKey={(queue) => queue.queueUrl}
              onRowClick={(queue) => {
                onSelectQueue(queue.queueUrl);
                setInspectorOpen(true);
              }}
              renderCell={(queue, columnId) => {
                if (columnId === "name") {
                  return <span className="font-mono text-sm">{queue.queueName}</span>;
                }
                if (columnId === "visible") {
                  return queue.approximateNumberOfMessages ?? "Unknown";
                }
                if (columnId === "inFlight") {
                  return queue.approximateNumberOfMessagesNotVisible ?? "Unknown";
                }
                if (columnId === "delayed") {
                  return queue.approximateNumberOfMessagesDelayed ?? "Unknown";
                }
                return null;
              }}
              emptyState={tableEmptyState}
            />
          }
          inspectorContent={inspectorContent}
          inspectorOpen={inspectorOpen}
          onInspectorOpenChange={setInspectorOpen}
          inspectorAriaLabel="SQS queue details"
        />
      </section>

      <AlertDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Create SQS queue?</AlertDialogTitle>
            <AlertDialogDescription>
              Creates a new queue in {workspace.selectedSqsRegion || "the selected region"} on your
              local endpoint.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={newQueueName}
            placeholder="queue-name"
            onChange={(event) => {
              setNewQueueName(event.target.value);
            }}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const name = newQueueName.trim();
                if (name) {
                  onCreateQueue(name);
                  setNewQueueName("");
                }
                setCreateDialogOpen(false);
              }}
            >
              Create queue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send message?</AlertDialogTitle>
            <AlertDialogDescription>
              Sends a message to{" "}
              <span className="font-mono">{selectedQueue?.queueName}</span>. The message stays on
              the queue for consumers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={sendBody}
            rows={5}
            className="font-mono text-xs"
            onChange={(event) => {
              setSendBody(event.target.value);
            }}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (selectedQueue?.queueUrl && sendBody.trim()) {
                  onSendMessage(selectedQueue.queueUrl, sendBody);
                }
                setSendDialogOpen(false);
              }}
            >
              Send message
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={peekDialogOpen} onOpenChange={setPeekDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Peek SQS messages?</AlertDialogTitle>
            <AlertDialogDescription>
              This sends a bounded receive request to{" "}
              <span className="font-mono">{selectedQueue?.queueName}</span> with visibility timeout 0.
              Messages are not deleted, but they may briefly become invisible to other consumers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (selectedQueue?.queueUrl) {
                  onPeek(selectedQueue.queueUrl);
                }
                setPeekDialogOpen(false);
              }}
            >
              Peek messages
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={purgeConfirmOpen} onOpenChange={setPurgeConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Purge SQS queue?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes all messages from{" "}
              <span className="font-mono">{selectedQueue?.queueName}</span>. AWS allows at most one
              purge per queue every 60 seconds. In-flight messages may still be processed by
              consumers that already received them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!canPurge || !selectedQueue?.queueUrl}
              onClick={() => {
                if (selectedQueue?.queueUrl) {
                  onPurgeQueue?.(selectedQueue.queueUrl);
                }
                setPurgeConfirmOpen(false);
              }}
            >
              Purge queue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}