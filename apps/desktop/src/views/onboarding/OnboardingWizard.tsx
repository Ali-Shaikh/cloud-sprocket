// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Cloud,
  Download,
  Loader2,
  RefreshCw,
  Rocket,
  Server,
  Wrench,
} from "lucide-react";

import { ProviderIcon } from "@/components/provider-icon";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getTofuStatus, installTofu } from "@/lib/backend";
import { cn } from "@/lib/utils";
import type {
  EmulatorSummary,
  PreferencesSnapshot,
  ProfileSummary,
  ProviderSummary,
  ServicePreferences,
  TofuStatus,
} from "@/types/backend";
import { readOnboardingStep, writeOnboardingStep } from "./onboarding-state";

const STEPS = ["Welcome", "Clouds", "Environment", "Profiles", "First lab"] as const;

type OnboardingWizardProps = {
  providers: ProviderSummary[];
  profiles: ProfileSummary[];
  discoveryLoading: boolean;
  preferencesSnapshot: PreferencesSnapshot | null;
  preferencesSaving: boolean;
  dockerReady: boolean;
  emulators: EmulatorSummary[];
  onLoadPreferences: () => Promise<PreferencesSnapshot>;
  onPreferencesUpdate: (preferences: ServicePreferences) => Promise<void>;
  onRefreshDiscovery: () => Promise<void>;
  onRefreshDocker: () => Promise<void>;
  onOpenRuntime: () => void;
  onStartEmulator: (emulatorId: string) => Promise<void>;
  onComplete: () => void;
  onRunFirstLab: () => void;
};

function statusText(status: EmulatorSummary["status"] | undefined): string {
  switch (status) {
    case "running":
      return "Running";
    case "stopped":
      return "Stopped";
    case "unhealthy":
      return "Needs attention";
    case "not-configured":
      return "Not configured";
    default:
      return "Not detected";
  }
}

async function waitForTofu(): Promise<TofuStatus> {
  const deadline = Date.now() + 90_000;
  let status = await getTofuStatus();
  while (!status.available && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    status = await getTofuStatus();
  }
  return status;
}

export default function OnboardingWizard({
  providers,
  profiles,
  discoveryLoading,
  preferencesSnapshot,
  preferencesSaving,
  dockerReady,
  emulators,
  onLoadPreferences,
  onPreferencesUpdate,
  onRefreshDiscovery,
  onRefreshDocker,
  onOpenRuntime,
  onStartEmulator,
  onComplete,
  onRunFirstLab,
}: OnboardingWizardProps) {
  const [step, setStep] = useState(() => readOnboardingStep(STEPS.length - 1));
  const [loadedPreferences, setLoadedPreferences] = useState<PreferencesSnapshot | null>(preferencesSnapshot);
  const [enabledProviders, setEnabledProviders] = useState<Set<string>>(new Set());
  const [preferencesLoading, setPreferencesLoading] = useState(!preferencesSnapshot);
  const [preferencesError, setPreferencesError] = useState<string | null>(null);
  const [preferenceLoadAttempt, setPreferenceLoadAttempt] = useState(0);
  const [tofu, setTofu] = useState<TofuStatus | null>(null);
  const [installingTofu, setInstallingTofu] = useState(false);
  const [startingEmulator, setStartingEmulator] = useState<string | null>(null);
  const [refreshingProfiles, setRefreshingProfiles] = useState(false);
  const [environmentError, setEnvironmentError] = useState<string | null>(null);

  const snapshot = preferencesSnapshot ?? loadedPreferences;
  const providerOptions = useMemo(() => {
    const ids = new Set(providers.map((provider) => provider.providerId));
    snapshot?.catalogue.forEach((entry) => ids.add(entry.providerId));
    return [...ids].map((providerId) => ({
      providerId,
      label:
        providers.find((provider) => provider.providerId === providerId)?.label ??
        (providerId === "aws" ? "AWS" : providerId === "azure" ? "Azure" : providerId),
    }));
  }, [providers, snapshot]);

  useEffect(() => {
    writeOnboardingStep(step);
  }, [step]);

  useEffect(() => {
    let cancelled = false;
    if (preferencesSnapshot) {
      setLoadedPreferences(preferencesSnapshot);
      setPreferencesLoading(false);
      return;
    }
    setPreferencesLoading(true);
    setPreferencesError(null);
    void onLoadPreferences()
      .then((result) => {
        if (!cancelled) setLoadedPreferences(result);
      })
      .catch((error) => {
        if (!cancelled) {
          setPreferencesError(error instanceof Error ? error.message : "Preferences could not be loaded.");
        }
      })
      .finally(() => {
        if (!cancelled) setPreferencesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [onLoadPreferences, preferenceLoadAttempt, preferencesSnapshot]);

  useEffect(() => {
    if (!snapshot) return;
    const allProviderIds = new Set([
      ...providers.map((provider) => provider.providerId),
      ...snapshot.catalogue.map((entry) => entry.providerId),
    ]);
    setEnabledProviders(
      new Set([...allProviderIds].filter((id) => !snapshot.preferences.disabledProviders.includes(id))),
    );
  }, [providers, snapshot]);

  useEffect(() => {
    let cancelled = false;
    void getTofuStatus()
      .then((status) => {
        if (!cancelled) setTofu(status);
      })
      .catch(() => {
        if (!cancelled) setTofu(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveProviderChoices(): Promise<void> {
    if (!snapshot) return;
    const allProviderIds = providerOptions.map((provider) => provider.providerId);
    const next: ServicePreferences = {
      ...snapshot.preferences,
      disabledProviders: allProviderIds.filter((id) => !enabledProviders.has(id)),
    };
    setLoadedPreferences({ ...snapshot, preferences: next });
    await onPreferencesUpdate(next);
  }

  async function nextStep(): Promise<void> {
    setPreferencesError(null);
    try {
      if (step === 1) await saveProviderChoices();
      setStep((current) => Math.min(current + 1, STEPS.length - 1));
    } catch (error) {
      setPreferencesError(error instanceof Error ? error.message : "Provider preferences could not be saved.");
    }
  }

  async function handleInstallTofu(): Promise<void> {
    setInstallingTofu(true);
    setEnvironmentError(null);
    try {
      await installTofu();
      setTofu(await waitForTofu());
    } catch (error) {
      setEnvironmentError(error instanceof Error ? error.message : "OpenTofu installation failed.");
    } finally {
      setInstallingTofu(false);
    }
  }

  async function handleStartEmulator(emulatorId: string): Promise<void> {
    setStartingEmulator(emulatorId);
    setEnvironmentError(null);
    try {
      await onStartEmulator(emulatorId);
    } catch (error) {
      setEnvironmentError(error instanceof Error ? error.message : "The local runtime could not start.");
    } finally {
      setStartingEmulator(null);
    }
  }

  async function handleRefreshProfiles(): Promise<void> {
    setRefreshingProfiles(true);
    try {
      await onRefreshDiscovery();
    } finally {
      setRefreshingProfiles(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-9rem)] max-w-5xl items-center px-4 py-8">
      <Card className="w-full overflow-hidden shadow-lg">
        <div className="border-b bg-muted/30 px-6 py-5">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">First run</p>
              <h1 className="text-xl font-bold">Set up CloudSprocket</h1>
            </div>
            <Button variant="ghost" size="sm" onClick={onComplete}>
              Skip for now
            </Button>
          </div>
          <ol className="grid grid-cols-5 gap-2" aria-label="Onboarding progress">
            {STEPS.map((label, index) => (
              <li key={label} className="min-w-0">
                <div className={cn("mb-1 h-1.5 rounded-full", index <= step ? "bg-primary" : "bg-border")} />
                <span
                  className={cn(
                    "hidden text-[11px] sm:block",
                    index === step ? "font-semibold text-foreground" : "text-muted-foreground",
                  )}
                >
                  {label}
                </span>
              </li>
            ))}
          </ol>
        </div>

        <div className="min-h-[390px] p-6 sm:p-8">
          {step === 0 ? (
            <div className="mx-auto flex max-w-xl flex-col items-center py-8 text-center">
              <div className="mb-5 grid size-16 place-items-center rounded-2xl bg-primary/10">
                <Cloud className="size-8 text-primary" />
              </div>
              <h2 className="text-2xl font-bold">Your local cloud workspace</h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Choose the clouds you use, check the local deployment tools, and review the profiles already discovered
                on this machine. Nothing is deployed during setup.
              </p>
            </div>
          ) : null}

          {step === 1 ? (
            <div>
              <h2 className="text-lg font-bold">Choose your clouds</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                This updates the same provider preferences available later in Settings.
              </p>
              {preferencesLoading ? (
                <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> Loading preferences…
                </div>
              ) : !snapshot ? (
                <div className="mt-6 rounded-xl border border-destructive/30 bg-destructive/5 p-5">
                  <p className="text-sm font-semibold">Preferences could not be loaded</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {preferencesError ?? "Check that the CloudSprocket daemon is running, then retry."}
                  </p>
                  <Button
                    className="mt-4"
                    variant="outline"
                    size="sm"
                    onClick={() => setPreferenceLoadAttempt((current) => current + 1)}
                  >
                    <RefreshCw className="size-4" /> Retry
                  </Button>
                </div>
              ) : (
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {providerOptions.map((provider) => {
                    const enabled = enabledProviders.has(provider.providerId);
                    const profileCount =
                      providers.find((item) => item.providerId === provider.providerId)?.profileCount ?? 0;
                    return (
                      <button
                        key={provider.providerId}
                        type="button"
                        aria-label={provider.label}
                        aria-pressed={enabled}
                        onClick={() =>
                          setEnabledProviders((current) => {
                            const next = new Set(current);
                            if (next.has(provider.providerId)) next.delete(provider.providerId);
                            else next.add(provider.providerId);
                            return next;
                          })
                        }
                        className={cn(
                          "flex items-center gap-4 rounded-xl border p-4 text-left transition-colors",
                          enabled ? "border-primary bg-primary/5" : "hover:bg-muted/50",
                        )}
                      >
                        <div className="grid size-11 place-items-center rounded-xl bg-muted">
                          <ProviderIcon provider={provider.providerId} size={28} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold">{provider.label}</p>
                          <p className="text-xs text-muted-foreground">
                            {profileCount} profile{profileCount === 1 ? "" : "s"} detected
                          </p>
                        </div>
                        <span
                          className={cn(
                            "grid size-6 place-items-center rounded-full border",
                            enabled ? "border-primary bg-primary text-primary-foreground" : "border-border",
                          )}
                        >
                          {enabled ? <Check className="size-4" /> : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              {preferencesError && snapshot ? (
                <p className="mt-3 text-sm text-destructive" role="alert">
                  {preferencesError}
                </p>
              ) : null}
            </div>
          ) : null}

          {step === 2 ? (
            <div>
              <h2 className="text-lg font-bold">Environment check</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Cloud connections work without these tools. Local labs and deployments use them.
              </p>
              <div className="mt-5 grid gap-3">
                <EnvironmentRow
                  icon={<Server className="size-5" />}
                  title="Docker"
                  detail={dockerReady ? "Engine reachable" : "Engine not reachable"}
                  ready={dockerReady}
                  action={
                    dockerReady ? (
                      <Button variant="outline" size="sm" onClick={() => void onRefreshDocker()}>
                        <RefreshCw className="size-4" /> Refresh
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" onClick={onOpenRuntime}>
                        <Wrench className="size-4" /> Fix in Local Runtime
                      </Button>
                    )
                  }
                />
                {(["localstack", "floci-az"] as const).map((emulatorId) => {
                  const emulator = emulators.find((item) => item.emulatorId === emulatorId);
                  const ready = emulator?.status === "running";
                  const label = emulator?.label ?? (emulatorId === "localstack" ? "LocalStack" : "floci-az");
                  return (
                    <EnvironmentRow
                      key={emulatorId}
                      icon={<Cloud className="size-5" />}
                      title={label}
                      detail={statusText(emulator?.status)}
                      ready={ready}
                      action={
                        ready ? null : (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={!dockerReady || startingEmulator !== null}
                            onClick={() => void handleStartEmulator(emulatorId)}
                          >
                            {startingEmulator === emulatorId ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <Rocket className="size-4" />
                            )}
                            Start
                          </Button>
                        )
                      }
                    />
                  );
                })}
                <EnvironmentRow
                  icon={<Wrench className="size-5" />}
                  title="OpenTofu"
                  detail={tofu?.available ? tofu.version || "Installed" : tofu ? "Not installed" : "Checking…"}
                  ready={Boolean(tofu?.available)}
                  action={
                    tofu && !tofu.available ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={installingTofu}
                        onClick={() => void handleInstallTofu()}
                      >
                        {installingTofu ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                        Install
                      </Button>
                    ) : null
                  }
                />
              </div>
              {environmentError ? (
                <p className="mt-3 text-sm text-destructive" role="alert">
                  {environmentError}
                </p>
              ) : null}
            </div>
          ) : null}

          {step === 3 ? (
            <div>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold">Profiles discovered</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    CloudSprocket reads local CLI and configuration files. Credentials stay on this machine.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={refreshingProfiles}
                  onClick={() => void handleRefreshProfiles()}
                >
                  <RefreshCw className={cn("size-4", refreshingProfiles && "animate-spin")} />
                  Refresh
                </Button>
              </div>
              {discoveryLoading && profiles.length === 0 ? (
                <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> Discovering profiles…
                </div>
              ) : profiles.length === 0 ? (
                <div className="mt-8 rounded-xl border border-dashed p-8 text-center">
                  <AlertCircle className="mx-auto size-7 text-muted-foreground" />
                  <p className="mt-3 font-semibold">No cloud profiles found</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    You can still use local labs, or configure a cloud CLI and refresh discovery.
                  </p>
                  <Button className="mt-4" variant="outline" onClick={onOpenRuntime}>
                    Open Local Runtime
                  </Button>
                </div>
              ) : (
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {providerOptions.map((provider) => {
                    const matches = profiles.filter((profile) => profile.providerId === provider.providerId);
                    const reportedCount =
                      providers.find((item) => item.providerId === provider.providerId)?.profileCount ??
                      matches.length;
                    if (!enabledProviders.has(provider.providerId)) return null;
                    return (
                      <div key={provider.providerId} className="rounded-xl border p-4">
                        <div className="flex items-center gap-3">
                          <ProviderIcon provider={provider.providerId} size={24} />
                          <p className="font-semibold">{provider.label}</p>
                          <span className="ml-auto text-xs text-muted-foreground">{reportedCount} found</span>
                        </div>
                        <ul className="mt-3 space-y-2">
                          {matches.length === 0 && reportedCount === 0 ? (
                            <li className="text-sm text-muted-foreground">No profiles detected.</li>
                          ) : matches.length === 0 ? (
                            <li className="text-sm text-muted-foreground">
                              {reportedCount} profile{reportedCount === 1 ? "" : "s"} detected. Open this cloud
                              after setup to review {reportedCount === 1 ? "it" : "them"}.
                            </li>
                          ) : (
                            matches.map((profile) => (
                              <li key={profile.profileId} className="truncate text-sm">
                                {profile.displayName}
                              </li>
                            ))
                          )}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}

          {step === 4 ? (
            <div className="mx-auto max-w-xl py-5 text-center">
              <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-emerald-500/10">
                <Rocket className="size-7 text-emerald-600" />
              </div>
              <h2 className="mt-5 text-2xl font-bold">Run your first lab</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Start with the 15-minute DynamoDB beginner lab. It runs on LocalStack and guides you from deployment to
                exploring the table in your workspace.
              </p>
              <div className="mt-6 rounded-xl border bg-muted/30 p-4 text-left">
                <p className="font-semibold">DynamoDB lab (AWS)</p>
                <p className="mt-1 text-xs text-muted-foreground">Beginner · about 15 minutes · local friendly</p>
              </div>
              <Button className="mt-6" size="lg" onClick={onRunFirstLab}>
                <Rocket className="size-4" /> Configure first lab
              </Button>
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between border-t bg-muted/20 px-6 py-4">
          <Button
            variant="outline"
            disabled={step === 0 || preferencesSaving}
            onClick={() => setStep((current) => Math.max(0, current - 1))}
          >
            Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button
              disabled={
                preferencesSaving || (step === 1 && (preferencesLoading || !snapshot || enabledProviders.size === 0))
              }
              onClick={() => void nextStep()}
            >
              {preferencesSaving ? <Loader2 className="size-4 animate-spin" /> : null}
              Continue
            </Button>
          ) : (
            <Button variant="outline" onClick={onComplete}>
              Finish without a lab
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}

function EnvironmentRow({
  icon,
  title,
  detail,
  ready,
  action,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
  ready: boolean;
  action: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border p-3">
      <div className="grid size-9 place-items-center rounded-lg bg-muted text-muted-foreground">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
      {ready ? <CheckCircle2 className="size-5 text-emerald-600" aria-label="Ready" /> : action}
    </div>
  );
}
