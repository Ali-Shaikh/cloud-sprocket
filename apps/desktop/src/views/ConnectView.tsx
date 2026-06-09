import { useEffect } from "react";
import { Check, RefreshCw, Server } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ProviderIcon } from "@/components/provider-icon";
import { StatusDot, type Status } from "@/components/status-dot";
import { StatusPill } from "@/components/status-pill";
import type { ProfileSummary, ProviderSummary, SessionSnapshot } from "@/types/backend";

export type ConnectViewProps = {
  providers: ProviderSummary[];
  profiles: ProfileSummary[];
  session: SessionSnapshot;
  selectedProvider?: ProviderSummary;
  selectedProfile?: ProfileSummary;
  loading: boolean;
  localRuntimeReady: boolean;
  onRefreshDiscovery: () => void;
  onSelectProvider: (providerId: string) => void;
  onSelectProfile: (providerId: string, profileId: string) => void;
  onSelectAuthMethod: (authMethod: string) => void;
  onOpenWorkspace: () => void;
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
 * the source of truth) and reuses the existing select/lock RPC handlers.
 */
export default function ConnectView({
  providers,
  profiles,
  session,
  selectedProvider,
  selectedProfile,
  loading,
  localRuntimeReady,
  onRefreshDiscovery,
  onSelectProvider,
  onSelectProfile,
  onSelectAuthMethod,
  onOpenWorkspace,
  onOpenLocalRuntime,
}: ConnectViewProps) {
  const providerProfiles = selectedProvider
    ? profiles.filter((profile) => profile.providerId === selectedProvider.providerId)
    : [];
  const authMethods =
    session.availableAuthMethods.length > 0
      ? session.availableAuthMethods
      : selectedProfile?.authMethods ?? [];
  const singleAuthMethod = (() => {
    const usable = authMethods.filter((method) => method.available);
    return usable.length === 1 ? usable[0].method : undefined;
  })();
  const canOpen = Boolean(selectedProfile && session.selectedAuthMethod);

  // Near-zero onboarding: when a profile exposes exactly one usable auth path,
  // select it automatically so the user only has to press "Open workspace".
  useEffect(() => {
    if (selectedProfile && !session.selectedAuthMethod && singleAuthMethod) {
      onSelectAuthMethod(singleAuthMethod);
    }
    // onSelectAuthMethod is re-created each render; the primitive deps below keep
    // this to a single call per profile/auth-state change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProfile?.profileId, session.selectedAuthMethod, singleAuthMethod]);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header className="flex items-start gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Your clouds</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            CloudSprocket found these on your machine. Pick one to open a local workspace,
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
                "flex flex-col gap-3 rounded-xl border bg-card p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md",
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
          className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-border-strong hover:shadow-md"
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
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted">
              <ProviderIcon provider={selectedProvider.providerId} size={24} />
            </div>
            <div>
              <h2 className="text-base font-bold">Open {selectedProvider.label}</h2>
              <p className="text-xs text-muted-foreground">
                Choose a profile and authentication path.
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
                  return (
                    <button
                      key={profile.profileId}
                      type="button"
                      aria-pressed={active}
                      onClick={() => onSelectProfile(profile.providerId, profile.profileId)}
                      className={cn(
                        "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                        active
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-muted",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border",
                          active
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border-strong",
                        )}
                      >
                        {active ? <Check className="size-3" /> : null}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">
                          {profile.displayName}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {profile.summary || profile.profileId}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {selectedProfile ? (
            <div className="mt-5">
              <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Authentication
              </div>
              <div className="flex flex-wrap gap-2">
                {authMethods.map((method) => {
                  const active = method.method === session.selectedAuthMethod;
                  return (
                    <button
                      key={method.method}
                      type="button"
                      disabled={!method.available}
                      title={method.summary}
                      onClick={() => onSelectAuthMethod(method.method)}
                      className={cn(
                        "rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border-strong hover:bg-muted",
                      )}
                    >
                      {method.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="mt-6 flex items-center gap-3 border-t border-border pt-5">
            <div className="text-sm">
              <div className="flex items-center gap-2 font-semibold">
                <StatusDot status={canOpen ? "on" : "off"} />
                {canOpen ? "Ready to open" : "Pick a profile and auth path"}
              </div>
              <div className="text-xs text-muted-foreground">
                {canOpen
                  ? "Opens a read-only local workspace for this connection."
                  : "Your selections stay on this machine."}
              </div>
            </div>
            <Button className="ml-auto" disabled={!canOpen} onClick={onOpenWorkspace}>
              Open workspace
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
