import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ThemeProvider } from "@/lib/theme";
import AzureEntraView from "./AzureEntraView";
import type { WorkspaceSnapshot } from "@/types/backend";

const cloudWorkspace = {
  profile: { displayName: "Contoso", attributes: [{ label: "Tenant ID", value: "real-tenant" }] },
  azureEntraUsers: [{ displayName: "Ada Lovelace", userPrincipalName: "ada@contoso.com" }],
  azureEntraGroups: [{ displayName: "Engineers" }],
  azureEntraApps: [{ displayName: "orders-api", appId: "app-1" }],
  azureEntraStatusMessage: "Loaded 1 user(s), 1 group(s), 1 app registration(s).",
} as unknown as WorkspaceSnapshot;

const flociWorkspace = {
  profile: { displayName: "floci-az", attributes: [{ label: "Tenant ID", value: "cloudsprocket-local" }] },
  azureEntraUsers: [],
  azureEntraGroups: [],
  azureEntraApps: [],
} as unknown as WorkspaceSnapshot;

describe("AzureEntraView", () => {
  it("lists directory users, groups, and app registrations on a cloud profile", () => {
    render(
      <ThemeProvider>
        <AzureEntraView workspace={cloudWorkspace} />
      </ThemeProvider>,
    );
    expect(screen.getByText("Ada Lovelace")).toBeTruthy();
    expect(screen.getByText("Engineers")).toBeTruthy();
    expect(screen.getByText("orders-api")).toBeTruthy();
  });

  it("shows a cloud-only empty state on floci-az", () => {
    render(
      <ThemeProvider>
        <AzureEntraView workspace={flociWorkspace} />
      </ThemeProvider>,
    );
    expect(screen.getByText("Directory is cloud-only")).toBeTruthy();
  });
});
