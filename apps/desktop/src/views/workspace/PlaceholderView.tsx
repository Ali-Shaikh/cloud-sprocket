// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { Boxes } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import type { WorkspaceSnapshot, WorkspaceTab } from "@/types/backend";

export type PlaceholderViewProps = {
  /** The active workspace tab; used for the heading and copy. */
  tab?: WorkspaceTab;
  workspace: WorkspaceSnapshot;
  showSensitiveValues: boolean;
  onToggleSensitiveValues: () => void;
};

/**
 * M5d: Tailwind placeholder for workspace tabs without a dedicated view yet
 * (for example Functions or Identity). Shows the tab context plus the locked
 * profile inspector with sensitive-value masking.
 */
export default function PlaceholderView({
  tab,
  workspace,
  showSensitiveValues,
  onToggleSensitiveValues,
}: PlaceholderViewProps) {
  const profile = workspace.profile;
  const hasSensitiveAttributes = Boolean(
    profile?.attributes.some((attribute) => attribute.sensitive),
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-[1.375rem] font-[750] tracking-[-0.015em]">{tab?.label ?? "Workspace"}</h1>
        {tab?.summary ? (
          <p className="mt-1 text-sm text-muted-foreground">{tab.summary}</p>
        ) : null}
      </header>

      <EmptyState
        icon={<Boxes />}
        title={tab?.detail ?? "Select a workspace view."}
        description="This provider surface is attached to the open workspace and ready for the next inventory slice."
      />

      <section className="rounded-lg border border-border bg-card p-[18px] shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold">Workspace Profile</h2>
            <p className="text-xs text-muted-foreground">
              {profile
                ? `${profile.displayName} · ${profile.profileId}`
                : "The open workspace snapshot will populate this profile detail."}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={!hasSensitiveAttributes}
            onClick={onToggleSensitiveValues}
          >
            {showSensitiveValues ? "Hide Sensitive Values" : "Reveal Sensitive Values"}
          </Button>
        </div>
        {hasSensitiveAttributes ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Credential and secret fields are redacted by the daemon before they
            reach the UI. Full values stay in local CLI config files only until a
            dedicated reveal path exists.
          </p>
        ) : null}
        {!profile ? (
          <p className="mt-4 text-sm text-muted-foreground">
            No open workspace profile is available yet.
          </p>
        ) : (
          <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2">
            {profile.attributes.map((attribute) => (
              <div
                key={attribute.label}
                className="rounded-lg border border-border bg-muted/40 px-3 py-2"
              >
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {attribute.label}
                </div>
                <div className="break-words text-sm text-foreground">
                  {attribute.sensitive && !showSensitiveValues
                    ? "Hidden until revealed"
                    : attribute.value}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
