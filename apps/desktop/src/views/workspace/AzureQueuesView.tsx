// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { cn } from "@/lib/utils";
import { Inbox } from "lucide-react";

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
};

const fieldLabel =
  "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";
const sectionCard = "space-y-4 rounded-lg border border-border bg-card p-[18px] shadow-sm";

export default function AzureQueuesView({
  workspace,
  inventoryLoading = false,
  onSelectAccount,
  onSelectQueue,
}: AzureQueuesViewProps) {
  const accounts = workspace.azureStorageAccounts ?? [];
  const queues = workspace.azureStorageQueues ?? [];
  const messages = workspace.azureQueueMessages ?? [];
  const account = workspace.selectedAzureStorageAccount ?? accounts[0]?.name ?? "";
  const queue = workspace.selectedAzureQueue ?? "";

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
          <Select value={account} onValueChange={(value) => value && onSelectAccount(value)}>
            <SelectTrigger aria-label="Select storage account">
              <SelectValue placeholder="Select account" />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((item) => (
                <SelectItem key={item.name} value={item.name}>
                  {item.name}
                </SelectItem>
              ))}
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
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">Messages{queue ? ` · ${queue}` : ""}</h2>
          {messages.length > 0 ? (
            <span className="text-xs text-muted-foreground">peeked {messages.length}</span>
          ) : null}
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
                    <TableCell className="font-mono text-xs">{message.insertionTime || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </section>
    </div>
  );
}
