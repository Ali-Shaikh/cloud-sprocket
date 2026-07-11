// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/lib/theme";
import type {
  ProfileSummary,
  ProviderSummary,
  SessionSnapshot,
} from "@/types/backend";

import ConnectView from "./ConnectView";

const provider: ProviderSummary = {
  providerId: "aws",
  label: "AWS",
  state: "configured",
  summary: "Amazon Web Services",
  profileCount: 1,
  locations: [],
};

const profile: ProfileSummary = {
  providerId: "aws",
  profileId: "sandbox",
  displayName: "Sandbox",
  summary: "Development account",
  sourcePaths: [],
  attributes: [],
  authMethods: [
    {
      method: "cli",
      label: "AWS CLI",
      summary: "Use the CLI",
      available: true,
    },
    {
      method: "local-files",
      label: "Local files",
      summary: "Use local files",
      available: true,
    },
  ],
};

const session: SessionSnapshot = {
  isLocked: false,
  availableAuthMethods: profile.authMethods,
  workspaceTabs: [],
};

function MultiAuthConnect() {
  const [selectedProfile, setSelectedProfile] = useState<ProfileSummary>();
  return (
    <ThemeProvider>
      <ConnectView
        providers={[provider]}
        profiles={[profile]}
        session={session}
        selectedProvider={provider}
        selectedProfile={selectedProfile}
        loading={false}
        localRuntimeReady={false}
        onRefreshDiscovery={vi.fn()}
        onSelectProvider={vi.fn()}
        onOpenProfile={() => setSelectedProfile(profile)}
        onChooseAuthMethod={vi.fn()}
        onOpenLocalRuntime={vi.fn()}
      />
    </ThemeProvider>
  );
}

describe("ConnectView", () => {
  it("labels multi-auth profiles and focuses the first sign-in method", async () => {
    const user = userEvent.setup();
    Element.prototype.scrollIntoView = vi.fn();
    render(<MultiAuthConnect />);

    const profileButton = screen.getByRole("button", {
      name: "Choose sign-in Sandbox",
    });
    expect(profileButton).toHaveTextContent("Choose sign-in");
    await user.click(profileButton);

    expect(
      await screen.findByRole("button", { name: "AWS CLI" }),
    ).toHaveFocus();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });
});
