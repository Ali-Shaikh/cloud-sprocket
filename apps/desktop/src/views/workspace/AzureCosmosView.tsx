// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { cn } from "@/lib/utils";
import { Database } from "lucide-react";

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

export type AzureCosmosViewProps = {
  workspace: WorkspaceSnapshot;
  inventoryLoading?: boolean;
  onSelectAccount: (account: string) => void;
  onSelectDatabase: (database: string) => void;
  onSelectContainer: (container: string) => void;
};

const fieldLabel =
  "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";
const sectionCard = "space-y-4 rounded-lg border border-border bg-card p-[18px] shadow-sm";

export default function AzureCosmosView({
  workspace,
  inventoryLoading = false,
  onSelectAccount,
  onSelectDatabase,
  onSelectContainer,
}: AzureCosmosViewProps) {
  const accounts = workspace.azureCosmosAccounts ?? [];
  const databases = workspace.azureCosmosDatabases ?? [];
  const containers = workspace.azureCosmosContainers ?? [];
  const items = workspace.azureCosmosItems ?? [];
  const account = workspace.selectedAzureCosmosAccount ?? accounts[0]?.name ?? "";
  const database = workspace.selectedAzureCosmosDatabase ?? "";
  const container = workspace.selectedAzureCosmosContainer ?? "";

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-[1.375rem] font-[750] tracking-[-0.015em]">Cosmos DB</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {workspace.profile?.displayName || "Subscription"} · SQL API browse
        </p>
      </header>

      {inventoryLoading ? (
        <InventoryLoadingState
          variant="banner"
          label={azureInventoryLoadingLabel(workspace, "cosmos")}
        />
      ) : null}

      <section className={cn(sectionCard, inventoryLoading ? "opacity-60" : undefined)}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-60">
            <div className={cn(fieldLabel, "mb-1")}>Account</div>
            <Select value={account} onValueChange={(value) => value && onSelectAccount(value)}>
              <SelectTrigger aria-label="Select cosmos account">
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
          <div className="w-60">
            <div className={cn(fieldLabel, "mb-1")}>Database</div>
            <Select value={database} onValueChange={(value) => value && onSelectDatabase(value)}>
              <SelectTrigger aria-label="Select cosmos database">
                <SelectValue placeholder="Select database" />
              </SelectTrigger>
              <SelectContent>
                {databases.map((item) => (
                  <SelectItem key={item.name} value={item.name}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{workspace.azureCosmosStatusMessage}</p>
      </section>

      <section className={sectionCard}>
        <h2 className="text-base font-bold">Containers</h2>
        <div className="overflow-hidden rounded-lg border border-border">
          {containers.length === 0 ? (
            <EmptyState
              icon={<Database />}
              title="No containers"
              description="Select a database with containers to browse."
              className="border-0"
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Partition key</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {containers.map((item) => (
                  <TableRow
                    key={item.name}
                    data-state={item.name === container ? "selected" : undefined}
                    className="cursor-pointer"
                    onClick={() => onSelectContainer(item.name)}
                  >
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell className="font-mono text-xs">{item.partitionKey || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </section>

      <section className={sectionCard}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">Sample items{container ? ` · ${container}` : ""}</h2>
          {items.length > 0 ? (
            <span className="text-xs text-muted-foreground">{items.length} document(s)</span>
          ) : null}
        </div>
        {items.length === 0 ? (
          <EmptyState
            icon={<Database />}
            title="No items"
            description="Select a container to sample its documents."
            className="border-0"
          />
        ) : (
          <div className="space-y-2">
            {items.map((item, index) => (
              <details key={item.id || index} className="rounded-lg border border-border bg-muted/40">
                <summary className="cursor-pointer px-3 py-2 font-mono text-xs text-foreground">
                  {item.id || `(item ${index + 1})`}
                </summary>
                <pre className="max-h-64 overflow-auto border-t border-border px-3 py-2 font-mono text-xs text-foreground">
                  {item.json}
                </pre>
              </details>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
