// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import type { Dispatch, SetStateAction } from "react";

import type { NavigateToResourceParams } from "@/lib/navigate-to-resource";
import type {
  ActivityLogEntry,
  AzureLogAnalyticsHistoryEntry,
  AzureLogAnalyticsSavedQuery,
  HiddenResourceHit,
  PreferencesSnapshot,
  ServicePreferences,
  WorkspaceSnapshot,
} from "@/types/backend";

type MutateWorkspaceSelectionOptions = {
  merge?: (current: WorkspaceSnapshot, incoming: WorkspaceSnapshot) => WorkspaceSnapshot;
  onOptimistic?: () => void;
  persistOnly?: boolean;
  panelLoading?: boolean;
  /** When true, apply optimistic/result updates synchronously (avoids list flicker). */
  immediate?: boolean;
  errorTitle?: string;
};

export type WorkspaceTabRouterProps = {
  loading: boolean;
  openingProfileId?: string;
  logs: ActivityLogEntry[];
  showSensitiveValues: boolean;
  setShowSensitiveValues: Dispatch<SetStateAction<boolean>>;
  mutateWorkspaceSelection: (
    method: string,
    params: Record<string, unknown>,
    options?: MutateWorkspaceSelectionOptions,
  ) => Promise<void>;
  mutateSession: (method: string, params?: Record<string, unknown>) => Promise<boolean>;
  refreshDiscovery: () => Promise<void>;
  listLogAnalyticsHistory: (workspace: string) => Promise<AzureLogAnalyticsHistoryEntry[]>;
  listLogAnalyticsSaved: (workspace: string) => Promise<AzureLogAnalyticsSavedQuery[]>;
  openWorkspace: (providerId: string, profileId: string) => Promise<void>;
  chooseAuthMethod: (authMethod: string) => Promise<void>;
  preferencesSnapshot: PreferencesSnapshot | null;
  preferencesSaving: boolean;
  onLoadPreferences: () => Promise<PreferencesSnapshot>;
  onPreferencesUpdate: (preferences: ServicePreferences) => Promise<void>;
  hiddenResourceHits: HiddenResourceHit[];
  hiddenResourceEnablingServiceId: string | null;
  onEnableHiddenService: (hit: HiddenResourceHit) => Promise<void>;
};

export type AwsWorkspaceTabsProps = WorkspaceTabRouterProps & {
  /** Deep-link navigator for inventory inspector cross-links. */
  navigateToResource?: (params: NavigateToResourceParams) => void;
};
export type AzureWorkspaceTabsProps = WorkspaceTabRouterProps;
