// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useCallback, useMemo, type Dispatch, type SetStateAction } from "react";
import { Bug, LayoutGrid, Rocket, Server } from "lucide-react";

import type { Command } from "@/components/command-palette";
import type { NavConnectionHeader, NavGroup, RailConnection } from "@/components/shell/types";
import type { Status } from "@/components/status-dot";
import {
  authLabel,
  navItemForTab,
  profileInitials,
  providerStatus,
  toActivityEntries,
  viewLabelFor,
} from "@/lib/workspace-shell";
import type {
  ActivityLogEntry,
  ProfileSummary,
  ProviderSummary,
  SessionSnapshot,
  WorkspaceSnapshot,
  WorkspaceTab,
} from "@/types/backend";

export type UseAppShellNavigationParams = {
  session: SessionSnapshot;
  profiles: ProfileSummary[];
  providers: ProviderSummary[];
  selectedProvider: ProviderSummary | undefined;
  selectedProfile: ProfileSummary | undefined;
  workspace: WorkspaceSnapshot;
  activeWorkspaceTabId: string;
  setActiveWorkspaceTabId: Dispatch<SetStateAction<string>>;
  activeS3PageId: string;
  setActiveS3PageId: Dispatch<SetStateAction<string>>;
  setActiveAzurePageId: Dispatch<SetStateAction<string>>;
  activeAzureStoragePageId: string;
  setActiveAzureStoragePageId: Dispatch<SetStateAction<string>>;
  workspaceFetching: boolean;
  workspaceLoading: boolean;
  workspaceLoaded: boolean;
  logs: ActivityLogEntry[];
  mutateSession: (method: string, params?: Record<string, unknown>) => Promise<void>;
  refreshDiscovery: () => Promise<void>;
  openResetModal: () => void;
};

export function useAppShellNavigation(params: UseAppShellNavigationParams) {
  const {
    session,
    profiles,
    providers,
    selectedProvider,
    selectedProfile,
    workspace,
    activeWorkspaceTabId,
    setActiveWorkspaceTabId,
    setActiveAzurePageId,
    workspaceFetching,
    workspaceLoading,
    workspaceLoaded,
    logs,
    mutateSession,
    refreshDiscovery,
    openResetModal,
  } = params;

  const lockedProfile = profiles.find((profile) => profile.profileId === session.lockedProfileId);
  const activeProvider = selectedProvider ?? workspace.provider;
  const emulatorCount = workspace.emulatorSummaries.length;
  const dockerReachable = workspace.dockerRuntime.reachable;
  const isLocalActive = activeWorkspaceTabId === "virtualisation";
  const isDeployActive = activeWorkspaceTabId === "deploy";
  const isDeveloperToolsActive = activeWorkspaceTabId === "developer-tools";
  const activeConnectionId = isDeployActive
    ? "deploy"
    : isLocalActive
      ? "local"
      : isDeveloperToolsActive
        ? "developer-tools"
        : session.currentProviderId ?? null;

  const railConnections: RailConnection[] = useMemo(
    () => [
      ...providers.map((provider) => {
        const lockedOnProvider =
          session.isLocked && session.lockedProviderId === provider.providerId;
        const providerProfile = lockedOnProvider
          ? profiles.find((profile) => profile.profileId === session.lockedProfileId)
          : undefined;
        const region =
          lockedOnProvider && provider.providerId === "aws"
            ? workspace.selectedEc2Region
            : undefined;
        const tooltipParts = [provider.label];
        if (lockedOnProvider && providerProfile) {
          tooltipParts.push(providerProfile.displayName);
          if (region) {
            tooltipParts.push(region);
          }
          const auth = authLabel(session.lockedAuthMethod ?? session.selectedAuthMethod);
          if (auth) {
            tooltipParts.push(auth);
          }
        } else if (provider.profileCount) {
          tooltipParts.push(
            `${provider.profileCount} profile${provider.profileCount === 1 ? "" : "s"}`,
          );
        } else if (provider.state !== "configured") {
          tooltipParts.push("Setup required");
        }
        return {
          id: provider.providerId,
          label: provider.profileCount
            ? `${provider.label} · ${provider.profileCount} profile${provider.profileCount === 1 ? "" : "s"}`
            : provider.label,
          tooltip: tooltipParts.join(" · "),
          provider: provider.providerId,
          profileBadge:
            lockedOnProvider && providerProfile
              ? profileInitials(providerProfile.displayName)
              : undefined,
          status: providerStatus(provider),
          kind: "provider" as const,
        };
      }),
      {
        id: "developer-tools",
        label: "Developer Toolbox",
        tooltip: "Developer Toolbox · JSON, YAML, diff, encoders",
        status: "on" as Status,
        kind: "tools" as const,
      },
      {
        id: "local",
        label: "Local Runtime",
        tooltip: dockerReachable
          ? "Local Runtime · Docker running"
          : "Local Runtime · Docker not detected",
        status: (dockerReachable ? "on" : "off") as Status,
        kind: "local" as const,
      },
      {
        id: "deploy",
        label: "Deploy",
        tooltip: "Deploy · IaC recipes",
        status: "on" as Status,
        kind: "deploy" as const,
      },
    ],
    [
      dockerReachable,
      profiles,
      providers,
      session.isLocked,
      session.lockedAuthMethod,
      session.lockedProfileId,
      session.lockedProviderId,
      session.selectedAuthMethod,
      workspace.selectedEc2Region,
    ],
  );

  const navConnection: NavConnectionHeader = useMemo(() => {
    if (isDeployActive) {
      return {
        name: "Deploy",
        meta: "IaC recipes",
        status: "on",
        statusText: "Provision stacks with OpenTofu",
      };
    }
    if (isLocalActive) {
      return {
        name: "Local Runtime",
        meta: `Docker · ${emulatorCount} emulator${emulatorCount === 1 ? "" : "s"}`,
        status: dockerReachable ? "on" : "off",
        statusText: dockerReachable ? "Docker engine running" : "Docker engine not detected",
      };
    }
    if (isDeveloperToolsActive) {
      return {
        name: "Developer Toolbox",
        meta: "Local utilities",
        status: "on",
        statusText: "Private scratch tools — nothing leaves this app",
      };
    }
    return {
      name: session.isLocked
        ? (lockedProfile ?? selectedProfile)?.displayName ?? activeProvider?.label ?? "Workspace"
        : activeProvider?.label ?? "Getting started",
      meta: session.isLocked
        ? [activeProvider?.label, authLabel(session.lockedAuthMethod ?? session.selectedAuthMethod)]
            .filter(Boolean)
            .join(" · ") || "Workspace open"
        : selectedProfile?.displayName ?? "Pick a profile to begin",
      provider: activeProvider?.providerId,
      status: activeProvider ? providerStatus(activeProvider) : "off",
      statusText: session.isLocked
        ? "Workspace open"
        : activeProvider?.summary ?? "Choose a connection to start",
    };
  }, [
    activeProvider,
    dockerReachable,
    emulatorCount,
    isDeployActive,
    isDeveloperToolsActive,
    isLocalActive,
    lockedProfile,
    selectedProfile,
    session.isLocked,
    session.lockedAuthMethod,
    session.selectedAuthMethod,
  ]);

  const navGroups = useMemo((): NavGroup[] => {
    if (isDeveloperToolsActive) {
      return [
        {
          label: "Developer",
          items: [{ id: "debug", label: "Debug console", icon: Bug }],
        },
      ];
    }
    if (isDeployActive) {
      return [
        {
          label: "Deploy",
          items: [
            { id: "deploy", label: "Recipes", icon: Rocket },
            { id: "debug", label: "Debug console", icon: Bug },
          ],
        },
      ];
    }
    if (isLocalActive) {
      return [
        {
          label: "Runtime",
          items: [
            { id: "virtualisation", label: "Emulators", icon: Server, count: emulatorCount },
            { id: "debug", label: "Debug console", icon: Bug },
          ],
        },
      ];
    }
    if (!session.isLocked) {
      return [
        { label: "Set up", items: [{ id: "overview", label: "Connect", icon: LayoutGrid }] },
        { label: "Tools", items: [{ id: "debug", label: "Debug console", icon: Bug }] },
      ];
    }
    const countsPending = workspaceFetching || (workspaceLoading && !workspaceLoaded);
    const tabCategory = (tab: WorkspaceTab): "workspace" | "service" | "tool" | "coming_soon" => {
      if (
        tab.category === "workspace" ||
        tab.category === "service" ||
        tab.category === "tool" ||
        tab.category === "coming_soon"
      ) {
        return tab.category;
      }
      if (tab.tabId === "overview" || tab.tabId === "virtualisation" || tab.tabId === "actions") {
        return "workspace";
      }
      if (
        tab.tabId === "azure-tools" ||
        tab.tabId === "azure-waf" ||
        tab.tabId === "azure-log-analytics" ||
        tab.tabId === "azure-front-door" ||
        tab.tabId === "logs"
      ) {
        return "tool";
      }
      return "service";
    };
    const entries = session.workspaceTabs.map((tab) => {
      const item = navItemForTab(tab, workspace);
      const navItem =
        countsPending && item.count != null
          ? { ...item, count: undefined, countLoading: true }
          : item;
      return { item: navItem, category: tabCategory(tab) };
    });
    const workspaceItems = entries.filter((entry) => entry.category === "workspace").map((entry) => entry.item);
    const toolItems = entries.filter((entry) => entry.category === "tool").map((entry) => entry.item);
    const serviceItems = entries
      .filter((entry) => entry.category === "service" || entry.category === "coming_soon")
      .map((entry) => entry.item);
    const groups: NavGroup[] = [];
    if (workspaceItems.length > 0) {
      groups.push({ label: "Workspace", items: workspaceItems });
    }
    if (toolItems.length > 0) {
      groups.push({ label: "Tools", items: toolItems });
    }
    if (serviceItems.length > 0) {
      groups.push({ label: "Services", items: serviceItems });
    }
    // S3 and Azure Storage are single path-browser surfaces (no sub-rail pages).
    groups.push({
      label: "Developer",
      items: [{ id: "debug", label: "Debug console", icon: Bug }],
    });
    return groups;
  }, [
    activeWorkspaceTabId,
    emulatorCount,
    isDeployActive,
    isDeveloperToolsActive,
    isLocalActive,
    session.isLocked,
    session.workspaceTabs,
    workspace,
    workspaceFetching,
    workspaceLoaded,
    workspaceLoading,
  ]);

  const activeNavItemId = activeWorkspaceTabId;

  const viewLabel =
    activeWorkspaceTabId === "settings"
      ? "Services"
      : !session.isLocked && activeWorkspaceTabId === "overview"
        ? "Connect"
        : viewLabelFor(activeWorkspaceTabId, session.workspaceTabs);

  const activityEntries = useMemo(() => toActivityEntries(logs), [logs]);

  const handleRailSelect = useCallback(
    (id: string): void => {
      if (id === "developer-tools") {
        setActiveWorkspaceTabId("developer-tools");
        return;
      }
      if (id === "local") {
        setActiveWorkspaceTabId("virtualisation");
        return;
      }
      if (id === "deploy") {
        setActiveWorkspaceTabId("deploy");
        return;
      }
      if (id !== session.currentProviderId) {
        void mutateSession("session.selectProvider", { providerId: id });
      }
      setActiveWorkspaceTabId("overview");
    },
    [mutateSession, session.currentProviderId, setActiveWorkspaceTabId],
  );

  const handleNavSelect = useCallback(
    (id: string): void => {
      const comingSoonTab = session.workspaceTabs.find(
        (tab) => tab.tabId === id && tab.category === "coming_soon",
      );
      if (comingSoonTab) {
        return;
      }
      const separator = id.indexOf(":");
      if (separator >= 0) {
        const tabId = id.slice(0, separator);
        const pageId = id.slice(separator + 1);
        setActiveWorkspaceTabId(tabId);
        // Legacy deep-links (s3:objects, azure-storage:blobs) still open the
        // parent tab; storage is now a single browser with no sub-pages.
        if (tabId === "azure-overview") {
          setActiveAzurePageId(pageId);
        }
        return;
      }
      setActiveWorkspaceTabId(id);
      if (id === "azure-overview") {
        setActiveAzurePageId("overview");
      }
    },
    [
      session.workspaceTabs,
      setActiveAzurePageId,
      setActiveWorkspaceTabId,
    ],
  );

  const paletteCommands: Command[] = useMemo(
    () => [
      ...railConnections.map((connection) => ({
        id: `conn:${connection.id}`,
        group: "Go to",
        label: connection.label,
        keywords: "connection provider",
        run: () => handleRailSelect(connection.id),
      })),
      ...navGroups.flatMap((group) =>
        group.items
          .filter((item) => !item.comingSoon)
          .map((item) => ({
            id: `nav:${group.label}:${item.id}`,
            group: group.label,
            label: item.label,
            run: () => handleNavSelect(item.id),
          })),
      ),
      {
        id: "act:refresh",
        group: "Actions",
        label: "Refresh discovery",
        keywords: "reload",
        run: () => {
          void refreshDiscovery();
        },
      },
      {
        id: "act:deploy",
        group: "Actions",
        label: "Deploy a recipe",
        keywords: "iac opentofu recipe",
        run: () => handleRailSelect("deploy"),
      },
      {
        id: "act:debug",
        group: "Actions",
        label: "Open debug console",
        keywords: "logs",
        run: () => setActiveWorkspaceTabId("debug"),
      },
      {
        id: "act:developer-tools",
        group: "Actions",
        label: "Open developer toolbox",
        keywords: "json yaml diff encode arn azure resource id jwt",
        run: () => setActiveWorkspaceTabId("developer-tools"),
      },
      {
        id: "act:reset",
        group: "Actions",
        label: "Reset app data",
        keywords: "clear wipe",
        run: openResetModal,
      },
    ],
    [
      handleNavSelect,
      handleRailSelect,
      navGroups,
      openResetModal,
      railConnections,
      refreshDiscovery,
      setActiveWorkspaceTabId,
    ],
  );

  return {
    lockedProfile,
    isDeveloperToolsActive,
    activeConnectionId,
    railConnections,
    navConnection,
    navGroups,
    activeNavItemId,
    viewLabel,
    activityEntries,
    paletteCommands,
    handleRailSelect,
    handleNavSelect,
  };
}