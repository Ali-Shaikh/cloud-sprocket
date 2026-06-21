// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/lib/theme";
import AzureKeyVaultView from "./AzureKeyVaultView";
import type { WorkspaceSnapshot } from "@/types/backend";

function makeWorkspace(writes: boolean): WorkspaceSnapshot {
  return {
    profile: { displayName: "floci-az" },
    azureWritesEnabled: writes,
    azureKeyVaults: [{ name: "app-vault", resourceGroup: "rg" }],
    azureKeyVaultSecrets: [{ name: "db-password", enabled: true }],
    selectedAzureKeyVault: "app-vault",
    azureKeyVaultStatusMessage: "Loaded 1 Key Vault(s).",
  } as unknown as WorkspaceSnapshot;
}

describe("AzureKeyVaultView", () => {
  it("reveals a secret value on demand", async () => {
    const onReveal = vi.fn().mockResolvedValue("p@ssw0rd");
    render(
      <ThemeProvider>
        <AzureKeyVaultView
          workspace={makeWorkspace(true)}
          onSelectVault={() => {}}
          onReveal={onReveal}
          onSetSecret={vi.fn()}
        />
      </ThemeProvider>,
    );

    expect(screen.getByText("••••••••")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /reveal/i }));
    await waitFor(() => expect(onReveal).toHaveBeenCalledWith("app-vault", "db-password"));
    expect(await screen.findByText("p@ssw0rd")).toBeTruthy();
  });

  it("hides the Set secret action when write mode is off", () => {
    render(
      <ThemeProvider>
        <AzureKeyVaultView
          workspace={makeWorkspace(false)}
          onSelectVault={() => {}}
          onReveal={vi.fn()}
          onSetSecret={vi.fn()}
        />
      </ThemeProvider>,
    );
    expect(screen.queryByRole("button", { name: /set secret/i })).toBeNull();
  });
});
