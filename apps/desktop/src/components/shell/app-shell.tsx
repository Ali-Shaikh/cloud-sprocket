// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import type { AppShellProps } from "./types";

/**
 * The three-zone application grid: connection rail, contextual nav, and the
 * main content column (top bar + scrollable main). The drawer is rendered as a
 * sibling so it can portal over everything.
 */
function AppShell({ rail, nav, topBar, children, drawer, navCollapsed }: AppShellProps) {
  return (
    <div
      data-slot="app-shell"
      className="grid h-screen overflow-hidden bg-background text-foreground"
      style={{ gridTemplateColumns: navCollapsed ? "68px 1fr" : "68px 256px 1fr" }}
    >
      {rail}
      {!navCollapsed && nav}
      <div className="flex min-w-0 flex-col overflow-hidden bg-background">
        {topBar}
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
      {drawer}
    </div>
  );
}

export { AppShell };
