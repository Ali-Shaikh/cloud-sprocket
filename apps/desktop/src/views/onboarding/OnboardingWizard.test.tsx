// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/lib/theme";
import type { EmulatorSummary, PreferencesSnapshot, ProfileSummary, ProviderSummary } from "@/types/backend";

import OnboardingWizard from "./OnboardingWizard";
import {
  isOnboardingComplete,
  markOnboardingComplete,
  ONBOARDING_COMPLETED_KEY,
  ONBOARDING_STEP_KEY,
} from "./onboarding-state";

vi.mock("@/lib/backend", () => ({
  getTofuStatus: vi.fn(async () => ({
    available: true,
    version: "1.10.0",
    path: "tofu",
  })),
  installTofu: vi.fn(),
}));

const providers: ProviderSummary[] = [
  {
    providerId: "aws",
    label: "AWS",
    state: "configured",
    summary: "AWS configured",
    profileCount: 1,
    locations: [],
  },
  {
    providerId: "azure",
    label: "Azure",
    state: "configured",
    summary: "Azure configured",
    profileCount: 0,
    locations: [],
  },
];

const profiles: ProfileSummary[] = [
  {
    providerId: "aws",
    profileId: "sandbox",
    displayName: "Sandbox",
    summary: "Development account",
    sourcePaths: [],
    attributes: [],
    authMethods: [],
  },
];

const emulators: EmulatorSummary[] = [
  {
    emulatorId: "localstack",
    providerId: "aws",
    label: "LocalStack",
    kind: "docker",
    status: "running",
    summary: "Ready",
    details: [],
  },
  {
    emulatorId: "floci-az",
    providerId: "azure",
    label: "floci-az",
    kind: "docker",
    status: "stopped",
    summary: "Stopped",
    details: [],
  },
];

const preferences: PreferencesSnapshot = {
  preferences: { disabledProviders: [], disabledServices: {} },
  catalogue: [
    {
      providerId: "aws",
      serviceId: "s3",
      label: "S3",
      summary: "Storage",
      detail: "Storage",
      category: "service",
      enabled: true,
    },
    {
      providerId: "azure",
      serviceId: "storage",
      label: "Storage",
      summary: "Storage",
      detail: "Storage",
      category: "service",
      enabled: true,
    },
  ],
};

function renderWizard(overrides: Partial<ComponentProps<typeof OnboardingWizard>> = {}) {
  const props: ComponentProps<typeof OnboardingWizard> = {
    providers,
    profiles,
    discoveryLoading: false,
    preferencesSnapshot: preferences,
    preferencesSaving: false,
    dockerReady: true,
    emulators,
    onLoadPreferences: vi.fn(async () => preferences),
    onPreferencesUpdate: vi.fn(async () => undefined),
    onRefreshDiscovery: vi.fn(async () => undefined),
    onRefreshDocker: vi.fn(async () => undefined),
    onOpenRuntime: vi.fn(),
    onStartEmulator: vi.fn(async () => undefined),
    onComplete: vi.fn(),
    onRunFirstLab: vi.fn(),
    ...overrides,
  };
  render(
    <ThemeProvider>
      <OnboardingWizard {...props} />
    </ThemeProvider>,
  );
  return props;
}

describe("OnboardingWizard", () => {
  beforeEach(() => {
    window.localStorage.removeItem(ONBOARDING_STEP_KEY);
  });

  it("saves provider choices and reaches the bundled beginner lab", async () => {
    const user = userEvent.setup();
    const props = renderWizard();

    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(await screen.findByRole("button", { name: "Azure" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(props.onPreferencesUpdate).toHaveBeenCalledWith({
      disabledProviders: ["azure"],
      disabledServices: {},
    });
    expect(await screen.findByText("Environment check")).toBeInTheDocument();
    expect(screen.getByText("Engine reachable")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("Sandbox")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("DynamoDB lab (AWS)")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Configure first lab" }));
    expect(props.onRunFirstLab).toHaveBeenCalledOnce();
  });

  it("offers a local-runtime next action when no profiles are found", async () => {
    const user = userEvent.setup();
    const onOpenRuntime = vi.fn();
    renderWizard({ profiles: [], onOpenRuntime });

    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByText("No cloud profiles found")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open Local Runtime" }));
    expect(onOpenRuntime).toHaveBeenCalledOnce();
  });
});

describe("onboarding state", () => {
  beforeEach(() => {
    window.localStorage.removeItem(ONBOARDING_COMPLETED_KEY);
    window.localStorage.removeItem(ONBOARDING_STEP_KEY);
  });

  it("persists completion", () => {
    expect(isOnboardingComplete()).toBe(false);
    markOnboardingComplete();
    expect(isOnboardingComplete()).toBe(true);
  });
});
