// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useState } from "react";
import { formatTimestamp } from "@/lib/format";
import { actionCapabilityState } from "@/lib/action-capabilities";
import { cn } from "@/lib/utils";
import { Inbox } from "lucide-react";

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
import type { WorkspaceSnapshot } from "@/types/backend";

export type AzureQueuesViewProps = {
  workspace: WorkspaceSnapshot;
  inventoryLoading?: boolean;
  onSelectAccount: (account: string) => void;
  onSelectQueue: (queue: string) => void;
  onPurgeQueue?: (account: string, queue: string) => void;
};

const fieldLabel =
  "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";
const sectionCard = "space-y-4 rounded-lg border border-border bg-card p-[18px] shadow-sm";

export default function AzureQueuesView({
  workspace,
  inventoryLoading = false,
  onSelectAccount,
  onSelectQueue,
  onPurgeQueue,
}: AzureQueuesViewProps) {
  const accounts = workspace.azureStorageAccounts ?? [];
  const queues = workspace.azureStorageQueues ?? [];
  const messages = workspace.azureQueueMessages ?? [];
  const account = workspace.selectedAzureStorageAccount ?? accounts[0]?.name ?? "";
  const queue = workspace.selectedAzureQueue ?? "";
  const [purgeConfirmOpen, setPurgeConfirmOpen] = useState(false);
  const purgeCapability = actionCapabilityState(workspace, "queues", "purge", "azure");
  const canPurge = Boolean(onPurgeQueue && account && queue && purgeCapability.enabled);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-[1.375rem] font-[750] tracking-[-0.015em]">Queues</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {workspace.profile?.displayName || "Subscription"} · Storage queues
        </p>
      </header>

      {inventoryLoading ? (
        <InventoryLoadingState
          variant="banner"
          label={azureInventoryLoadingLabel(workspace, "queues")}
        />
      ) : null}

      <section className={cn(sectionCard, inventoryLoading ? "opacity-60" : undefined)}>
        <div className="w-72">
          <div className={cn(fieldLabel, "mb-1")}>Storage account</div>
          <Select
            value={account || undefined}
            onValueChange={(value) => value && onSelectAccount(value)}
            disabled={accounts.length === 0}
          >
            <SelectTrigger aria-label="Select storage account">
              <SelectValue
                placeholder={accounts.length === 0 ? "No accounts loaded" : "Select account"}
              />
            </SelectTrigger>
            <SelectContent>
              {accounts.length === 0 ? (
                <div className="px-2 py-1.5 text-sm text-muted-foreground">
                  No storage accounts available. Confirm the Azure workspace inventory loaded.
                </div>
              ) : (
                accounts.map((item) => (
                  <SelectItem key={item.name} value={item.name}>
                    {item.name}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
        <p className="text-sm text-muted-foreground">{workspace.azureQueuesStatusMessage}</p>
        <div className="overflow-hidden rounded-lg border border-border">
          {queues.length === 0 ? (
            <EmptyState
              icon={<Inbox />}
              title="No queues"
              description="This storage account has no queues."
              className="border-0"
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Queue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queues.map((item) => (
                  <TableRow
                    key={item.name}
                    data-state={item.name === queue ? "selected" : undefined}
                    className="cursor-pointer"
                    onClick={() => onSelectQueue(item.name)}
                  >
                    <TableCell className="font-medium">{item.name}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </section>

      <section className={sectionCard}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-bold">Messages{queue ? ` · ${queue}` : ""}</h2>
          <div className="flex flex-wrap items-center gap-2">
            {messages.length > 0 ? (
              <span className="text-xs text-muted-foreground">peeked {messages.length}</span>
            ) : null}
            {onPurgeQueue ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!canPurge}
                title={
                  canPurge
                    ? "Delete all messages in this queue"
                    : purgeCapability.reason || "Select a queue and enable write mode."
                }
                onClick={() => setPurgeConfirmOpen(true)}
              >
                Purge queue
              </Button>
            ) : null}
          </div>
        </div>
        <div className="overflow-hidden rounded-lg border border-border">
          {messages.length === 0 ? (
            <EmptyState
              icon={<Inbox />}
              title="No messages"
              description="Select a queue to peek its messages (read-only, without consuming)."
              className="border-0"
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Message ID</TableHead>
                  <TableHead>Text</TableHead>
                  <TableHead>Dequeue count</TableHead>
                  <TableHead>Inserted</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {messages.map((message, index) => (
                  <TableRow key={message.id || index}>
                    <TableCell className="font-mono text-xs">{message.id}</TableCell>
                    <TableCell className="max-w-[320px] truncate font-mono text-xs">{message.text}</TableCell>
                    <TableCell>{message.dequeueCount}</TableCell>
                    <TableCell
                      className="text-xs"
                      title={message.insertionTime || undefined}
                    >
                      {message.insertionTime
                        ? formatTimestamp(message.insertionTime)
                        : "Unknown"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </section>

      <AlertDialog open={purgeConfirmOpen} onOpenChange={setPurgeConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Purge queue messages?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes all messages from queue{" "}
              <span className="font-medium">{queue || "the selected queue"}</span> in{" "}
              <span className="font-medium">{account || "the selected account"}</span>. This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!canPurge}
              onClick={() => {
                if (!account || !queue) {
                  return;
                }
                onPurgeQueue?.(account, queue);
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
