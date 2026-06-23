// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useState } from "react";
import { Eye, EyeOff, KeyRound, Plus } from "lucide-react";

import { cn } from "@/lib/utils";
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
import { InventoryLoadingState } from "@/components/inventory-loading-state";
import { azureInventoryLoadingLabel } from "@/lib/azure-inventory";
import { EmptyState } from "@/components/empty-state";
import { StatusPill } from "@/components/status-pill";
import type { WorkspaceSnapshot } from "@/types/backend";

export type AzureKeyVaultViewProps = {
  workspace: WorkspaceSnapshot;
  inventoryLoading?: boolean;
  onSelectVault: (vaultName: string) => void;
  onReveal: (vaultName: string, secretName: string) => Promise<string>;
  onSetSecret: (vaultName: string, secretName: string, value: string) => Promise<void>;
};

const fieldLabel =
  "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";
const sectionCard = "space-y-4 rounded-lg border border-border bg-card p-[18px] shadow-sm";

export default function AzureKeyVaultView({
  workspace,
  inventoryLoading = false,
  onSelectVault,
  onReveal,
  onSetSecret,
}: AzureKeyVaultViewProps) {
  const vaults = workspace.azureKeyVaults ?? [];
  const secrets = workspace.azureKeyVaultSecrets ?? [];
  const selectedVault = workspace.selectedAzureKeyVault ?? vaults[0]?.name ?? "";
  const canWrite = workspace.azureWritesEnabled;

  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newValue, setNewValue] = useState("");

  async function reveal(secretName: string) {
    setError(null);
    try {
      const value = await onReveal(selectedVault, secretName);
      setRevealed((current) => ({ ...current, [secretName]: value }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  function hide(secretName: string) {
    setRevealed((current) => {
      const next = { ...current };
      delete next[secretName];
      return next;
    });
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-[1.375rem] font-[750] tracking-[-0.015em]">Key Vault</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {workspace.profile?.displayName || "Subscription"} · Secrets
        </p>
      </header>

      {inventoryLoading ? (
        <InventoryLoadingState
          variant="banner"
          label={azureInventoryLoadingLabel(workspace, "keyvault")}
        />
      ) : null}

      <section className={cn(sectionCard, inventoryLoading ? "opacity-60" : undefined)}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="w-72">
            <div className={cn(fieldLabel, "mb-1")}>Vault</div>
            <Select
              value={selectedVault}
              onValueChange={(value) => {
                if (value) onSelectVault(value);
              }}
            >
              <SelectTrigger aria-label="Select key vault">
                <SelectValue placeholder="Select vault" />
              </SelectTrigger>
              <SelectContent>
                {vaults.map((vault) => (
                  <SelectItem key={vault.name} value={vault.name}>
                    {vault.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <StatusPill
              status={canWrite ? "on" : "warning"}
              label={canWrite ? "Writes enabled" : "Read-only"}
            />
            {canWrite ? (
              <Button
                onClick={() => {
                  setNewName("");
                  setNewValue("");
                  setCreateOpen(true);
                }}
              >
                <Plus />
                Set secret
              </Button>
            ) : null}
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{workspace.azureKeyVaultStatusMessage}</p>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="overflow-hidden rounded-lg border border-border">
          {secrets.length === 0 ? (
            <EmptyState
              icon={<KeyRound />}
              title="No secrets"
              description="This vault has no secrets, or none could be listed."
              className="border-0"
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Enabled</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {secrets.map((secret) => {
                  const shown = revealed[secret.name];
                  return (
                    <TableRow key={secret.name}>
                      <TableCell className="font-medium">{secret.name}</TableCell>
                      <TableCell>
                        <StatusPill
                          status={secret.enabled ? "on" : "warning"}
                          label={secret.enabled ? "Enabled" : "Disabled"}
                        />
                      </TableCell>
                      <TableCell className="max-w-[280px] truncate font-mono text-xs">
                        {shown === undefined ? "••••••••" : shown || "(empty)"}
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => (shown === undefined ? void reveal(secret.name) : hide(secret.name))}
                          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        >
                          {shown === undefined ? <Eye className="size-3" /> : <EyeOff className="size-3" />}
                          {shown === undefined ? "Reveal" : "Hide"}
                        </button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </section>

      <AlertDialog open={createOpen} onOpenChange={setCreateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Set secret</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <div>
                  <div className={fieldLabel}>Name</div>
                  <Input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="db-password" />
                </div>
                <div>
                  <div className={fieldLabel}>Value</div>
                  <Input
                    value={newValue}
                    onChange={(event) => setNewValue(event.target.value)}
                    placeholder="secret value"
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!newName.trim()}
              onClick={() => {
                void onSetSecret(selectedVault, newName.trim(), newValue).catch((caught: unknown) => {
                  setError(caught instanceof Error ? caught.message : String(caught));
                });
                setCreateOpen(false);
              }}
            >
              Set
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
