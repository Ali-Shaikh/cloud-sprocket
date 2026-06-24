// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { ChevronRight, Wrench } from "lucide-react";

import azureLogAnalyticsIconUrl from "@/assets/cloud-icons/azure-log-analytics.svg";
import azureWafIconUrl from "@/assets/cloud-icons/azure-waf.svg";
import awsCloudwatchIconUrl from "@/assets/cloud-icons/aws-cloudwatch.svg";
import { cn } from "@/lib/utils";
import type { WorkspaceSnapshot, WorkspaceTab } from "@/types/backend";

export type ToolsHubViewProps = {
  workspace: WorkspaceSnapshot;
  providerLabel: string;
  profileLabel?: string;
  workspaceTabs: WorkspaceTab[];
  onNavigate: (tabId: string) => void;
};

type ToolCard = {
  tabId: string;
  label: string;
  summary: string;
  detail: string;
  iconUrl?: string;
  count?: number;
};

function toolIconForTab(tabId: string): string | undefined {
  switch (tabId) {
    case "azure-waf":
    case "azure-front-door":
      return azureWafIconUrl;
    case "azure-log-analytics":
      return azureLogAnalyticsIconUrl;
    case "logs":
      return awsCloudwatchIconUrl;
    default:
      return undefined;
  }
}

function toolCountForTab(tabId: string, workspace: WorkspaceSnapshot): number | undefined {
  switch (tabId) {
    case "azure-waf":
      return workspace.azureWafPolicies.length;
    case "azure-log-analytics":
      return workspace.azureLogAnalyticsWorkspaces.length;
    case "azure-front-door":
      return workspace.azureFrontDoorProfiles.length;
    case "logs":
      return workspace.logGroups.length;
    default:
      return undefined;
  }
}

function toolCards(workspaceTabs: WorkspaceTab[], workspace: WorkspaceSnapshot): ToolCard[] {
  return workspaceTabs
    .filter((tab) => tab.category === "tool" && tab.tabId !== "azure-tools")
    .map((tab) => ({
      tabId: tab.tabId,
      label: tab.label,
      summary: tab.summary,
      detail: tab.detail,
      iconUrl: toolIconForTab(tab.tabId),
      count: toolCountForTab(tab.tabId, workspace),
    }));
}

export default function ToolsHubView({
  workspace,
  providerLabel,
  profileLabel,
  workspaceTabs,
  onNavigate,
}: ToolsHubViewProps) {
  const cards = toolCards(workspaceTabs, workspace);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-[1.375rem] font-[750] tracking-[-0.015em]">Tools</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {providerLabel}
          {profileLabel ? (
            <span className="text-muted-foreground"> · {profileLabel}</span>
          ) : null}
          {" · "}
          Curated operational workflows for day-to-day cloud tasks.
        </p>
      </header>

      {cards.length === 0 ? (
        <section className="rounded-lg border border-dashed border-border bg-card p-8 text-center shadow-sm">
          <Wrench className="mx-auto size-8 text-muted-foreground" aria-hidden />
          <h2 className="mt-3 text-sm font-semibold">No tools for this provider yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Tools appear here when the connected provider exposes operational workflows.
          </p>
        </section>
      ) : (
        <section className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
          {cards.map((card) => (
            <button
              key={card.tabId}
              type="button"
              onClick={() => onNavigate(card.tabId)}
              className={cn(
                "group flex h-full flex-col rounded-lg border border-border bg-card p-4 text-left shadow-sm",
                "outline-none transition-transform hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              )}
            >
              <div className="flex items-start gap-3">
                {card.iconUrl ? (
                  <img
                    src={card.iconUrl}
                    alt=""
                    className="size-9 shrink-0 rounded-md border border-border bg-background p-1"
                  />
                ) : (
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40">
                    <Wrench className="size-4 text-muted-foreground" aria-hidden />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold tracking-tight">{card.label}</h2>
                    {typeof card.count === "number" ? (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] tabular-nums text-muted-foreground">
                        {card.count}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{card.summary}</p>
                </div>
                <ChevronRight
                  className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                />
              </div>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{card.detail}</p>
            </button>
          ))}
        </section>
      )}
    </div>
  );
}