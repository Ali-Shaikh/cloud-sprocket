// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useEffect, useMemo, useRef, useState } from "react";

import { emptySession, emptySettings } from "@/lib/workspace-snapshot";
import type {
  AppSettingsSnapshot,
  ProfileSummary,
  ProviderSummary,
  SessionSnapshot,
} from "@/types/backend";

export function useSessionState() {
  const [providers, setProviders] = useState<ProviderSummary[]>([]);
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [session, setSession] = useState<SessionSnapshot>(emptySession);
  const [appSettings, setAppSettings] = useState<AppSettingsSnapshot>(emptySettings);
  const sessionSnapshotRef = useRef(session);

  useEffect(() => {
    sessionSnapshotRef.current = session;
  }, [session]);

  const selectedProvider = useMemo(
    () => providers.find((provider) => provider.providerId === session.currentProviderId),
    [providers, session.currentProviderId],
  );

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.profileId === session.selectedProfileId),
    [profiles, session.selectedProfileId],
  );

  return {
    providers,
    setProviders,
    profiles,
    setProfiles,
    session,
    setSession,
    appSettings,
    setAppSettings,
    sessionSnapshotRef,
    selectedProvider,
    selectedProfile,
  };
}