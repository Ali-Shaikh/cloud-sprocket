// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";

import { backendRequest } from "@/lib/backend";
import { normalisePreferencesSnapshot, toggleService } from "@/lib/service-preferences";
import { normaliseArray, normaliseProvider, normaliseSessionSnapshot } from "@/lib/workspace-snapshot";
import type {
  HiddenResourceHit,
  HiddenResourcesSnapshot,
  PreferencesSnapshot,
  ProviderSummary,
  ServicePreferences,
  SessionSnapshot,
} from "@/types/backend";

const PREFERENCES_REFRESH_EXCLUDED_TABS = new Set([
  "settings",
  "debug",
  "developer-tools",
  "deploy",
  "virtualisation",
]);

export type UseServicePreferencesFlowParams = {
  session: SessionSnapshot;
  activeWorkspaceTabId: string;
  setActiveWorkspaceTabId: Dispatch<SetStateAction<string>>;
  setProviders: Dispatch<SetStateAction<ProviderSummary[]>>;
  setSession: Dispatch<SetStateAction<SessionSnapshot>>;
  loadWorkspace: (snapshot: SessionSnapshot) => Promise<void>;
};

export function useServicePreferencesFlow(params: UseServicePreferencesFlowParams) {
  const {
    session,
    activeWorkspaceTabId,
    setActiveWorkspaceTabId,
    setProviders,
    setSession,
    loadWorkspace,
  } = params;

  const [preferencesSnapshot, setPreferencesSnapshot] = useState<PreferencesSnapshot | null>(null);
  const [preferencesSaving, setPreferencesSaving] = useState(false);
  const [hiddenResourceHits, setHiddenResourceHits] = useState<HiddenResourceHit[]>([]);
  const [hiddenResourceEnablingServiceId, setHiddenResourceEnablingServiceId] = useState<
    string | null
  >(null);
  const hiddenResourcesProbeKeyRef = useRef<string | null>(null);

  const probeHiddenResources = useCallback(async (force = false): Promise<void> => {
    if (!session.isLocked) {
      setHiddenResourceHits([]);
      hiddenResourcesProbeKeyRef.current = null;
      return;
    }
    const probeKey = `${session.lockedProviderId}:${session.lockedProfileId}`;
    if (!force && hiddenResourcesProbeKeyRef.current === probeKey) {
      return;
    }
    try {
      const snapshot = await backendRequest<HiddenResourcesSnapshot>(
        "preferences.hiddenResources.get",
      );
      setHiddenResourceHits(snapshot.hits ?? []);
      hiddenResourcesProbeKeyRef.current = probeKey;
    } catch {
      setHiddenResourceHits([]);
    }
  }, [session.isLocked, session.lockedProviderId, session.lockedProfileId]);

  const applyPreferencesUpdate = useCallback(
    async (preferences: ServicePreferences): Promise<void> => {
      setPreferencesSaving(true);
      try {
        const snapshot = await backendRequest<PreferencesSnapshot>(
          "preferences.update",
          preferences as unknown as Record<string, unknown>,
        );
        setPreferencesSnapshot(normalisePreferencesSnapshot(snapshot));
        const [providersResult, sessionResult] = await Promise.all([
          backendRequest<ProviderSummary[]>("providers.list"),
          backendRequest<SessionSnapshot>("session.get"),
        ]);
        setProviders(normaliseArray(providersResult).map(normaliseProvider));
        const normalisedSession = normaliseSessionSnapshot(sessionResult);
        setSession(normalisedSession);
        if (
          normalisedSession.isLocked &&
          !PREFERENCES_REFRESH_EXCLUDED_TABS.has(activeWorkspaceTabId) &&
          !normalisedSession.workspaceTabs.some((tab) => tab.tabId === activeWorkspaceTabId)
        ) {
          setActiveWorkspaceTabId("overview");
        }
        await loadWorkspace(normalisedSession);
        void probeHiddenResources(true);
      } finally {
        setPreferencesSaving(false);
      }
    },
    [
      activeWorkspaceTabId,
      loadWorkspace,
      probeHiddenResources,
      setActiveWorkspaceTabId,
      setProviders,
      setSession,
    ],
  );

  const openSettings = useCallback(async (): Promise<void> => {
    const [snapshot] = await Promise.all([
      backendRequest<PreferencesSnapshot>("preferences.get"),
      probeHiddenResources(true),
    ]);
    setPreferencesSnapshot(normalisePreferencesSnapshot(snapshot));
    setActiveWorkspaceTabId("settings");
  }, [probeHiddenResources, setActiveWorkspaceTabId]);

  const enableHiddenService = useCallback(
    async (hit: HiddenResourceHit): Promise<void> => {
      setHiddenResourceEnablingServiceId(hit.serviceId);
      try {
        const snapshot =
          preferencesSnapshot ??
          (await backendRequest<PreferencesSnapshot>("preferences.get"));
        if (!preferencesSnapshot) {
          setPreferencesSnapshot(normalisePreferencesSnapshot(snapshot));
        }
        const nextPreferences = toggleService(
          snapshot.preferences,
          hit.providerId,
          hit.serviceId,
          true,
        );
        await applyPreferencesUpdate(nextPreferences);
      } finally {
        setHiddenResourceEnablingServiceId(null);
      }
    },
    [applyPreferencesUpdate, preferencesSnapshot],
  );

  useEffect(() => {
    if (!session.isLocked) {
      setHiddenResourceHits([]);
      hiddenResourcesProbeKeyRef.current = null;
      return;
    }
    void probeHiddenResources();
  }, [probeHiddenResources, session.isLocked]);

  return {
    preferencesSnapshot,
    setPreferencesSnapshot,
    preferencesSaving,
    hiddenResourceHits,
    setHiddenResourceHits,
    hiddenResourceEnablingServiceId,
    setHiddenResourceEnablingServiceId,
    hiddenResourcesProbeKeyRef: hiddenResourcesProbeKeyRef as MutableRefObject<string | null>,
    probeHiddenResources,
    openSettings,
    applyPreferencesUpdate,
    enableHiddenService,
  };
}