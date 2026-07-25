// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useCallback, useMemo, type Dispatch, type SetStateAction } from "react";
import { Bug, LayoutGrid, Rocket, Server } from "lucide-react";

import type { Command } from "@/components/command-palette";
import type { NavConnectionHeader, NavGroup, RailConnection } from "@/components/shell/types";
import type { Status } from "@/components/status-dot";
import type { DeployRailBadge } from "@/lib/deploy-activity";
import type { NavigationLocation } from "@/lib/navigation-location";
import { orderItemsByPins, type RecentNavigationEntry } from "@/lib/navigation-recents";
import type { CliSnippet } from "@/lib/resource-cli";
import { filterResourceHits, type ResourceSearchHit } from "@/lib/resource-search";
import { groupByServiceDomain } from "@/lib/service-domains";
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
  /** Prefer this for user-initiated tab jumps so history/recents stay in sync. */
  navigateToTab?: (tabId: string) => void;
  navigateToLocation?: (location: NavigationLocation) => void;
  setActiveAzurePageId: Dispatch<SetStateAction<string>>;
  workspaceFetching: boolean;
  workspaceLoading: boolean;
  workspaceLoaded: boolean;
  logs: ActivityLogEntry[];
  requestProviderSwitch: (providerId: string) => void;
  refreshDiscovery: () => Promise<void>;
  openResetModal: () => void;
  deployBadge?: DeployRailBadge | null;
  recents?: RecentNavigationEntry[];
  pins?: string[];
  togglePinnedTab?: (tabId: string) => void;
  canGoBack?: boolean;
  canGoForward?: boolean;
  goBack?: () => void;
  goForward?: () => void;
  resourceHits?: ResourceSearchHit[];
  selectedCli?: CliSnippet | null;
  onCopyCli?: (command: string) => void;
  onOpenShortcuts?: () => void;
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
    navigateToTab,
    navigateToLocation,
    setActiveAzurePageId,
    workspaceFetching,
    workspaceLoading,
    workspaceLoaded,
    logs,
    requestProviderSwitch,
    refreshDiscovery,
    openResetModal,
    deployBadge,
    recents = [],
    pins = [],
    togglePinnedTab,
    canGoBack = false,
    canGoForward = false,
    goBack,
    goForward,
    resourceHits = [],
    selectedCli,
    onCopyCli,
    onOpenShortcuts,
  } = params;

  const goToTab = useCallback(
    (tabId: string) => {
      if (navigateToTab) {
        navigateToTab(tabId);
        return;
      }
      setActiveWorkspaceTabId(tabId);
    },
    [navigateToTab, setActiveWorkspaceTabId],
  );

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
        tooltip: deployBadge?.tooltip ?? "Deploy · IaC recipes",
        status: (deployBadge?.status ?? "on") as Status,
        kind: "deploy" as const,
        alertBadge: deployBadge
          ? { text: deployBadge.text, status: deployBadge.status }
          : undefined,
      },
    ],
    [
      deployBadge,
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

  const workspaceNavGroups = useMemo((): NavGroup[] => {
    if (!session.isLocked) {
      return [];
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
      return { item: navItem, category: tabCategory(tab), domain: tab.domain };
    });
    const workspaceItems = entries.filter((entry) => entry.category === "workspace").map((entry) => entry.item);
    const toolItems = entries.filter((entry) => entry.category === "tool").map((entry) => entry.item);
    const serviceEntries = entries.filter(
      (entry) => entry.category === "service" || entry.category === "coming_soon",
    );
    const groups: NavGroup[] = [];
    if (workspaceItems.length > 0) {
      groups.push({ label: "Workspace", items: workspaceItems });
    }
    if (toolItems.length > 0) {
      groups.push({ label: "Tools", items: toolItems });
    }
    for (const domainGroup of groupByServiceDomain(serviceEntries, (entry) => entry.domain)) {
      groups.push({
        id: domainGroup.id,
        label: domainGroup.label,
        items: domainGroup.items.map((entry) => entry.item),
        collapsible: true,
      });
    }
    // S3 and Azure Storage are single path-browser surfaces (no sub-rail pages).
    groups.push({
      label: "Developer",
      items: [{ id: "debug", label: "Debug console", icon: Bug }],
    });
    if (pins.length > 0) {
      return groups.map((group) =>
        group.collapsible || group.label === "Workspace" || group.label === "Tools"
          ? { ...group, items: orderItemsByPins(group.items, pins) }
          : group,
      );
    }
    return groups;
  }, [
    pins,
    session.isLocked,
    session.workspaceTabs,
    workspace,
    workspaceFetching,
    workspaceLoaded,
    workspaceLoading,
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
    return workspaceNavGroups;
  }, [
    emulatorCount,
    isDeployActive,
    isDeveloperToolsActive,
    isLocalActive,
    session.isLocked,
    workspaceNavGroups,
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
        goToTab("developer-tools");
        return;
      }
      if (id === "local") {
        goToTab("virtualisation");
        return;
      }
      if (id === "deploy") {
        goToTab("deploy");
        return;
      }
      if (id !== session.currentProviderId) {
        // Locked workspaces confirm before discard; overview is applied after
        // a successful switch (or immediately when unlocked).
        requestProviderSwitch(id);
        return;
      }
      goToTab("overview");
    },
    [goToTab, requestProviderSwitch, session.currentProviderId],
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
        goToTab(tabId);
        // Legacy deep-links (s3:objects, azure-storage:blobs) still open the
        // parent tab; storage is now a single browser with no sub-pages.
        if (tabId === "azure-overview") {
          setActiveAzurePageId(pageId);
        }
        return;
      }
      goToTab(id);
      if (id === "azure-overview") {
        setActiveAzurePageId("overview");
      }
    },
    [goToTab, session.workspaceTabs, setActiveAzurePageId],
  );

  const paletteCommands: Command[] = useMemo(() => {
    const areaCommands = navGroups.flatMap((group) =>
      group.items
        .filter((item) => !item.comingSoon)
        .map((item) => ({
          id: `nav:${group.label}:${item.id}`,
          group: group.label,
          label: item.label,
          run: () => handleNavSelect(item.id),
        })),
    );
    // When a workspace is locked but the user is on Deploy / Local Runtime /
    // Developer Toolbox, still offer workspace service tabs in the palette so
    // they can jump without returning to the sidebar first. Dedup by tab id so
    // shared entries like Debug console are not listed twice under different
    // group labels.
    const onNonWorkspaceArea = isDeployActive || isLocalActive || isDeveloperToolsActive;
    const seenTabIds = new Set(
      navGroups.flatMap((group) =>
        group.items.filter((item) => !item.comingSoon).map((item) => item.id),
      ),
    );
    const workspaceCommands =
      session.isLocked && onNonWorkspaceArea
        ? workspaceNavGroups.flatMap((group) =>
            group.items
              .filter((item) => !item.comingSoon && !seenTabIds.has(item.id))
              .map((item) => {
                seenTabIds.add(item.id);
                return {
                  id: `nav:${group.label}:${item.id}`,
                  group: group.label,
                  label: item.label,
                  run: () => handleNavSelect(item.id),
                };
              }),
          )
        : [];

    const recentCommands: Command[] = recents.slice(0, 8).map((entry, index) => ({
      id: `recent:${index}:${entry.tabId}:${entry.focus?.resourceKey ?? ""}`,
      group: "Jump back in",
      label: entry.label ?? entry.tabId,
      hint: entry.focus?.resourceKey ? entry.tabId : undefined,
      keywords: `recent ${entry.tabId} ${entry.focus?.resourceKey ?? ""}`,
      run: () => {
        if (entry.focus && navigateToLocation) {
          navigateToLocation(entry);
          return;
        }
        handleNavSelect(entry.tabId);
      },
    }));

    const resourceCommands: Command[] = filterResourceHits(resourceHits, "", 25).map((hit) => {
      const tabId =
        hit.params.provider === "azure"
          ? hit.params.tab
          : hit.params.tab.replace(/^aws-/, "");
      return {
        id: `res:${hit.id}`,
        group: "Resources",
        label: hit.label,
        hint: hit.service,
        keywords: `${hit.service} ${hit.keywords} resource`,
        run: () => {
          if (navigateToLocation) {
            navigateToLocation({
              tabId,
              label: hit.label,
              focus: hit.params,
            });
            return;
          }
          handleNavSelect(tabId);
        },
      };
    });

    const historyCommands: Command[] = [];
    if (canGoBack && goBack) {
      historyCommands.push({
        id: "act:back",
        group: "Navigation",
        label: "Go back",
        keywords: "history previous",
        run: goBack,
      });
    }
    if (canGoForward && goForward) {
      historyCommands.push({
        id: "act:forward",
        group: "Navigation",
        label: "Go forward",
        keywords: "history next",
        run: goForward,
      });
    }

    const pinCommands: Command[] = [];
    if (togglePinnedTab && session.isLocked) {
      const isPinned = pins.includes(activeWorkspaceTabId);
      pinCommands.push({
        id: "act:pin-tab",
        group: "Actions",
        label: isPinned ? "Unpin current service" : "Pin current service",
        keywords: "favourite favorite pin",
        run: () => togglePinnedTab(activeWorkspaceTabId),
      });
    }

    const cliCommands: Command[] = [];
    if (selectedCli && onCopyCli) {
      cliCommands.push({
        id: "act:copy-cli",
        group: "Actions",
        label: `Copy as CLI: ${selectedCli.label}`,
        keywords: "aws az cli copy command",
        run: () => onCopyCli(selectedCli.command),
      });
    }

    const shortcutCommands: Command[] = onOpenShortcuts
      ? [
          {
            id: "act:shortcuts",
            group: "Actions",
            label: "Keyboard shortcuts",
            keywords: "cheatsheet help keys",
            run: onOpenShortcuts,
          },
        ]
      : [];

    return [
      ...historyCommands,
      ...recentCommands,
      ...railConnections.map((connection) => ({
        id: `conn:${connection.id}`,
        group: "Go to",
        label: connection.label,
        keywords: "connection provider",
        run: () => handleRailSelect(connection.id),
      })),
      ...areaCommands,
      ...workspaceCommands,
      ...resourceCommands,
      ...cliCommands,
      ...pinCommands,
      ...shortcutCommands,
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
        run: () => goToTab("debug"),
      },
      {
        id: "act:developer-tools",
        group: "Actions",
        label: "Open developer toolbox",
        keywords: "json yaml diff encode arn azure resource id jwt",
        run: () => goToTab("developer-tools"),
      },
      {
        id: "act:reset",
        group: "Actions",
        label: "Reset app data",
        keywords: "clear wipe",
        destructive: true,
        run: openResetModal,
      },
    ];
  }, [
    activeWorkspaceTabId,
    canGoBack,
    canGoForward,
    goBack,
    goForward,
    goToTab,
    handleNavSelect,
    handleRailSelect,
    isDeployActive,
    isDeveloperToolsActive,
    isLocalActive,
    navGroups,
    navigateToLocation,
    onCopyCli,
    onOpenShortcuts,
    openResetModal,
    pins,
    railConnections,
    recents,
    refreshDiscovery,
    resourceHits,
    selectedCli,
    session.isLocked,
    togglePinnedTab,
    workspaceNavGroups,
  ]);

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
