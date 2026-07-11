// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

/**
 * Service domain vocabulary for grouping workspace service tabs by type.
 * Ids mirror the daemon's service catalogue domains; order is the fixed
 * display order so Compute always comes first regardless of provider.
 */

export const SERVICE_DOMAIN_ORDER = [
  "compute",
  "storage",
  "database",
  "integration",
  "network",
  "security",
  "governance",
  "observability",
] as const;

export type ServiceDomain = (typeof SERVICE_DOMAIN_ORDER)[number];

export const SERVICE_DOMAIN_LABELS: Record<ServiceDomain, string> = {
  compute: "Compute",
  storage: "Storage",
  database: "Databases",
  integration: "Messaging & events",
  network: "Networking & delivery",
  security: "Security & identity",
  governance: "Management",
  observability: "Observability",
};

/** Group id used for nav persistence and for entries without a known domain. */
export const SERVICE_DOMAIN_FALLBACK_GROUP = { id: "domain:other", label: "Services" };

export function serviceDomainGroupId(domain: ServiceDomain): string {
  return `domain:${domain}`;
}

function isKnownDomain(domain: string | undefined): domain is ServiceDomain {
  return SERVICE_DOMAIN_ORDER.includes(domain as ServiceDomain);
}

export interface DomainGrouped<T> {
  id: string;
  label: string;
  items: T[];
}

/**
 * Buckets entries into domain groups in the fixed display order. Entries with
 * a missing or unknown domain land in a trailing "Services" group, which keeps
 * the sidebar identical to the pre-domain layout when an older daemon snapshot
 * has no domain data. Empty groups are omitted; item order is preserved.
 */
export function groupByServiceDomain<T>(
  entries: readonly T[],
  domainOf: (entry: T) => string | undefined,
): DomainGrouped<T>[] {
  const buckets = new Map<string, DomainGrouped<T>>();
  for (const domain of SERVICE_DOMAIN_ORDER) {
    buckets.set(domain, {
      id: serviceDomainGroupId(domain),
      label: SERVICE_DOMAIN_LABELS[domain],
      items: [],
    });
  }
  const fallback: DomainGrouped<T> = { ...SERVICE_DOMAIN_FALLBACK_GROUP, items: [] };

  for (const entry of entries) {
    const domain = domainOf(entry);
    if (isKnownDomain(domain)) {
      buckets.get(domain)!.items.push(entry);
    } else {
      fallback.items.push(entry);
    }
  }

  const groups = [...buckets.values()].filter((group) => group.items.length > 0);
  if (fallback.items.length > 0) {
    groups.push(fallback);
  }
  return groups;
}
