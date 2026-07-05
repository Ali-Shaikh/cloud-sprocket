// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useMemo, useState } from "react";
import { Copy, RefreshCw, Shield } from "lucide-react";

import { actionCapabilityState } from "@/lib/action-capabilities";

import { cn } from "@/lib/utils";
import { notify } from "@/lib/notify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import type { WorkspaceSnapshot } from "@/types/backend";

export interface AwsIamRole {
  roleName: string;
  roleArn?: string;
  path?: string;
  description?: string;
  createDate?: string;
  attachedPolicies?: string[];
}

export interface AwsIamPolicy {
  policyName: string;
  policyArn?: string;
  attachmentCount?: number;
  updateDate?: string;
}

export type IamWorkspaceSnapshot = WorkspaceSnapshot & {
  selectedIamRoleName?: string;
  iamStatusMessage?: string;
  iamRoles: AwsIamRole[];
  iamPolicies: AwsIamPolicy[];
};

export type IAMViewProps = {
  workspace: IamWorkspaceSnapshot;
  actionStatus: string;
  onRefresh: () => void;
  onSelectRegion: (region: string) => void;
  onSelectEntity: (roleName: string) => void;
  onCreateRole?: (roleName: string) => void;
};

const fieldLabel =
  "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

const sectionCard = "space-y-4 rounded-lg border border-border bg-card p-[18px] shadow-sm";

const snippetCard = "rounded-lg border border-border bg-muted/40 p-3";

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function joinedValues(values: string[] | undefined, emptyText = "None"): string {
  if (!values || values.length === 0) {
    return emptyText;
  }
  return values.join(", ");
}

function copyToClipboard(value: string, label = "Copied to clipboard"): void {
  if (navigator.clipboard) {
    void navigator.clipboard.writeText(value).then(() => {
      notify("success", label);
    });
  }
}

/**
 * v0.6 IAM panel: account-scoped role inventory with customer-managed policy listing.
 */
export default function IAMView({
  workspace,
  actionStatus,
  onRefresh,
  onSelectRegion: _onSelectRegion,
  onSelectEntity,
  onCreateRole,
}: IAMViewProps) {
  const [filterText, setFilterText] = useState("");
  const [newRoleName, setNewRoleName] = useState("demo-lambda-role");
  const createCapability = actionCapabilityState(workspace, "iam", "createRole");

  const selectedRole =
    workspace.iamRoles.find((role) => role.roleName === workspace.selectedIamRoleName) ??
    workspace.iamRoles[0];

  const filteredRoles = useMemo(() => {
    const query = filterText.trim().toLowerCase();
    if (!query) {
      return workspace.iamRoles;
    }
    return workspace.iamRoles.filter((role) =>
      [role.roleName, role.roleArn, role.path, role.description]
        .some((value) => value?.toLowerCase().includes(query)),
    );
  }, [filterText, workspace.iamRoles]);

  const statusMessage =
    actionStatus ||
    workspace.iamStatusMessage ||
    "IAM inventory is waiting for an open AWS workspace.";

  const copySnippets = selectedRole
    ? [
        { label: "Role name", value: selectedRole.roleName },
        { label: "Role ARN", value: selectedRole.roleArn || "Unknown" },
        {
          label: "AWS CLI get role command",
          value: `aws iam get-role --role-name ${selectedRole.roleName}`,
        },
        {
          label: "Role detail JSON",
          value: JSON.stringify(
            {
              role: selectedRole,
              customerManagedPolicies: workspace.iamPolicies,
            },
            null,
            2,
          ),
        },
      ]
    : [];

  if (workspace.provider?.providerId && workspace.provider.providerId !== "aws") {
    return (
      <div className="p-6">
        <EmptyState
          icon={<Shield />}
          title="IAM requires an AWS workspace"
          description="Open an AWS profile from Connect to list roles and customer-managed policies (works on LocalStack and real AWS)."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-[1.375rem] font-[750] tracking-[-0.015em]">IAM</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {countLabel(workspace.iamRoles.length, "role", "roles")} ·{" "}
          {countLabel(workspace.iamPolicies.length, "customer-managed policy", "customer-managed policies")}
        </p>
      </header>

      <section className={sectionCard}>
        <div>
          <h2 className="text-base font-bold">Role Fleet</h2>
          <p className="text-sm text-muted-foreground">
            Account-scoped role inventory with attached policies and customer-managed policy listing.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
            <div className={fieldLabel}>Selected Role</div>
            <p className="truncate text-sm font-mono">
              {selectedRole?.roleName || "No role selected"}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
            <div className={fieldLabel}>Roles</div>
            <p className="truncate text-sm">
              {countLabel(workspace.iamRoles.length, "role", "roles")}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
            <div className={fieldLabel}>Customer Policies</div>
            <p className="truncate text-sm">
              {countLabel(workspace.iamPolicies.length, "policy", "policies")}
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
          <h2 className="text-base font-bold">Role Inventory</h2>
          <p className="text-sm text-muted-foreground">
            Filter roles, then choose one for attached policy detail. IAM is account-scoped.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <Button variant="outline" onClick={onRefresh}>
            <RefreshCw />
            Refresh roles
          </Button>
          {onCreateRole ? (
            <Button
              variant="outline"
              disabled={!createCapability.enabled || !newRoleName.trim()}
              title={createCapability.enabled ? undefined : createCapability.reason}
              onClick={() => onCreateRole(newRoleName.trim())}
            >
              Create role
            </Button>
          ) : null}
          <div className="min-w-56 flex-1">
            <div className={cn(fieldLabel, "mb-1")}>Filter</div>
            <Input
              value={filterText}
              placeholder="Filter roles"
              onChange={(event) => {
                setFilterText(event.target.value);
              }}
            />
          </div>
          <div className="pb-2 text-xs text-muted-foreground">
            {filteredRoles.length}/{workspace.iamRoles.length} shown
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-border">
          {workspace.iamRoles.length === 0 ? (
            <EmptyState
              icon={<Shield />}
              title="No roles"
              description="No IAM roles were returned for this AWS workspace."
              className="border-0"
            />
          ) : filteredRoles.length === 0 ? (
            <EmptyState
              icon={<Shield />}
              title="No matches"
              description="No IAM roles match the current filter."
              className="border-0"
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Path</TableHead>
                  <TableHead>Attached policies</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRoles.map((role) => {
                  const active = role.roleName === selectedRole?.roleName;
                  return (
                    <TableRow
                      key={role.roleName}
                      data-state={active ? "selected" : undefined}
                      className="cursor-pointer"
                      onClick={() => {
                        onSelectEntity(role.roleName);
                      }}
                    >
                      <TableCell className="font-mono text-sm">{role.roleName}</TableCell>
                      <TableCell>{role.path || "/"}</TableCell>
                      <TableCell>{role.attachedPolicies?.length ?? 0}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={sectionCard}>
          <div>
            <h2 className="text-base font-bold">Role Detail</h2>
            <p className="text-sm text-muted-foreground">
              {selectedRole?.roleName || "Select a role for policy and metadata detail."}
            </p>
          </div>
          {selectedRole ? (
            <>
              <DetailFieldList
                fields={[
                  { label: "Role ARN", value: selectedRole.roleArn || "Unknown" },
                  { label: "Path", value: selectedRole.path || "/" },
                  { label: "Description", value: selectedRole.description || "No description" },
                  { label: "Created", value: selectedRole.createDate || "Unknown" },
                  {
                    label: "Attached policies",
                    value: joinedValues(selectedRole.attachedPolicies, "None"),
                  },
                ]}
                emptyText="No role details are available."
              />

              <div>
                <div className={fieldLabel}>Customer-managed policies</div>
                {workspace.iamPolicies.length > 0 ? (
                  <div className="space-y-2">
                    {workspace.iamPolicies.map((policy) => (
                      <div key={policy.policyArn ?? policy.policyName} className={snippetCard}>
                        <div className="text-sm font-semibold">{policy.policyName}</div>
                        <div className="text-xs text-muted-foreground">
                          {policy.policyArn || "No ARN"}
                          {policy.attachmentCount != null
                            ? ` · ${policy.attachmentCount} attachment${policy.attachmentCount === 1 ? "" : "s"}`
                            : ""}
                          {policy.updateDate ? ` · updated ${policy.updateDate}` : ""}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No customer-managed policies were returned for this AWS workspace.
                  </p>
                )}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No IAM role selected.</p>
          )}
        </section>

        <section className={sectionCard}>
          <div>
            <h2 className="text-base font-bold">Copy Actions</h2>
            <p className="text-sm text-muted-foreground">
              Generated locally from the selected role. No snippet is stored.
            </p>
          </div>
          {copySnippets.length === 0 ? (
            <p className="text-sm text-muted-foreground">Select a role to generate copy actions.</p>
          ) : (
            <div className="space-y-3">
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
        </section>
      </div>
    </div>
  );
}