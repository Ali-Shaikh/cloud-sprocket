import {
  AppLayout,
  Box,
  Flashbar,
  SplitPanel,
} from "@cloudscape-design/components";
import type { FlashbarProps, PropertyFilterProps } from "@cloudscape-design/components";
import {
  lazy,
  Suspense,
  startTransition,
  useEffect,
  useEffectEvent,
  useState,
} from "react";
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
} from "./types/backend";
import { defaultQuery, renderLogEntries, type TablePreferences } from "./views/shared";

const SessionSetupView = lazy(() => import("./views/SessionSetupView"));
const WorkspaceView = lazy(() => import("./views/WorkspaceView"));

function getDefaultSplitPanelSize(viewportWidth: number): number {
  if (viewportWidth < 820) {
    return 280;
  }
  if (viewportWidth < 1180) {
    return 300;
  }
  return 360;
}

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
  s3ObjectMetadata: [],
  ec2Instances: [],
};

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
  const [splitPanelSize, setSplitPanelSize] = useState(() =>
    getDefaultSplitPanelSize(window.innerWidth),
  );
  const [providerQuery, setProviderQuery] = useState<PropertyFilterProps.Query>(
    defaultQuery,
  );
  const [profileQuery, setProfileQuery] = useState<PropertyFilterProps.Query>(defaultQuery);
  const [providerPreferences, setProviderPreferences] = useState<TablePreferences>({
    wrapLines: false,
    stripedRows: true,
    contentDensity: "comfortable",
    contentDisplay: [
      { id: "provider", visible: true },
      { id: "state", visible: true },
      { id: "profiles", visible: true },
      { id: "summary", visible: true },
    ],
  });
  const [profilePreferences, setProfilePreferences] = useState<TablePreferences>({
    wrapLines: false,
    stripedRows: true,
    contentDensity: "comfortable",
    contentDisplay: [
      { id: "name", visible: true },
      { id: "identifier", visible: true },
      { id: "summary", visible: true },
    ],
  });

  const isTablet = viewportWidth < 1180;
  const defaultSplitPanelSize = getDefaultSplitPanelSize(viewportWidth);

  const selectedProvider = providers.find(
    (provider) => provider.providerId === session.currentProviderId,
  );
  const selectedProfile = profiles.find(
    (profile) => profile.profileId === session.selectedProfileId,
  );
  const latestLog = logs[0];

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
    setProfileQuery(defaultQuery());
  }, [session.currentProviderId]);

  useEffect(() => {
    if (isTablet) {
      setSplitPanelOpen(false);
    }
  }, [isTablet]);

  useEffect(() => {
    setSplitPanelSize(defaultSplitPanelSize);
  }, [defaultSplitPanelSize]);

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

  const splitPanel = (
    <SplitPanel header="Recent Activity">
      <div className="log-stream">{renderLogEntries(logs)}</div>
    </SplitPanel>
  );

  const content = session.isLocked ? (
    <WorkspaceView
      session={session}
      workspace={workspace}
      latestLog={latestLog}
      splitPanelOpen={splitPanelOpen}
      showSensitiveValues={showSensitiveValues}
      onToggleSplitPanel={() => {
        setSplitPanelOpen((current) => !current);
      }}
      onRefreshDiscovery={() => {
        void refreshDiscovery();
      }}
      onUnlockSession={() => {
        void mutateSession("session.unlock");
      }}
      onToggleSensitiveValues={() => {
        setShowSensitiveValues((current) => !current);
      }}
      onSelectS3Bucket={(bucketName) => {
        void backendRequest<WorkspaceSnapshot>("aws.s3.selectBucket", { bucketName }).then(
          (workspaceResult) => {
            startTransition(() => {
              setWorkspace(workspaceResult);
            });
          },
        );
      }}
      onSelectS3Object={(objectKey) => {
        void backendRequest<WorkspaceSnapshot>("aws.s3.selectObject", { objectKey }).then(
          (workspaceResult) => {
            startTransition(() => {
              setWorkspace(workspaceResult);
            });
          },
        );
      }}
      onSetS3PrefixFilter={(prefix) => {
        void backendRequest<WorkspaceSnapshot>("aws.s3.setPrefixFilter", { prefix }).then(
          (workspaceResult) => {
            startTransition(() => {
              setWorkspace(workspaceResult);
            });
          },
        );
      }}
    />
  ) : (
    <SessionSetupView
      providers={providers}
      profiles={profiles}
      session={session}
      selectedProvider={selectedProvider}
      selectedProfile={selectedProfile}
      appSettings={appSettings}
      latestLog={latestLog}
      loading={loading}
      isTablet={isTablet}
      showSensitiveValues={showSensitiveValues}
      splitPanelOpen={splitPanelOpen}
      providerQuery={providerQuery}
      profileQuery={profileQuery}
      providerPreferences={providerPreferences}
      profilePreferences={profilePreferences}
      onToggleSensitiveValues={() => {
        setShowSensitiveValues((current) => !current);
      }}
      onToggleSplitPanel={() => {
        setSplitPanelOpen((current) => !current);
      }}
      onProviderQueryChange={setProviderQuery}
      onProfileQueryChange={setProfileQuery}
      onProviderPreferencesChange={setProviderPreferences}
      onProfilePreferencesChange={setProfilePreferences}
      onRefreshDiscovery={() => {
        void refreshDiscovery();
      }}
      onSelectProvider={(providerId) => {
        void mutateSession("session.selectProvider", { providerId });
      }}
      onSelectProfile={(providerId, profileId) => {
        void mutateSession("session.selectProfile", { providerId, profileId });
      }}
      onSelectAuthMethod={(authMethod) => {
        void mutateSession("session.selectAuthMethod", { authMethod });
      }}
      onLockSession={() => {
        void mutateSession("session.lock");
      }}
    />
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
        splitPanelSize={splitPanelSize}
        onSplitPanelResize={({ detail }) => {
          setSplitPanelSize(detail.size);
        }}
        onSplitPanelToggle={({ detail }) => {
          setSplitPanelOpen(detail.open);
        }}
        content={
          <Suspense
            fallback={
              <Box padding="l" color="text-body-secondary">
                Loading workspace shell...
              </Box>
            }
          >
            {content}
          </Suspense>
        }
      />
    </div>
  );
}
