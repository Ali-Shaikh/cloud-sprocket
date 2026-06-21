// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { ChevronRight, Loader2, RefreshCw, Server } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ProviderIcon } from "@/components/provider-icon";
import { type Status } from "@/components/status-dot";
import { StatusPill } from "@/components/status-pill";
import type { AuthMethodStatus, ProfileSummary, ProviderSummary, SessionSnapshot } from "@/types/backend";

export type ConnectViewProps = {
  providers: ProviderSummary[];
  profiles: ProfileSummary[];
  session: SessionSnapshot;
  selectedProvider?: ProviderSummary;
  selectedProfile?: ProfileSummary;
  loading: boolean;
  localRuntimeReady: boolean;
  /** Profile id whose open chain is currently in flight, if any. */
  openingProfileId?: string;
  onRefreshDiscovery: () => void;
  onSelectProvider: (providerId: string) => void;
  onOpenProfile: (providerId: string, profileId: string) => void;
  onChooseAuthMethod: (authMethod: string) => void;
  onOpenLocalRuntime: () => void;
};

function providerStatus(provider: ProviderSummary): Status {
  switch (provider.state) {
    case "configured":
      return "on";
    case "tooling-only":
      return "warning";
    default:
      return "off";
  }
}

function statusLabel(provider: ProviderSummary): string {
  switch (provider.state) {
    case "configured":
      return "Ready";
    case "tooling-only":
      return "Tooling only";
    default:
      return "Setup";
  }
}

/**
 * The Connect screen: card-based, single-screen onboarding that replaces the
 * old 4-step "Session Setup" wizard. It is prop-driven (the backend session is
 * the source of truth). Clicking a profile opens its workspace directly; the
 * auth-path chips only appear when more than one usable path needs a choice.
 */
export default function ConnectView({
  providers,
  profiles,
  session,
  selectedProvider,
  selectedProfile,
  loading,
  localRuntimeReady,
  openingProfileId,
  onRefreshDiscovery,
  onSelectProvider,
  onOpenProfile,
  onChooseAuthMethod,
  onOpenLocalRuntime,
}: ConnectViewProps) {
  const providerProfiles = selectedProvider
    ? profiles.filter((profile) => profile.providerId === selectedProvider.providerId)
    : [];
  const authMethods: AuthMethodStatus[] =
    session.availableAuthMethods.length > 0
      ? session.availableAuthMethods
      : selectedProfile?.authMethods ?? [];
  const usableAuthMethods = authMethods.filter((method) => method.available);
  // The auth chips are only a real decision when more than one path is usable.
  // A single usable path is opened straight from the profile click, so we never
  // ask the user to pick it here. With zero usable paths we still show the
  // disabled methods so the profile click is not a silent dead-end.
  const needsAuthChoice = Boolean(selectedProfile && usableAuthMethods.length > 1);
  const noUsableAuth = Boolean(
    selectedProfile && authMethods.length > 0 && usableAuthMethods.length === 0,
  );
  const opening = Boolean(openingProfileId);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header className="flex items-start gap-4">
        <div>
          <h1 className="text-[1.375rem] font-[750] tracking-[-0.015em]">Your clouds</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            CloudSprocket found these on your machine. Click a profile to open its workspace,
            no setup required.
          </p>
        </div>
        <Button variant="outline" size="sm" className="ml-auto" onClick={onRefreshDiscovery}>
          <RefreshCw />
          Refresh
        </Button>
      </header>

      <section className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
        {providers.map((provider) => {
          const active = provider.providerId === selectedProvider?.providerId;
          return (
            <button
              key={provider.providerId}
              type="button"
              aria-pressed={active}
              onClick={() => onSelectProvider(provider.providerId)}
              className={cn(
                "flex flex-col gap-3 rounded-lg border bg-card p-[18px] text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md",
                active
                  ? "border-primary ring-1 ring-primary"
                  : "border-border hover:border-border-strong",
              )}
            >
              <div className="flex items-center gap-3">
                <div className="grid size-11 shrink-0 place-items-center rounded-[11px] bg-muted">
                  <ProviderIcon provider={provider.providerId} size={30} />
                </div>
                <div className="min-w-0">
                  <div className="truncate font-bold">{provider.label}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {provider.profileCount} profile{provider.profileCount === 1 ? "" : "s"} detected
                  </div>
                </div>
                <StatusPill
                  className="ml-auto shrink-0"
                  status={providerStatus(provider)}
                  label={statusLabel(provider)}
                />
              </div>
              <p className="line-clamp-2 text-xs text-muted-foreground">{provider.summary}</p>
            </button>
          );
        })}

        <button
          type="button"
          onClick={onOpenLocalRuntime}
          className="flex flex-col gap-3 rounded-lg border border-border bg-card p-[18px] text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-border-strong hover:shadow-md"
        >
          <div className="flex items-center gap-3">
            <div className="grid size-11 shrink-0 place-items-center rounded-[11px] bg-muted">
              <Server className="size-[26px] text-sky-500" />
            </div>
            <div className="min-w-0">
              <div className="truncate font-bold">Local Runtime</div>
              <div className="truncate text-xs text-muted-foreground">LocalStack + floci-az</div>
            </div>
            <StatusPill
              className="ml-auto shrink-0"
              status={localRuntimeReady ? "on" : "off"}
              label={localRuntimeReady ? "Running" : "Docker"}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Emulate the cloud locally. No account needed.
          </p>
        </button>
      </section>

      {selectedProvider ? (
        <section className="rounded-lg border border-border bg-card p-[18px] shadow-sm">
          <div className="flex items-center gap-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted">
              <ProviderIcon provider={selectedProvider.providerId} size={24} />
            </div>
            <div>
              <h2 className="text-base font-bold">Open {selectedProvider.label}</h2>
              <p className="text-xs text-muted-foreground">
                Click a profile to open its workspace. Workspaces open read-only; enable write mode
                from the top bar when you need mutating actions.
              </p>
            </div>
          </div>

          <div className="mt-5">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Profile
            </div>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading profiles...</p>
            ) : providerProfiles.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No profiles detected for this connection.
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {providerProfiles.map((profile) => {
                  const active = profile.profileId === selectedProfile?.profileId;
                  const busy = openingProfileId === profile.profileId;
                  return (
                    <button
                      key={profile.profileId}
                      type="button"
                      aria-pressed={active}
                      disabled={opening}
                      onClick={() => onOpenProfile(profile.providerId, profile.profileId)}
                      className={cn(
                        "group flex items-center gap-3 rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed",
                        active
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-muted",
                        opening && !busy ? "opacity-50" : null,
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">
                          {profile.displayName}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {profile.summary || profile.profileId}
                        </span>
                      </span>
                      {busy ? (
                        <span className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-primary">
                          <Loader2 className="size-3.5 animate-spin" />
                          Opening
                        </span>
                      ) : (
                        <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-muted-foreground transition-colors group-hover:text-foreground">
                          Open
                          <ChevronRight className="size-3.5" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {needsAuthChoice || noUsableAuth ? (
            <div className="mt-5">
              <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Authentication
              </div>
              <p className="mb-2 text-xs text-muted-foreground">
                {needsAuthChoice
                  ? "This profile has more than one sign-in path. Pick one to open the workspace."
                  : "No usable sign-in path was detected for this profile. Hover a method for details."}
              </p>
              <div className="flex flex-wrap gap-2">
                {authMethods.map((method) => (
                  <button
                    key={method.method}
                    type="button"
                    disabled={!method.available || opening}
                    title={method.summary}
                    onClick={() => onChooseAuthMethod(method.method)}
                    className={cn(
                      "rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                      "border-border-strong hover:bg-muted",
                    )}
                  >
                    {method.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
