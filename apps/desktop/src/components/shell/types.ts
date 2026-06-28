// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import type { ComponentType, ReactNode } from "react";

import type { Status } from "@/components/status-dot";
import type { NotificationTone, NotificationAction, NotificationRecord } from "@/lib/notify";

/**
 * Shared prop contract for the M2 application shell.
 *
 * The shell is split into presentational pieces (AppShell, ConnectionRail,
 * ContextNav, TopBar, ActivityDrawer) that take plain data + callbacks. App.tsx
 * owns all state and derives these shapes from the live session / providers /
 * workspace snapshots, then composes the pieces together.
 */

/** A connection shown in the left rail (a cloud provider or the local runtime). */
export interface RailConnection {
  /** providerId (e.g. "aws") or the literal "local". */
  id: string;
  /** Accessible label / tooltip text, e.g. "AWS — sandbox". */
  label: string;
  /** Rich tooltip override (provider · profile · region). */
  tooltip?: string;
  /** Provider key for ProviderIcon ("aws" | "azure" | "gcp"). Omit for non-provider items. */
  provider?: string;
  /** Provider accent for the active colour strip. */
  accentColor?: string;
  /** Two-letter badge when a workspace is open on this provider. */
  profileBadge?: string;
  /** Connection health, shown as a small status dot on the rail item. */
  status: Status;
  /** Distinguishes the local-runtime and deploy rail items from providers. */
  kind: "provider" | "local" | "deploy";
}

/** Rail footer app menu (connection info, preferences, diagnostics, about). */
export interface AppMenuProps {
  /** Button label, usually profile initials. */
  label: string;
  connectionName?: string;
  connectionDetail?: string;
  daemonHealthy?: boolean;
  onSwitchConnection?: () => void;
  onOpenDebug?: () => void;
  onCopyConfigPaths?: () => void;
  onReset?: () => void;
  onOpenCommandPalette?: () => void;
}

/** A single navigation entry in the contextual sidebar. */
export interface NavItem {
  id: string;
  label: string;
  /** Lucide icon component. Ignored when `iconUrl` is provided. */
  icon?: ComponentType<{ className?: string }>;
  /** Provider/service SVG URL (e.g. S3, EC2 glyphs). Takes precedence over `icon`. */
  iconUrl?: string;
  /** Optional count badge. A string keeps "—" placeholders flexible. */
  count?: string | number;
  /** When true, the badge shows a spinner instead of a count (data still loading). */
  countLoading?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/** The connection header shown at the top of the contextual sidebar. */
export interface NavConnectionHeader {
  name: string;
  meta: string;
  /** Provider key for ProviderIcon; omit for the local runtime (server glyph). */
  provider?: string;
  status: Status;
  statusText: string;
}

/** One row in the activity drawer. */
export interface ActivityEntry {
  id: string | number;
  timestamp: string;
  message: string;
  detail?: string;
  tone?: Status;
}

export interface AppShellProps {
  rail: ReactNode;
  nav: ReactNode;
  topBar: ReactNode;
  children: ReactNode;
  /** Overlay drawer (Sheet); rendered as a sibling so it can portal over content. */
  drawer?: ReactNode;
  /** When true, the 256px contextual nav column is hidden (rail + main only). */
  navCollapsed?: boolean;
}

export interface ConnectionRailProps {
  connections: RailConnection[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onAddConnection?: () => void;
  menu: AppMenuProps;
}

export interface ContextNavProps {
  connection: NavConnectionHeader;
  groups: NavGroup[];
  activeItemId: string;
  onSelectItem: (id: string) => void;
  onShowActivity: () => void;
  activityActive?: boolean;
  /** Extra footer buttons (e.g. Docs, Reset), rendered after the Activity button. */
  footer?: ReactNode;
}

export type TopBarWriteMode = {
  enabled: boolean;
  capable: boolean;
  endpointUrl?: string;
  profileLabel?: string;
  onClick: () => void;
};

export interface TopBarProps {
  breadcrumb: { connection: string; view: string };
  /** Toggles the contextual nav column (hamburger). */
  onToggleNav?: () => void;
  /** AWS locked-workspace write mode control. */
  writeMode?: TopBarWriteMode;
  onRefresh?: () => void;
  onToggleNotifications?: () => void;
  notificationCount?: number;
  searchPlaceholder?: string;
  /** Opens the command palette (also bound to ⌘K / Ctrl+K globally). */
  onOpenCommandPalette?: () => void;
  /** Drives the indeterminate top progress bar and the refresh spinner. */
  loading?: boolean;
}

export interface ActivityDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  subtitle?: string;
  entries: ActivityEntry[];
}

// The notification types live in @/lib/notify (the store); they are re-exported
// here (imported at the top of this file) so existing `./types` consumers and
// shell components keep pulling them from one place.
export type { NotificationTone, NotificationAction, NotificationRecord };

/** The M9 notification history drawer (a right-side Sheet). */
export interface NotificationCenterProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Notification history, newest first. */
  records: NotificationRecord[];
  onDismiss: (id: string) => void;
  onClearAll: () => void;
}
