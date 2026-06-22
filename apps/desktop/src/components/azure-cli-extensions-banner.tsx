// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { AlertTriangle } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { inlineBannerVariants } from "@/components/inline-banner";
import type { AzureCLIExtensionStatus } from "@/types/backend";

export type AzureCLIExtensionsBannerProps = {
  extensions: AzureCLIExtensionStatus[];
  className?: string;
};

function missingExtensions(extensions: AzureCLIExtensionStatus[]): AzureCLIExtensionStatus[] {
  return extensions.filter((extension) => !extension.installed);
}

export function AzureCLIExtensionsBanner({ extensions, className }: AzureCLIExtensionsBannerProps) {
  const missing = missingExtensions(extensions);
  if (missing.length === 0) {
    return null;
  }

  const installCommands = missing
    .map((extension) => extension.installCommand || `az extension add --name ${extension.name}`)
    .join("\n");

  return (
    <div
      data-slot="inline-banner"
      className={cn(inlineBannerVariants({ tone: "warning" }), className)}
    >
      <AlertTriangle className="size-5 shrink-0 text-[color:var(--warning)]" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="font-medium text-foreground">Azure CLI extensions required</div>
        <p className="text-muted-foreground">
          Some Azure workbenches need CLI extensions that are not installed yet. Install them in
          Terminal, then refresh this workspace.
        </p>
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          {missing.map((extension) => (
            <li key={extension.name}>
              <span className="font-medium text-foreground">{extension.name}</span>
              {extension.summary ? ` — ${extension.summary}` : ""}
            </li>
          ))}
        </ul>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="ml-auto shrink-0"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(installCommands);
          } catch {
            // Clipboard may be unavailable in some embedded webviews.
          }
        }}
      >
        Copy install commands
      </Button>
    </div>
  );
}