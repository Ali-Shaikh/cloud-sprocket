// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useEffect, useMemo, useRef, useState } from "react";
import { Eye, EyeOff, KeyRound, RefreshCw } from "lucide-react";

import { formatTimestamp } from "@/lib/format";
import { cn } from "@/lib/utils";
import { notify } from "@/lib/notify";
import { actionCapabilityState } from "@/lib/action-capabilities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/empty-state";
import {
  ResourceInspectorHeader,
  ResourceInspectorPanel,
  ResourceInventoryShell,
} from "@/components/inventory/resource-inspector";
import { ResourceTable } from "@/components/inventory/resource-table";
import { DetailFieldList } from "./detail-fields";
import type { AwsSecretsManagerSecret, WorkspaceSnapshot } from "@/types/backend";

export type SecretsManagerWorkspaceSnapshot = WorkspaceSnapshot & {
  selectedSecretsManagerRegion?: string;
  selectedSecretsManagerName?: string;
  secretsManagerStatusMessage?: string;
  secretsManagerRegions: string[];
  secretsManagerSecrets: AwsSecretsManagerSecret[];
};

export type SecretsManagerViewProps = {
  workspace: SecretsManagerWorkspaceSnapshot;
  actionStatus: string;
  onRefresh: () => void;
  onSelectRegion: (region: string) => void;
  onSelectSecret: (secretName: string) => void;
  onReveal: (region: string, secretName: string) => Promise<string>;
};

const fieldLabel =
  "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

const sectionCard = "space-y-4 rounded-lg border border-border bg-card p-[18px] shadow-sm";

/** Map optional rotation flag to Enabled / Disabled / Unknown. */
export function formatRotationStatus(rotationEnabled?: boolean): string {
  if (rotationEnabled === true) {
    return "Enabled";
  }
  if (rotationEnabled === false) {
    return "Disabled";
  }
  return "Unknown";
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export default function SecretsManagerView({
  workspace,
  actionStatus,
  onRefresh,
  onSelectRegion,
  onSelectSecret,
  onReveal,
}: SecretsManagerViewProps) {
  const [filterText, setFilterText] = useState("");
  const [revealedValue, setRevealedValue] = useState<string | null>(null);
  const [revealError, setRevealError] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(Boolean(workspace.selectedSecretsManagerName));
  const lastSelectedSecretRef = useRef(workspace.selectedSecretsManagerName || "");

  const regions =
    workspace.secretsManagerRegions.length > 0
      ? workspace.secretsManagerRegions
      : workspace.apiGatewayRegions.length > 0
        ? workspace.apiGatewayRegions
        : workspace.rdsRegions.length > 0
          ? workspace.rdsRegions
          : workspace.ec2Regions;

  const revealCapability = actionCapabilityState(workspace, "secrets", "reveal", "aws");
  const canReveal = revealCapability.enabled;

  const selectedSecret = workspace.secretsManagerSecrets.find(
    (secret) => secret.name === workspace.selectedSecretsManagerName,
  );

  const filteredSecrets = useMemo(() => {
    const query = filterText.trim().toLowerCase();
    if (!query) {
      return workspace.secretsManagerSecrets;
    }
    return workspace.secretsManagerSecrets.filter((secret) =>
      [secret.name, secret.description, secret.arn].some((value) =>
        value?.toLowerCase().includes(query),
      ),
    );
  }, [filterText, workspace.secretsManagerSecrets]);

  const statusMessage =
    actionStatus ||
    workspace.secretsManagerStatusMessage ||
    "Secrets Manager inventory is waiting for an open AWS workspace.";

  useEffect(() => {
    const nextSecretName = workspace.selectedSecretsManagerName || "";
    if (nextSecretName !== lastSelectedSecretRef.current) {
      lastSelectedSecretRef.current = nextSecretName;
      setInspectorOpen(Boolean(nextSecretName));
      setRevealedValue(null);
      setRevealError(null);
    }
  }, [workspace.selectedSecretsManagerName]);

  async function revealSelected(): Promise<void> {
    if (!workspace.selectedSecretsManagerRegion || !selectedSecret?.name) {
      return;
    }
    setRevealError(null);
    setRevealing(true);
    try {
      const value = await onReveal(workspace.selectedSecretsManagerRegion, selectedSecret.name);
      setRevealedValue(value);
      notify("success", "Secret value revealed");
    } catch (caught) {
      setRevealError(caught instanceof Error ? caught.message : String(caught));
      setRevealedValue(null);
    } finally {
      setRevealing(false);
    }
  }

  if (workspace.provider?.providerId && workspace.provider.providerId !== "aws") {
    return (
      <div className="p-6">
        <EmptyState
          icon={<KeyRound />}
          title="Secrets Manager requires an AWS workspace"
          description="Open an AWS profile from Connect to browse secrets and reveal values when write mode is enabled."
        />
      </div>
    );
  }

  const tableEmptyState =
    workspace.secretsManagerSecrets.length === 0 ? (
      <EmptyState
        icon={<KeyRound />}
        title="No secrets"
        description={
          workspace.selectedSecretsManagerRegion
            ? `No secrets were returned for ${workspace.selectedSecretsManagerRegion}.`
            : "Select a region to list secrets."
        }
        className="border-0"
      />
    ) : (
      <EmptyState
        icon={<KeyRound />}
        title="No matches"
        description="No secrets match the current filter."
        className="border-0"
      />
    );

  const inspectorContent = selectedSecret ? (
    <ResourceInspectorPanel>
      <ResourceInspectorHeader
        icon={KeyRound}
        eyebrow="Secret"
        title={selectedSecret.name}
        onClose={() => setInspectorOpen(false)}
      />

      <DetailFieldList
        fields={[
          { label: "Name", value: selectedSecret.name },
          { label: "ARN", value: selectedSecret.arn || "Unknown" },
          { label: "Description", value: selectedSecret.description || "Unknown" },
          {
            label: "Last changed",
            value: selectedSecret.lastChangedDate
              ? formatTimestamp(selectedSecret.lastChangedDate)
              : "Unknown",
            title: selectedSecret.lastChangedDate,
          },
          {
            label: "Last accessed",
            value: selectedSecret.lastAccessedDate
              ? formatTimestamp(selectedSecret.lastAccessedDate)
              : "Unknown",
            title: selectedSecret.lastAccessedDate,
          },
          {
            label: "Rotation",
            value: formatRotationStatus(selectedSecret.rotationEnabled),
          },
        ]}
        emptyText="No secret details are available."
      />

      <div>
        <div className={fieldLabel}>Reveal value</div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!canReveal || revealing}
            title={revealCapability.reason}
            onClick={() => {
              void revealSelected();
            }}
          >
            <Eye />
            Reveal value
          </Button>
          {revealedValue !== null ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setRevealedValue(null);
              }}
            >
              <EyeOff />
              Hide value
            </Button>
          ) : null}
        </div>
        {!canReveal && revealCapability.reason ? (
          <p className="mt-2 text-xs text-muted-foreground">{revealCapability.reason}</p>
        ) : null}
        {revealError ? <p className="mt-2 text-sm text-destructive">{revealError}</p> : null}
        {revealedValue !== null ? (
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all rounded-lg border border-border bg-muted/40 p-3 text-xs">
            {revealedValue}
          </pre>
        ) : null}
      </div>
    </ResourceInspectorPanel>
  ) : null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-[1.375rem] font-[750] tracking-[-0.015em]">Secrets Manager</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {countLabel(workspace.secretsManagerSecrets.length, "secret", "secrets")} ·{" "}
          {workspace.selectedSecretsManagerRegion || "no region selected"}
        </p>
      </header>

      <section className={sectionCard}>
        <div>
          <h2 className="text-base font-bold">Secret Fleet</h2>
          <p className="text-sm text-muted-foreground">
            Metadata only until you reveal a value with write mode enabled.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
            <div className={fieldLabel}>Selected Region</div>
            <p className="truncate text-sm">
              {workspace.selectedSecretsManagerRegion || "No region selected"}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
            <div className={fieldLabel}>Selected Secret</div>
            <p className="truncate text-sm font-mono">
              {selectedSecret?.name || "No secret selected"}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
            <div className={fieldLabel}>Secrets</div>
            <p className="truncate text-sm">
              {countLabel(workspace.secretsManagerSecrets.length, "secret", "secrets")}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
            <div className={fieldLabel}>Write Mode</div>
            <p className="truncate text-sm">{canReveal ? "Writes enabled" : "Read-only"}</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{statusMessage}</p>
      </section>

      <section className={sectionCard}>
        <div>
          <h2 className="text-base font-bold">Secret Inventory</h2>
          <p className="text-sm text-muted-foreground">
            Select a region, filter secrets, then choose one for metadata and reveal.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="w-56">
            <div className={cn(fieldLabel, "mb-1")}>Region</div>
            <Select
              value={workspace.selectedSecretsManagerRegion ?? ""}
              onValueChange={(value) => {
                if (value) {
                  setRevealedValue(null);
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
            disabled={!workspace.selectedSecretsManagerRegion}
            onClick={() => {
              setRevealedValue(null);
              setRevealError(null);
              onRefresh();
            }}
          >
            <RefreshCw />
            Refresh secrets
          </Button>
          <div className="min-w-56 flex-1">
            <div className={cn(fieldLabel, "mb-1")}>Filter</div>
            <Input
              value={filterText}
              placeholder="Filter secrets"
              onChange={(event) => {
                setFilterText(event.target.value);
              }}
            />
          </div>
          <div className="pb-2 text-xs text-muted-foreground">
            {filteredSecrets.length}/{workspace.secretsManagerSecrets.length} shown
          </div>
        </div>

        <ResourceInventoryShell
          table={
            <ResourceTable
              columns={[
                { id: "name", label: "Name" },
                { id: "description", label: "Description", cellClassName: "max-w-xs truncate text-sm" },
                { id: "lastChanged", label: "Last changed", cellClassName: "text-xs" },
                { id: "rotation", label: "Rotation", cellClassName: "text-xs" },
              ]}
              rows={filteredSecrets}
              selectedKey={workspace.selectedSecretsManagerName}
              getRowKey={(secret) => secret.name}
              onRowClick={(secret) => {
                setRevealedValue(null);
                onSelectSecret(secret.name);
                setInspectorOpen(true);
              }}
              getCellTitle={(secret, columnId) =>
                columnId === "lastChanged" ? secret.lastChangedDate : undefined
              }
              renderCell={(secret, columnId) => {
                if (columnId === "name") {
                  return <span className="font-medium">{secret.name}</span>;
                }
                if (columnId === "description") {
                  return secret.description || "Unknown";
                }
                if (columnId === "lastChanged") {
                  return secret.lastChangedDate
                    ? formatTimestamp(secret.lastChangedDate)
                    : "Unknown";
                }
                if (columnId === "rotation") {
                  return formatRotationStatus(secret.rotationEnabled);
                }
                return null;
              }}
              emptyState={tableEmptyState}
            />
          }
          inspectorContent={inspectorContent}
          inspectorOpen={inspectorOpen}
          onInspectorOpenChange={setInspectorOpen}
          inspectorAriaLabel="Secrets Manager details"
        />
      </section>
    </div>
  );
}