import {
  AppLayout,
  Badge,
  Box,
  Button,
  Container,
  Flashbar,
  Header,
  RadioGroup,
  SpaceBetween,
  SplitPanel,
  StatusIndicator,
  Table,
  Tabs,
} from "@cloudscape-design/components";
import type { FlashbarProps, TableProps, TabsProps } from "@cloudscape-design/components";
import { startTransition, useEffect, useEffectEvent, useState } from "react";
import { backendRequest, subscribeToBackendEvent } from "./lib/backend";
import type {
  ActivityLogEntry,
  AppSettingsSnapshot,
  JobStatus,
  ProfileSummary,
  ProviderSummary,
  SessionSnapshot,
  StateChangedPayload,
  WorkspaceSnapshot,
  WorkspaceTab,
} from "./types/backend";

const emptySession: SessionSnapshot = {
  isLocked: false,
  availableAuthMethods: [],
  workspaceTabs: [],
};

const emptySettings: AppSettingsSnapshot = {
  platformName: "",
  configDir: "",
  databasePath: "",
  logPath: "",
};

const emptyWorkspace: WorkspaceSnapshot = {
  runtimeSettings: emptySettings,
  s3Buckets: [],
  s3Objects: [],
  ec2Instances: [],
};

function statusType(provider: ProviderSummary): "success" | "warning" | "error" {
  if (provider.state === "configured") {
    return "success";
  }
  if (provider.state === "tooling-only") {
    return "warning";
  }
  return "error";
}

function badgeColour(level: ActivityLogEntry["level"]): "blue" | "green" | "grey" | "red" {
  if (level === "success") {
    return "green";
  }
  if (level === "warning") {
    return "grey";
  }
  if (level === "error") {
    return "red";
  }
  return "blue";
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function makeWorkspaceTab(tab: WorkspaceTab): TabsProps.Tab {
  return {
    id: tab.tabId,
    label: tab.label,
    content: (
      <Container
        header={
          <Header
            variant="h2"
            description={tab.summary}
          >
            {tab.label}
          </Header>
        }
      >
        <SpaceBetween size="m">
          <Box variant="p">{tab.detail}</Box>
          <Box color="text-body-secondary">
            This view is wired into the new workspace contract now, with the
            old Python controller being replaced slice by slice behind it.
          </Box>
        </SpaceBetween>
      </Container>
    ),
  };
}

export default function App() {
  const [providers, setProviders] = useState<ProviderSummary[]>([]);
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [session, setSession] = useState<SessionSnapshot>(emptySession);
  const [appSettings, setAppSettings] = useState<AppSettingsSnapshot>(emptySettings);
  const [workspace, setWorkspace] = useState<WorkspaceSnapshot>(emptyWorkspace);
  const [logs, setLogs] = useState<ActivityLogEntry[]>([]);
  const [notifications, setNotifications] = useState<FlashbarProps.MessageDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSensitiveValues, setShowSensitiveValues] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  const [splitPanelOpen, setSplitPanelOpen] = useState(() => window.innerWidth >= 1180);

  const isTablet = viewportWidth < 1180;
  const isMobile = viewportWidth < 820;

  const selectedProvider = providers.find(
    (provider) => provider.providerId === session.currentProviderId,
  );
  const selectedProfile = profiles.find(
    (profile) => profile.profileId === session.selectedProfileId,
  );

  const loadState = useEffectEvent(async () => {
    setLoading(true);
    try {
      const providersResult = await backendRequest<ProviderSummary[]>("providers.list");
      const sessionResult = await backendRequest<SessionSnapshot>("session.get");
      const profilesResult = await backendRequest<ProfileSummary[]>("profiles.list", {
        providerId: sessionResult.currentProviderId,
      });
      const settingsResult = await backendRequest<AppSettingsSnapshot>("app.settings.get");
      const logsResult = await backendRequest<ActivityLogEntry[]>("logs.list", {
        limit: 50,
      });
      startTransition(() => {
        setProviders(providersResult);
        setProfiles(profilesResult);
        setSession(sessionResult);
        setAppSettings(settingsResult);
        setLogs(logsResult);
      });
    } finally {
      setLoading(false);
    }
  });

  const loadWorkspace = useEffectEvent(async (nextSession: SessionSnapshot) => {
    if (!nextSession.isLocked) {
      startTransition(() => {
        setWorkspace(emptyWorkspace);
      });
      return;
    }

    const workspaceResult = await backendRequest<WorkspaceSnapshot>("workspace.get");
    startTransition(() => {
      setWorkspace(workspaceResult);
    });
  });

  const onStateChanged = useEffectEvent((payload: StateChangedPayload) => {
    startTransition(() => {
      setProviders(payload.providers);
      setProfiles(payload.profiles);
      setSession(payload.session);
    });
  });

  const onLogAppended = useEffectEvent((entry: ActivityLogEntry) => {
    startTransition(() => {
      setLogs((current) => [entry, ...current].slice(0, 50));
    });
  });

  const onJobUpdated = useEffectEvent((job: JobStatus) => {
    const type =
      job.status === "failed"
        ? "error"
        : job.status === "completed"
        ? "success"
        : "info";
    startTransition(() => {
      setNotifications((current) => {
        const next: FlashbarProps.MessageDefinition = {
          id: job.jobId,
          type,
          content: `${job.label}: ${job.message}`,
          dismissible: true,
          onDismiss: () => {
            setNotifications((items) => items.filter((item) => item.id !== job.jobId));
          },
        };
        return [next, ...current.filter((item) => item.id !== job.jobId)].slice(0, 3);
      });
    });
  });

  useEffect(() => {
    let active = true;
    const cleanups: Array<() => void> = [];

    void loadState();
    void Promise.all([
      subscribeToBackendEvent("state.changed", (payload) => {
        if (active) {
          onStateChanged(payload);
        }
      }),
      subscribeToBackendEvent("log.appended", (payload) => {
        if (active) {
          onLogAppended(payload);
        }
      }),
      subscribeToBackendEvent("job.updated", (payload) => {
        if (active) {
          onJobUpdated(payload);
        }
      }),
    ]).then((unsubscribers) => {
      cleanups.push(...unsubscribers);
    });

    return () => {
      active = false;
      cleanups.forEach((cleanup) => cleanup());
    };
  }, []);

  useEffect(() => {
    function onResize() {
      setViewportWidth(window.innerWidth);
    }

    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, []);

  useEffect(() => {
    void loadWorkspace(session);
  }, [
    session.isLocked,
    session.lockedAuthMethod,
    session.lockedProfileId,
    session.lockedProviderId,
  ]);

  useEffect(() => {
    setShowSensitiveValues(false);
  }, [selectedProfile?.profileId, session.isLocked]);

  useEffect(() => {
    if (isTablet) {
      setSplitPanelOpen(false);
    }
  }, [isTablet]);

  const providerColumns: TableProps.ColumnDefinition<ProviderSummary>[] = [
    {
      id: "provider",
      header: "Provider",
      cell: (provider) => provider.label,
    },
    {
      id: "state",
      header: "State",
      cell: (provider) => (
        <StatusIndicator type={statusType(provider)}>
          {provider.state}
        </StatusIndicator>
      ),
    },
    {
      id: "profiles",
      header: "Profiles",
      cell: (provider) => provider.profileCount,
    },
    {
      id: "summary",
      header: "Summary",
      cell: (provider) => provider.summary,
    },
  ];

  const profileColumns: TableProps.ColumnDefinition<ProfileSummary>[] = [
    {
      id: "name",
      header: "Profile",
      cell: (profile) => profile.displayName,
    },
    {
      id: "identifier",
      header: "Identifier",
      cell: (profile) => profile.profileId,
    },
    {
      id: "summary",
      header: "Summary",
      cell: (profile) => profile.summary,
    },
  ];

  async function mutateSession(
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<void> {
    await backendRequest<SessionSnapshot>(method, params);
    await loadState();
  }

  async function refreshDiscovery(): Promise<void> {
    await backendRequest<JobStatus>("actions.invoke", {
      actionId: "refresh",
    });
  }

  function renderProfileDetailPanel(
    profile: ProfileSummary | undefined,
    title: string,
    emptyMessage: string,
    description: string,
  ) {
    return (
      <Container
        header={
          <Header
            variant="h2"
            actions={
              <Button
                disabled={!profile?.attributes.some((attribute) => attribute.sensitive)}
                onClick={() => {
                  setShowSensitiveValues((current) => !current);
                }}
              >
                {showSensitiveValues ? "Hide Sensitive Values" : "Reveal Sensitive Values"}
              </Button>
            }
            description={
              profile
                ? `${profile.displayName} from ${profile.providerId.toUpperCase()}`
                : description
            }
          >
            {title}
          </Header>
        }
      >
        {profile ? (
          <SpaceBetween size="m">
            <div className="detail-grid">
              {profile.attributes.map((attribute) => (
                <div
                  key={`${attribute.label}-${attribute.value}`}
                  className="detail-card"
                >
                  <Box variant="awsui-key-label">{attribute.label}</Box>
                  <Box variant="p">
                    {attribute.sensitive && !showSensitiveValues
                      ? "Hidden until revealed"
                      : attribute.value}
                  </Box>
                </div>
              ))}
            </div>
            <div className="detail-grid">
              {profile.authMethods.map((method) => (
                <div
                  key={method.method}
                  className="detail-card"
                >
                  <Box variant="awsui-key-label">{method.label}</Box>
                  <StatusIndicator type={method.available ? "success" : "warning"}>
                    {method.available ? "Available" : "Unavailable"}
                  </StatusIndicator>
                  <Box color="text-body-secondary">{method.summary}</Box>
                </div>
              ))}
            </div>
            <div className="path-list">
              <Box variant="awsui-key-label">Source Paths</Box>
              {profile.sourcePaths.map((sourcePath) => (
                <Box
                  key={sourcePath}
                  variant="code"
                >
                  {sourcePath}
                </Box>
              ))}
            </div>
          </SpaceBetween>
        ) : (
          <Box color="text-status-inactive">{emptyMessage}</Box>
        )}
      </Container>
    );
  }

  function renderRuntimeSettingsPanel(
    settings: AppSettingsSnapshot,
    description: string,
  ) {
    return (
      <Container
        header={
          <Header
            variant="h2"
            description={description}
          >
            Runtime Settings
          </Header>
        }
      >
        <div className="detail-grid">
          <div className="detail-card">
            <Box variant="awsui-key-label">Platform</Box>
            <Box variant="p">{settings.platformName || "Unknown"}</Box>
          </div>
          <div className="detail-card">
            <Box variant="awsui-key-label">Config Root</Box>
            <Box variant="code">{settings.configDir || "Unavailable"}</Box>
          </div>
          <div className="detail-card">
            <Box variant="awsui-key-label">Database</Box>
            <Box variant="code">{settings.databasePath || "Unavailable"}</Box>
          </div>
          <div className="detail-card">
            <Box variant="awsui-key-label">Log Path</Box>
            <Box variant="code">{settings.logPath || "Unavailable"}</Box>
          </div>
        </div>
      </Container>
    );
  }

  const selectedProfileDetails = renderProfileDetailPanel(
    selectedProfile,
    "Profile Detail",
    "No profile selected yet.",
    "Choose a profile to inspect its attributes and source files.",
  );

  const runtimeSettingsPanel = renderRuntimeSettingsPanel(
    appSettings,
    "Paths and platform data coming from the Go daemon.",
  );

  const sessionSetupView = (
    <SpaceBetween
      size="l"
      className="page-stack"
    >
      <Container>
        <div className="hero-banner">
          <div>
            <Box variant="awsui-key-label">Control Desktop</Box>
            <Header
              variant="h1"
              description="Cloud auth, profile visibility, and service workspaces are moving into the new Tauri shell."
            >
              Session Setup
            </Header>
          </div>
          <div className="hero-metrics">
            <div className="hero-metric">
              <span className="hero-metric-value">{providers.length}</span>
              <span className="hero-metric-label">Providers</span>
            </div>
            <div className="hero-metric">
              <span className="hero-metric-value">{profiles.length}</span>
              <span className="hero-metric-label">Profiles</span>
            </div>
            <div className="hero-metric">
              <span className="hero-metric-value">
                {session.selectedAuthMethod?.toUpperCase() ?? "NONE"}
              </span>
              <span className="hero-metric-label">Auth Path</span>
            </div>
          </div>
        </div>
      </Container>

      <div className="setup-grid">
        <Container
          header={
            <Header
              variant="h2"
              actions={
                <Button
                  iconName="refresh"
                  onClick={() => {
                    void refreshDiscovery();
                  }}
                >
                  Refresh
                </Button>
              }
            >
              Providers
            </Header>
          }
        >
          <Table
            loading={loading}
            items={providers}
            columnDefinitions={providerColumns}
            selectionType="single"
            selectedItems={selectedProvider ? [selectedProvider] : []}
            trackBy="providerId"
            variant="embedded"
            empty={<Box color="text-status-inactive">No providers discovered yet.</Box>}
            onSelectionChange={({ detail }) => {
              const provider = detail.selectedItems[0];
              if (provider) {
                void mutateSession("session.selectProvider", {
                  providerId: provider.providerId,
                });
              }
            }}
          />
        </Container>

        <Container
          header={
            <Header
              variant="h2"
              description={selectedProvider?.summary ?? "Select a provider first."}
            >
              Profiles
            </Header>
          }
        >
          <Table
            loading={loading}
            items={profiles}
            columnDefinitions={profileColumns}
            selectionType="single"
            selectedItems={selectedProfile ? [selectedProfile] : []}
            trackBy="profileId"
            variant="embedded"
            empty={<Box color="text-status-inactive">No profiles visible for this provider.</Box>}
            onSelectionChange={({ detail }) => {
              const profile = detail.selectedItems[0];
              if (profile) {
                void mutateSession("session.selectProfile", {
                  providerId: profile.providerId,
                  profileId: profile.profileId,
                });
              }
            }}
          />
        </Container>
      </div>

      <Container
        header={
          <Header
            variant="h2"
            description={
              selectedProfile
                ? `Selected profile: ${selectedProfile.displayName}`
                : "Choose a profile before locking the session."
            }
          >
            Authentication Path
          </Header>
        }
        footer={
          <div className="session-actions">
            <Button
              onClick={() => {
                setSplitPanelOpen((current) => !current);
              }}
            >
              {splitPanelOpen ? "Hide Activity" : "Show Activity"}
            </Button>
            <Button
              variant="primary"
              disabled={!selectedProfile || !session.selectedAuthMethod}
              onClick={() => {
                void mutateSession("session.lock");
              }}
            >
              Lock Session
            </Button>
          </div>
        }
      >
        <SpaceBetween size="m">
          <RadioGroup
            value={session.selectedAuthMethod}
            items={session.availableAuthMethods.map((method) => ({
              value: method.method,
              label: method.label,
              description: method.summary,
              disabled: !method.available,
            }))}
            onChange={({ detail }) => {
              void mutateSession("session.selectAuthMethod", {
                authMethod: detail.value,
              });
            }}
          />
          <Box color="text-body-secondary">
            Locking the session establishes the context that the new Overview,
            S3, EC2, and Actions surfaces will use.
          </Box>
        </SpaceBetween>
      </Container>

      <div className="setup-grid">
        {selectedProfileDetails}
        {runtimeSettingsPanel}
      </div>
    </SpaceBetween>
  );

  function renderLogEntries(entries: ActivityLogEntry[]) {
    if (entries.length === 0) {
      return <Box color="text-status-inactive">No activity recorded yet.</Box>;
    }

    return entries.map((entry) => (
      <div
        key={entry.id}
        className={`log-entry log-entry-${entry.level}`}
      >
        <div className="log-entry-meta">
          <span>{new Date(entry.timestamp).toLocaleString()}</span>
          <Badge color={badgeColour(entry.level)}>{entry.level}</Badge>
        </div>
        <div>{entry.message}</div>
      </div>
    ));
  }

  const workspaceSummaryPanel = (
    <Container
      header={
        <Header
          variant="h2"
          description="Workspace scope and AWS inventory counts coming from the backend workspace snapshot."
        >
          Workspace Summary
        </Header>
      }
    >
      <div className="detail-grid">
        <div className="detail-card">
          <Box variant="awsui-key-label">Provider</Box>
          <Box variant="p">{workspace.provider?.label || "Unavailable"}</Box>
          {workspace.provider ? (
            <StatusIndicator type={statusType(workspace.provider)}>
              {workspace.provider.state}
            </StatusIndicator>
          ) : null}
        </div>
        <div className="detail-card">
          <Box variant="awsui-key-label">Profile</Box>
          <Box variant="p">{workspace.profile?.displayName || "Unavailable"}</Box>
          <Box color="text-body-secondary">
            {workspace.profile?.profileId || "No locked profile selected."}
          </Box>
        </div>
        <div className="detail-card">
          <Box variant="awsui-key-label">Auth Path</Box>
          <Box variant="p">{workspace.authMethod?.toUpperCase() || "Unavailable"}</Box>
          <Box color="text-body-secondary">
            Active auth method for the locked workspace.
          </Box>
        </div>
        <div className="detail-card">
          <Box variant="awsui-key-label">S3 Buckets</Box>
          <Box variant="p">{countLabel(workspace.s3Buckets.length, "bucket", "buckets")}</Box>
          <Box color="text-body-secondary">
            Resource inventory will expand as the AWS adapters are ported.
          </Box>
        </div>
        <div className="detail-card">
          <Box variant="awsui-key-label">S3 Objects</Box>
          <Box variant="p">{countLabel(workspace.s3Objects.length, "object", "objects")}</Box>
          <Box color="text-body-secondary">
            Current object sample visible through the workspace contract.
          </Box>
        </div>
        <div className="detail-card">
          <Box variant="awsui-key-label">EC2 Instances</Box>
          <Box variant="p">{countLabel(workspace.ec2Instances.length, "instance", "instances")}</Box>
          <Box color="text-body-secondary">
            Lifecycle actions will attach to this inventory next.
          </Box>
        </div>
      </div>
    </Container>
  );

  const workspaceProfileDetails = renderProfileDetailPanel(
    workspace.profile,
    "Workspace Profile",
    "No locked workspace profile is available yet.",
    "The locked workspace snapshot will populate this profile detail.",
  );

  const workspaceRuntimeSettingsPanel = renderRuntimeSettingsPanel(
    workspace.runtimeSettings,
    "Runtime settings embedded in the backend workspace snapshot.",
  );

  const overviewTab = (
    <SpaceBetween
      size="l"
      className="page-stack"
    >
      {workspaceSummaryPanel}
      <div className="setup-grid">
        {workspaceProfileDetails}
        {workspaceRuntimeSettingsPanel}
      </div>
      <Container
        header={
          <Header
            variant="h2"
            description="Recent backend activity for the locked workspace."
          >
            Workspace Activity
          </Header>
        }
      >
        <div className="log-stream">{renderLogEntries(logs.slice(0, 5))}</div>
      </Container>
    </SpaceBetween>
  );

  const workspaceView = (
    <SpaceBetween
      size="l"
      className="page-stack"
    >
      <Container
        header={
          <Header
            variant="h1"
            description={`${session.lockedProviderId?.toUpperCase()} / ${session.lockedProfileId} / ${session.lockedAuthMethod}`}
            actions={
              <SpaceBetween
                direction="horizontal"
                size="xs"
              >
                <Button
                  onClick={() => {
                    setSplitPanelOpen((current) => !current);
                  }}
                >
                  {splitPanelOpen ? "Hide Activity" : "Show Activity"}
                </Button>
                <Button
                  iconName="refresh"
                  onClick={() => {
                    void refreshDiscovery();
                  }}
                >
                  Refresh
                </Button>
                <Button
                  onClick={() => {
                    void mutateSession("session.unlock");
                  }}
                >
                  Unlock
                </Button>
              </SpaceBetween>
            }
          >
            Locked Workspace
          </Header>
        }
      >
        <Box color="text-body-secondary">
          The new shell keeps the full milestone 1 boundary visible while the Go
          daemon ports the old AWS behaviours behind the new RPC contract.
        </Box>
      </Container>

      <Tabs
        tabs={session.workspaceTabs.map((tab) =>
          tab.tabId === "overview"
            ? {
                id: tab.tabId,
                label: tab.label,
                content: overviewTab,
              }
            : makeWorkspaceTab(tab),
        )}
      />
    </SpaceBetween>
  );

  const splitPanel = (
    <SplitPanel header="Recent Activity">
      <div className="log-stream">{renderLogEntries(logs)}</div>
    </SplitPanel>
  );

  return (
    <div className="app-shell">
      <AppLayout
        navigationHide
        toolsHide
        contentType="default"
        notifications={<Flashbar items={notifications} />}
        splitPanel={splitPanel}
        splitPanelOpen={splitPanelOpen}
        splitPanelSize={isMobile ? 280 : isTablet ? 300 : 360}
        onSplitPanelToggle={({ detail }) => {
          setSplitPanelOpen(detail.open);
        }}
        content={session.isLocked ? workspaceView : sessionSetupView}
      />
    </div>
  );
}
