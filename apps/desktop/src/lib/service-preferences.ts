// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import type { PreferencesSnapshot, ServiceCatalogEntry, ServicePreferences } from "@/types/backend";

export const PROVIDER_ORDER = ["aws", "azure", "gcp"] as const;

export const PROVIDER_LABELS: Record<string, string> = {
  aws: "AWS",
  azure: "Azure",
  gcp: "GCP",
};

export type ProviderCatalogueGroup = {
  providerId: string;
  label: string;
  enabled: boolean;
  services: ServiceCatalogEntry[];
  enabledCount: number;
  totalCount: number;
};

export function groupCatalogueByProvider(
  catalogue: ServiceCatalogEntry[],
): ProviderCatalogueGroup[] {
  const groups = new Map<string, ServiceCatalogEntry[]>();
  for (const entry of catalogue) {
    const bucket = groups.get(entry.providerId) ?? [];
    bucket.push(entry);
    groups.set(entry.providerId, bucket);
  }

  return PROVIDER_ORDER.flatMap((providerId) => {
    const services = groups.get(providerId);
    if (!services?.length) {
      return [];
    }
    const enabledCount = services.filter((service) => service.enabled).length;
    return [{
      providerId,
      label: PROVIDER_LABELS[providerId] ?? providerId,
      enabled: enabledCount > 0,
      services,
      enabledCount,
      totalCount: services.length,
    }];
  });
}

export function isProviderEnabled(preferences: ServicePreferences, providerId: string): boolean {
  return !preferences.disabledProviders.includes(providerId);
}

export function isServiceEnabled(
  preferences: ServicePreferences,
  providerId: string,
  serviceId: string,
): boolean {
  if (!isProviderEnabled(preferences, providerId)) {
    return false;
  }
  return !(preferences.disabledServices[providerId] ?? []).includes(serviceId);
}

export function toggleProvider(
  preferences: ServicePreferences,
  providerId: string,
  enabled: boolean,
): ServicePreferences {
  const disabledProviders = new Set(preferences.disabledProviders);
  if (enabled) {
    disabledProviders.delete(providerId);
  } else {
    disabledProviders.add(providerId);
  }
  return {
    ...preferences,
    disabledProviders: [...disabledProviders].sort(),
  };
}

export function toggleService(
  preferences: ServicePreferences,
  providerId: string,
  serviceId: string,
  enabled: boolean,
): ServicePreferences {
  const disabled = new Set(preferences.disabledServices[providerId] ?? []);
  if (enabled) {
    disabled.delete(serviceId);
  } else {
    disabled.add(serviceId);
  }
  const disabledServices = { ...preferences.disabledServices };
  const next = [...disabled].sort();
  if (next.length === 0) {
    delete disabledServices[providerId];
  } else {
    disabledServices[providerId] = next;
  }
  return { ...preferences, disabledServices };
}

export function setAllProviderServices(
  preferences: ServicePreferences,
  providerId: string,
  serviceIds: string[],
  enabled: boolean,
): ServicePreferences {
  const disabledServices = { ...preferences.disabledServices };
  if (enabled) {
    delete disabledServices[providerId];
  } else {
    disabledServices[providerId] = [...serviceIds].sort();
  }
  return { ...preferences, disabledServices };
}

export function filterCatalogueEntries(
  catalogue: ServiceCatalogEntry[],
  query: string,
): ServiceCatalogEntry[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) {
    return catalogue;
  }
  return catalogue.filter((entry) =>
    [entry.label, entry.summary, entry.serviceId, entry.providerId].some((value) =>
      value.toLowerCase().includes(trimmed),
    ),
  );
}

export function catalogueFromSnapshot(snapshot: PreferencesSnapshot): ServiceCatalogEntry[] {
  return snapshot.catalogue;
}