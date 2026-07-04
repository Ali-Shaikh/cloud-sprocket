// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useMemo, useState } from "react";
import { Eye, EyeOff, KeyRound, RefreshCw } from "lucide-react";

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
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

  const selectedSecret =
    workspace.secretsManagerSecrets.find(
      (secret) => secret.name === workspace.selectedSecretsManagerName,
    ) ?? workspace.secretsManagerSecrets[0];

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
          <h2 className="text-base font-bold">Secret Inventory</h2>
          <p className="text-sm text-muted-foreground">
            Metadata only until you reveal a value with write mode enabled.
          </p>
        </div>
        <p className="text-sm text-muted-foreground">{statusMessage}</p>

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
            onClick={onRefresh}
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
        </div>

        <div className="overflow-hidden rounded-lg border border-border">
          {workspace.secretsManagerSecrets.length === 0 ? (
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Last changed</TableHead>
                  <TableHead>Rotation</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSecrets.map((secret) => (
                  <TableRow
                    key={secret.name}
                    className={cn(
                      "cursor-pointer",
                      secret.name === workspace.selectedSecretsManagerName && "bg-muted/50",
                    )}
                    onClick={() => {
                      setRevealedValue(null);
                      onSelectSecret(secret.name);
                    }}
                  >
                    <TableCell className="font-medium">{secret.name}</TableCell>
                    <TableCell className="max-w-xs truncate text-sm">
                      {secret.description || "—"}
                    </TableCell>
                    <TableCell className="text-xs">{secret.lastChangedDate || "—"}</TableCell>
                    <TableCell className="text-xs">
                      {secret.rotationEnabled ? "Enabled" : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </section>

      {selectedSecret ? (
        <section className={sectionCard}>
          <h2 className="text-base font-bold">Secret detail</h2>
          <DetailFieldList
            fields={[
              { label: "Name", value: selectedSecret.name },
              { label: "ARN", value: selectedSecret.arn || "Unknown" },
              { label: "Description", value: selectedSecret.description || "—" },
              { label: "Last changed", value: selectedSecret.lastChangedDate || "—" },
              { label: "Last accessed", value: selectedSecret.lastAccessedDate || "—" },
            ]}
            emptyText="No secret details are available."
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
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
            <p className="text-sm text-muted-foreground">{revealCapability.reason}</p>
          ) : null}
          {revealError ? <p className="text-sm text-destructive">{revealError}</p> : null}
          {revealedValue !== null ? (
            <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg border border-border bg-muted/40 p-3 text-xs">
              {revealedValue}
            </pre>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}