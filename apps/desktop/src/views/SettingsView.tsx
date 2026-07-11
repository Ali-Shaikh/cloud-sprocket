// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";
import { ProviderIcon } from "@/components/provider-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { serviceCatalogIconUrl } from "@/lib/service-catalog-icons";
import { groupByServiceDomain, SERVICE_DOMAIN_FALLBACK_GROUP } from "@/lib/service-domains";
import {
  filterCatalogueEntries,
  groupCatalogueByProvider,
  isProviderEnabled,
  isServiceEnabled,
  setAllProviderServices,
  toggleProvider,
  toggleService,
} from "@/lib/service-preferences";
import type { PreferencesSnapshot, ServicePreferences } from "@/types/backend";

export type SettingsViewProps = {
  snapshot: PreferencesSnapshot;
  saving?: boolean;
  onUpdate: (preferences: ServicePreferences) => void;
};

const sectionCard = "rounded-lg border border-border bg-card shadow-sm";

export default function SettingsView({ snapshot, saving = false, onUpdate }: SettingsViewProps) {
  const [filterText, setFilterText] = useState("");
  const preferences = snapshot.preferences;

  const filteredCatalogue = useMemo(
    () => filterCatalogueEntries(snapshot.catalogue, filterText),
    [filterText, snapshot.catalogue],
  );
  const providerGroups = useMemo(
    () => groupCatalogueByProvider(filteredCatalogue),
    [filteredCatalogue],
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Preferences
          </p>
          <h1 className="mt-1 text-[1.375rem] font-[750] tracking-[-0.015em]">Services</h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Disabled services are fully dormant: no tab, no polling, and no inventory calls.
            Provider switches hide clouds from Connect while keeping them available here.
          </p>
        </div>
        <Input
          value={filterText}
          placeholder="Search services"
          aria-label="Search services"
          className="w-56"
          onChange={(event) => {
            setFilterText(event.target.value);
          }}
        />
      </header>

      <div className="space-y-4">
        {providerGroups.map((group) => {
          const providerOn = isProviderEnabled(preferences, group.providerId);
          const visibleServices = group.services;
          const domainGroups = groupByServiceDomain(visibleServices, (service) => service.domain);
          return (
            <section key={group.providerId} className={sectionCard}>
              <div className="flex flex-wrap items-center gap-3 border-b border-border px-[18px] py-4">
                <div className="grid size-9 place-items-center rounded-lg bg-muted">
                  <ProviderIcon provider={group.providerId} size={24} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-bold">{group.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {group.enabledCount} of {group.totalCount} enabled
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={saving || !providerOn}
                    onClick={() => {
                      onUpdate(
                        setAllProviderServices(
                          preferences,
                          group.providerId,
                          group.services.map((service) => service.serviceId),
                          true,
                        ),
                      );
                    }}
                  >
                    Enable all
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={saving || !providerOn}
                    onClick={() => {
                      onUpdate(
                        setAllProviderServices(
                          preferences,
                          group.providerId,
                          group.services.map((service) => service.serviceId),
                          false,
                        ),
                      );
                    }}
                  >
                    Disable all
                  </Button>
                  <Switch
                    checked={providerOn}
                    disabled={saving}
                    aria-label={`${group.label} provider`}
                    onCheckedChange={(checked) => {
                      onUpdate(toggleProvider(preferences, group.providerId, checked));
                    }}
                  />
                </div>
              </div>

              {providerOn ? (
                <div className="space-y-5 p-[18px]">
                  {domainGroups.map((domainGroup) => (
                    <section key={domainGroup.id} aria-labelledby={`${group.providerId}-${domainGroup.id}`}>
                      <h3
                        id={`${group.providerId}-${domainGroup.id}`}
                        className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground"
                      >
                        {domainGroup.id === SERVICE_DOMAIN_FALLBACK_GROUP.id
                          ? "Tools & other"
                          : domainGroup.label}
                      </h3>
                      <div className="grid gap-3 sm:grid-cols-2">
                  {domainGroup.items.map((service) => {
                    const iconUrl = serviceCatalogIconUrl(service.serviceId);
                    const enabled = isServiceEnabled(
                      preferences,
                      service.providerId,
                      service.serviceId,
                    );
                    return (
                      <label
                        key={service.serviceId}
                        className={cn(
                          "flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-muted/40",
                          !enabled && "opacity-70",
                        )}
                      >
                        <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted">
                          {iconUrl ? (
                            <img src={iconUrl} alt="" className="size-6" />
                          ) : (
                            <ProviderIcon provider={service.providerId} size={22} />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold">{service.label}</div>
                          <div className="text-xs text-muted-foreground">{service.summary}</div>
                        </div>
                        <Switch
                          checked={enabled}
                          disabled={saving}
                          aria-label={service.label}
                          onCheckedChange={(checked) => {
                            onUpdate(
                              toggleService(
                                preferences,
                                service.providerId,
                                service.serviceId,
                                checked,
                              ),
                            );
                          }}
                        />
                      </label>
                    );
                  })}
                      </div>
                    </section>
                  ))}
                </div>
              ) : (
                <p className="px-[18px] py-4 text-sm text-muted-foreground">
                  {group.label} is disabled. Enable the provider to manage individual services.
                </p>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
