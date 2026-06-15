import { Bell, Check, Monitor, Moon, PanelLeft, RefreshCw, Search, Sun } from "lucide-react";

import { useTheme } from "@/lib/theme";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import type { TopBarProps } from "./types";

const iconBtn =
  "grid size-9 place-items-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";

/**
 * The 56px header bar: nav toggle, breadcrumb, visual-only search, and the
 * refresh / notifications / theme controls.
 */
function TopBar({
  breadcrumb,
  onToggleNav,
  onRefresh,
  onToggleNotifications,
  notificationCount,
  searchPlaceholder,
  onOpenCommandPalette,
}: TopBarProps) {
  const { theme, setTheme } = useTheme();
  const commandShortcut =
    typeof navigator !== "undefined" && /mac|iphone|ipad|ipod/i.test(navigator.platform)
      ? "⌘K"
      : "Ctrl K";

  const ThemeIcon = theme === "system" ? Monitor : theme === "light" ? Sun : Moon;

  return (
    <header
      data-slot="top-bar"
      className="flex h-14 flex-none items-center gap-3.5 border-b border-border bg-card px-5"
    >
      {onToggleNav && (
        <button
          type="button"
          onClick={onToggleNav}
          aria-label="Toggle navigation"
          className={iconBtn}
        >
          <PanelLeft className="size-[17px]" />
        </button>
      )}

      <div className="flex items-center gap-2 text-[13.5px]">
        <span className="font-semibold text-foreground">{breadcrumb.connection}</span>
        <span className="text-muted-foreground">/</span>
        <span className="text-muted-foreground">{breadcrumb.view}</span>
      </div>

      <button
        type="button"
        onClick={onOpenCommandPalette}
        className="ml-auto flex w-60 items-center gap-2 rounded-full border border-border bg-muted px-3.5 py-1.5 text-left text-muted-foreground transition-colors hover:text-foreground"
      >
        <Search className="size-[15px]" />
        <span className="flex-1 text-[13px]">{searchPlaceholder ?? "Search commands"}</span>
        <kbd className="rounded border border-border bg-card px-1.5 py-0.5 text-[10px] font-medium">{commandShortcut}</kbd>
      </button>

      {onRefresh && (
        <button type="button" onClick={onRefresh} aria-label="Refresh" className={iconBtn}>
          <RefreshCw className="size-[17px]" />
        </button>
      )}

      {onToggleNotifications && (
        <button
          type="button"
          onClick={onToggleNotifications}
          aria-label="Notifications"
          className={`${iconBtn} relative`}
        >
          <Bell className="size-[17px]" />
          {notificationCount ? (
            <span className="absolute -right-1 -top-1 grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {notificationCount}
            </span>
          ) : null}
        </button>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label="Theme" className={iconBtn}>
            <ThemeIcon className="size-[17px]" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Theme</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setTheme("system")}>
            <Monitor />
            System
            {theme === "system" && <Check className="ml-auto size-4" />}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTheme("light")}>
            <Sun />
            Light
            {theme === "light" && <Check className="ml-auto size-4" />}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTheme("dark")}>
            <Moon />
            Dark
            {theme === "dark" && <Check className="ml-auto size-4" />}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}

export { TopBar };
