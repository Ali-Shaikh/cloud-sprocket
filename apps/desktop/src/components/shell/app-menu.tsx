// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import {
  ArrowLeftRight,
  Bug,
  ClipboardCopy,
  ExternalLink,
  Info,
  Keyboard,
  Monitor,
  Moon,
  Sun,
  Trash2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { APP_VERSION } from "@/lib/app-version";
import { openExternalUrl } from "@/lib/backend";
import { useTheme } from "@/lib/theme";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import type { AppMenuProps } from "./types";

const DOCS_URL = "https://github.com/Ali-Shaikh/cloud-sprocket";

/**
 * Rail footer popover: connection info, preferences, diagnostics, about, and reset.
 */
function AppMenu({
  label,
  connectionName,
  connectionDetail,
  daemonHealthy = true,
  onSwitchConnection,
  onOpenDebug,
  onCopyConfigPaths,
  onReset,
  onOpenCommandPalette,
}: AppMenuProps) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const themeLabel =
    theme === "system" ? `System (${resolvedTheme})` : theme === "light" ? "Light" : "Dark";
  const ThemeIcon = theme === "system" ? Monitor : theme === "light" ? Sun : Moon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="App menu"
          className={cn(
            "relative grid size-10 place-items-center rounded-[11px] border border-white/12 bg-white/10 text-xs font-bold text-white transition-colors hover:bg-white/[0.18] data-[state=open]:bg-white/20 data-[state=open]:shadow-[0_0_0_2px_color-mix(in_oklch,var(--primary)_50%,transparent)]",
          )}
        >
          {label}
          {daemonHealthy ? (
            <span className="absolute bottom-1.5 right-1.5 size-[7px] rounded-full border-[1.5px] border-rail bg-[color:var(--success)]" />
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="end" sideOffset={8} className="w-64">
        {(connectionName || connectionDetail) && (
          <>
            <div className="px-2.5 py-2">
              {connectionName ? (
                <div className="text-[13px] font-semibold text-foreground">{connectionName}</div>
              ) : null}
              {connectionDetail ? (
                <div className="mt-0.5 text-[11px] text-muted-foreground">{connectionDetail}</div>
              ) : null}
            </div>
            {onSwitchConnection ? (
              <DropdownMenuItem onClick={onSwitchConnection}>
                <ArrowLeftRight />
                Switch connection
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
          </>
        )}

        <DropdownMenuLabel>Preferences</DropdownMenuLabel>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <ThemeIcon />
            Theme: {themeLabel}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem onClick={() => setTheme("system")}>
              <Monitor />
              System
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("light")}>
              <Sun />
              Light
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("dark")}>
              <Moon />
              Dark
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        {onOpenCommandPalette ? (
          <DropdownMenuItem onClick={onOpenCommandPalette}>
            <Keyboard />
            Keyboard shortcuts
          </DropdownMenuItem>
        ) : null}

        <DropdownMenuSeparator />
        <DropdownMenuLabel>Diagnostics</DropdownMenuLabel>
        {onOpenDebug ? (
          <DropdownMenuItem onClick={onOpenDebug}>
            <Bug />
            Debug console
          </DropdownMenuItem>
        ) : null}
        {onCopyConfigPaths ? (
          <DropdownMenuItem onClick={onCopyConfigPaths}>
            <ClipboardCopy />
            Copy config paths
          </DropdownMenuItem>
        ) : null}

        <DropdownMenuSeparator />
        <DropdownMenuLabel>About</DropdownMenuLabel>
        <DropdownMenuItem disabled>
          <Info />
          CloudSprocket v{APP_VERSION}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            void openExternalUrl(DOCS_URL);
          }}
        >
          <ExternalLink />
          Documentation
        </DropdownMenuItem>

        {onReset ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:bg-destructive/10 focus:text-destructive"
              onClick={onReset}
            >
              <Trash2 />
              Reset app data…
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export { AppMenu };