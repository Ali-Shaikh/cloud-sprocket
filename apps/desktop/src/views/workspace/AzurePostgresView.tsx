// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useState } from "react";
import { Copy, Database } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
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
import type { WorkspaceSnapshot } from "@/types/backend";

export type AzurePostgresViewProps = {
  workspace: WorkspaceSnapshot;
  inventoryLoading?: boolean;
  onSelectServer: (server: string) => void;
};

const fieldLabel =
  "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";
const sectionCard = "space-y-4 rounded-lg border border-border bg-card p-[18px] shadow-sm";

function copyText(value: string) {
  if (!navigator.clipboard || !value) {
    return;
  }
  void navigator.clipboard.writeText(value);
}

function isLocalFlociProfile(workspace: WorkspaceSnapshot): boolean {
  return (workspace.profile?.attributes ?? []).some(
    (field) =>
      field.label === "Tenant ID" &&
      field.value?.toLowerCase() === "cloudsprocket-local",
  );
}

function ConnectionField({
  label,
  value,
  revealed,
}: {
  label: string;
  value: string;
  revealed: boolean;
}) {
  const display = revealed ? value : "••••••••";
  return (
    <div className="space-y-1">
      <div className={fieldLabel}>{label}</div>
      <div className="flex items-start gap-2">
        <pre className="min-h-10 flex-1 overflow-auto rounded-lg border border-border bg-muted/40 px-3 py-2 font-mono text-xs break-all whitespace-pre-wrap">
          {display || "—"}
        </pre>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!value || !revealed}
          onClick={() => copyText(value)}
          aria-label={`Copy ${label}`}
        >
          <Copy />
          Copy
        </Button>
      </div>
    </div>
  );
}

export default function AzurePostgresView({
  workspace,
  inventoryLoading = false,
  onSelectServer,
}: AzurePostgresViewProps) {
  const servers = workspace.azurePostgresServers ?? [];
  const selectedServer =
    workspace.selectedAzurePostgresServer ?? servers[0]?.name ?? "";
  const active =
    servers.find((server) => server.name === selectedServer) ?? servers[0];
  const connection = workspace.azurePostgresConnection;
  const localProfile = isLocalFlociProfile(workspace);
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-[1.375rem] font-[750] tracking-[-0.015em]">PostgreSQL</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {workspace.profile?.displayName || "Subscription"} · Flexible Server
        </p>
      </header>

      {inventoryLoading ? (
        <InventoryLoadingState
          variant="banner"
          label={azureInventoryLoadingLabel(workspace, "postgres")}
        />
      ) : null}

      <section className={cn(sectionCard, inventoryLoading ? "opacity-60" : undefined)}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-bold">Flexible servers</h2>
          <span className="text-xs text-muted-foreground">
            {workspace.azurePostgresStatusMessage}
          </span>
        </div>
        <div className="overflow-hidden rounded-lg border border-border">
          {servers.length === 0 ? (
            <EmptyState
              icon={<Database />}
              title="No servers"
              description="Deploy the PostgreSQL Flexible Server lab recipe against floci-az, or connect a cloud subscription."
              className="border-0"
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>State</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {servers.map((server) => (
                  <TableRow
                    key={server.name}
                    data-state={server.name === selectedServer ? "selected" : undefined}
                    className="cursor-pointer"
                    onClick={() => onSelectServer(server.name)}
                  >
                    <TableCell className="font-medium">{server.name}</TableCell>
                    <TableCell>{server.version || "—"}</TableCell>
                    <TableCell>{server.location || "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{server.sku || "—"}</TableCell>
                    <TableCell>
                      <StatusPill
                        status="on"
                        label={server.provisioningState || "Unknown"}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </section>

      {active ? (
        <section className={sectionCard}>
          <h2 className="text-base font-bold">Server details · {active.name}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className={fieldLabel}>Administrator login</div>
              <div className="font-mono text-sm">{active.administratorLogin || "—"}</div>
            </div>
            <div>
              <div className={fieldLabel}>FQDN</div>
              <div className="font-mono text-sm break-all">{active.fqdn || "—"}</div>
            </div>
            <div>
              <div className={fieldLabel}>Resource group</div>
              <div className="text-sm">{active.resourceGroup || "—"}</div>
            </div>
            <div>
              <div className={fieldLabel}>Storage</div>
              <div className="text-sm">
                {active.storageMb > 0 ? `${active.storageMb} MB` : "—"}
              </div>
            </div>
            {active.localHost || active.localPort ? (
              <div className="sm:col-span-2">
                <div className={fieldLabel}>Local data plane</div>
                <div className="font-mono text-sm">
                  {active.localHost || connection?.host || "localhost"}
                  {active.localPort || connection?.port
                    ? `:${active.localPort || connection?.port}`
                    : ""}
                </div>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {connection ? (
        <section className={sectionCard}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-bold">Connection</h2>
            <div className="flex items-center gap-2">
              <Switch
                checked={revealed}
                onCheckedChange={setRevealed}
                aria-label="Reveal connection strings"
              />
              <span className="text-xs font-medium">Reveal connection strings</span>
            </div>
          </div>
          {localProfile ? (
            <p className="text-sm text-muted-foreground">
              Local floci-az ships without TLS. Connection strings use{" "}
              <span className="font-mono text-xs">sslmode=disable</span>.
            </p>
          ) : connection.note ? (
            <p className="text-sm text-muted-foreground">{connection.note}</p>
          ) : null}
          <div className="space-y-4">
            <ConnectionField label="psql" value={connection.psql} revealed={revealed} />
            <ConnectionField label="URI" value={connection.uri} revealed={revealed} />
            <ConnectionField label="JDBC" value={connection.jdbcUrl} revealed={revealed} />
            <ConnectionField label=".NET" value={connection.dotNet} revealed={revealed} />
          </div>
        </section>
      ) : active ? (
        <section className={sectionCard}>
          <EmptyState
            icon={<Database />}
            title="No connection details"
            description="Connection strings are unavailable. On floci-az mocked mode the data plane is not started."
            className="border-0"
          />
        </section>
      ) : null}
    </div>
  );
}