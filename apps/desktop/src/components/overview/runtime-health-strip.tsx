// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { ExternalLink, Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ProviderIcon } from "@/components/provider-icon";
import { StatusDot } from "@/components/status-dot";
import type { RuntimeHealthTarget, RuntimeHealthTargetId } from "@/lib/runtime-health";

export type RuntimeHealthStripProps = {
  targets: RuntimeHealthTarget[];
  actionInFlight?: Partial<Record<RuntimeHealthTargetId, boolean>>;
  onOpenRuntime: () => void;
  onQuickStart?: (targetId: "localstack" | "floci-az") => void;
};

export function RuntimeHealthStrip({
  targets,
  actionInFlight,
  onOpenRuntime,
  onQuickStart,
}: RuntimeHealthStripProps) {
  if (targets.length === 0) {
    return null;
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">Local runtime health</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Docker engine and emulator reachability for local profiles.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onOpenRuntime}>
          <ExternalLink />
          Open Local Runtime
        </Button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {targets.map((target) => {
          const inFlight = actionInFlight?.[target.id] ?? false;
          const emulatorId =
            target.id === "localstack" || target.id === "floci-az" ? target.id : undefined;
          return (
            <div
              key={target.id}
              className="flex min-w-0 flex-col gap-2 rounded-md border border-border bg-muted/30 px-3 py-2.5"
            >
              <div className="flex items-center gap-2">
                {target.providerId ? (
                  <ProviderIcon provider={target.providerId} size={18} />
                ) : (
                  <span className="grid size-[18px] place-items-center rounded bg-muted text-[10px] font-bold text-muted-foreground">
                    D
                  </span>
                )}
                <span className="truncate text-sm font-semibold">{target.label}</span>
                <span className="ml-auto flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                  <StatusDot status={target.status} ring />
                  {target.statusLabel}
                </span>
              </div>
              <p className="line-clamp-2 text-xs text-muted-foreground">{target.summary}</p>
              {target.quickAction === "start" && onQuickStart && emulatorId ? (
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-fit"
                  disabled={inFlight || !workspaceDockerReachable(targets)}
                  onClick={() => onQuickStart(emulatorId)}
                >
                  <Play />
                  {inFlight ? "Starting..." : "Start"}
                </Button>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function workspaceDockerReachable(targets: RuntimeHealthTarget[]): boolean {
  const docker = targets.find((target) => target.id === "docker");
  return docker?.status === "on";
}