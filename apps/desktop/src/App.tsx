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
  JobStatus,
  ProfileSummary,
  ProviderSummary,
  SessionSnapshot,
  StateChangedPayload,
  WorkspaceTab,
} from "./types/backend";

const emptySession: SessionSnapshot = {
  isLocked: false,
  availableAuthMethods: [],
  workspaceTabs: [],
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
  const [logs, setLogs] = useState<ActivityLogEntry[]>([]);
  const [notifications, setNotifications] = useState<FlashbarProps.MessageDefinition[]>([]);
  const [loading, setLoading] = useState(true);

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
      const logsResult = await backendRequest<ActivityLogEntry[]>("logs.list", {
        limit: 50,
      });
      startTransition(() => {
        setProviders(providersResult);
        setProfiles(profilesResult);
        setSession(sessionResult);
        setLogs(logsResult);
      });
    } finally {
      setLoading(false);
    }
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

  const sessionSetupView = (
    <SpaceBetween size="l">
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
    </SpaceBetween>
  );

  const workspaceView = (
    <SpaceBetween size="l">
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

      <Tabs tabs={session.workspaceTabs.map(makeWorkspaceTab)} />
    </SpaceBetween>
  );

  const splitPanel = (
    <SplitPanel header="Recent Activity">
      <div className="log-stream">
        {logs.length === 0 ? (
          <Box color="text-status-inactive">No activity recorded yet.</Box>
        ) : (
          logs.map((entry) => (
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
          ))
        )}
      </div>
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
        splitPanelOpen
        splitPanelSize={320}
        content={session.isLocked ? workspaceView : sessionSetupView}
      />
    </div>
  );
}
