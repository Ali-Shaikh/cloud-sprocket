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
  useRef,
  useState,
} from "react";
import { backendRequest, subscribeToBackendEvent } from "./lib/backend";
import type {
  ActivityLogEntry,
  AppSettingsSnapshot,
  AwsS3PresignResult,
  AwsS3UploadResult,
  JobStatus,
  JobLifecycle,
  ProfileSummary,
  ProviderSummary,
  SessionSnapshot,
  StateChangedPayload,
  UrlInspection,
  UrlValidationResult,
  WorkspaceSnapshot,
} from "./types/backend";
import { defaultQuery, renderLogEntries, type TablePreferences } from "./views/shared";

const SessionSetupView = lazy(() => import("./views/SessionSetupView"));
const WorkspaceView = lazy(() => import("./views/WorkspaceView"));

type EC2LifecycleAction = "start" | "stop" | "reboot";

type EC2ActionHistoryItem = {
  jobId: string;
  status: JobLifecycle;
  message: string;
  completedAt?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isS3UploadResult(value: unknown): value is AwsS3UploadResult {
  return isRecord(value) && typeof value.destinationUri === "string";
}

function isS3PresignResult(value: unknown): value is AwsS3PresignResult {
  return isRecord(value) && typeof value.url === "string" && typeof value.objectKey === "string";
}

function isUrlValidationResult(value: unknown): value is UrlValidationResult {
  return isRecord(value) && typeof value.url === "string" && typeof value.summary === "string";
}

function isWorkspaceSnapshot(value: unknown): value is WorkspaceSnapshot {
  return isRecord(value) && Array.isArray(value.ec2Instances) && typeof value.runtimeSettings === "object";
}

function expectedEC2State(action: EC2LifecycleAction): string {
  return action === "stop" ? "stopped" : "running";
}

function ec2InstanceState(workspaceSnapshot: WorkspaceSnapshot, instanceId: string): string {
  return workspaceSnapshot.ec2Instances.find((instance) => instance.instanceId === instanceId)?.state?.toLowerCase() ?? "";
}

function wait(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, durationMs);
  });
}

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
  awsWritesEnabled: false,
  s3Buckets: [],
  s3Objects: [],
  s3ObjectMetadata: [],
  s3ExportSnippets: [],
  ec2Regions: [],
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
  const [s3UploadStatus, setS3UploadStatus] = useState("Select a bucket and provide a local file path to upload.");
  const [s3SignedUrlStatus, setS3SignedUrlStatus] = useState("Select an object to generate a signed URL.");
  const [s3SignedUrlResult, setS3SignedUrlResult] = useState<AwsS3PresignResult>();
  const [s3UrlInspection, setS3UrlInspection] = useState<UrlInspection>();
  const [s3UrlValidation, setS3UrlValidation] = useState<UrlValidationResult>();
  const [ec2ActionStatus, setEC2ActionStatus] = useState("Select an EC2 instance to run lifecycle actions.");
  const [ec2ActionInFlight, setEC2ActionInFlight] = useState(false);
  const [ec2ActionHistory, setEC2ActionHistory] = useState<EC2ActionHistoryItem[]>([]);
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
  const s3PrefixRequestIdRef = useRef(0);
  const ec2ActionPollRef = useRef(0);
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

  function cancelEC2Polling(): void {
    ec2ActionPollRef.current += 1;
  }

  async function pollEC2ActionResult(action: EC2LifecycleAction, instanceId: string): Promise<void> {
    const pollId = ec2ActionPollRef.current + 1;
    ec2ActionPollRef.current = pollId;
    const desiredState = expectedEC2State(action);
    let latestState = "";

    for (let attempt = 0; attempt < 20; attempt += 1) {
      await wait(attempt === 0 ? 900 : 1500);
      if (pollId !== ec2ActionPollRef.current) {
        return;
      }

      const workspaceResult = await backendRequest<WorkspaceSnapshot>("workspace.get");
      latestState = ec2InstanceState(workspaceResult, instanceId);
      startTransition(() => {
        setWorkspace(workspaceResult);
      });

      if (latestState === desiredState) {
        setEC2ActionStatus(`EC2 ${action} completed for ${instanceId}. Current state: ${latestState}.`);
        setEC2ActionInFlight(false);
        return;
      }
    }

    setEC2ActionStatus(
      `EC2 ${action} request was sent for ${instanceId}. Latest observed state: ${latestState || "unknown"}.`,
    );
    setEC2ActionInFlight(false);
  }

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
    if (job.label === "S3 Upload") {
      setS3UploadStatus(job.message);
      if (job.status === "completed" && isS3UploadResult(job.result)) {
        void loadWorkspace(session);
      }
    }
    if (job.label === "S3 Signed URL") {
      setS3SignedUrlStatus(job.message);
      if (isS3PresignResult(job.result)) {
        setS3SignedUrlResult(job.result);
      }
    }
    if (job.label === "S3 URL Validation") {
      if (isUrlValidationResult(job.result)) {
        setS3UrlValidation(job.result);
      }
    }
    if (job.label === "EC2 Action") {
      setEC2ActionStatus(job.message);
      setEC2ActionInFlight(job.status === "queued" || job.status === "running");
      setEC2ActionHistory((current) => {
        const next: EC2ActionHistoryItem = {
          jobId: job.jobId,
          status: job.status,
          message: job.message,
          completedAt: job.completedAt,
        };
        return [next, ...current.filter((item) => item.jobId !== job.jobId)].slice(0, 6);
      });
      const workspaceResult = job.result;
      if (job.status === "completed" && isWorkspaceSnapshot(workspaceResult)) {
        cancelEC2Polling();
        startTransition(() => {
          setWorkspace(workspaceResult);
        });
      } else if (job.status === "completed" || job.status === "failed") {
        cancelEC2Polling();
        void loadWorkspace(session);
      }
    }
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
      logs={logs}
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
      onInvokeWorkspaceAction={(actionId) => {
        void backendRequest<JobStatus>("actions.invoke", { actionId });
      }}
      onSelectS3Bucket={(bucketName) => {
        setS3SignedUrlResult(undefined);
        void backendRequest<WorkspaceSnapshot>("aws.s3.selectBucket", { bucketName }).then(
          (workspaceResult) => {
            startTransition(() => {
              setWorkspace(workspaceResult);
            });
          },
        );
      }}
      onSelectS3Object={(objectKey) => {
        setS3SignedUrlResult(undefined);
        void backendRequest<WorkspaceSnapshot>("aws.s3.selectObject", { objectKey }).then(
          (workspaceResult) => {
            startTransition(() => {
              setWorkspace(workspaceResult);
            });
          },
        );
      }}
      onSetS3PrefixFilter={(prefix) => {
        const requestId = s3PrefixRequestIdRef.current + 1;
        s3PrefixRequestIdRef.current = requestId;
        void backendRequest<WorkspaceSnapshot>("aws.s3.setPrefixFilter", { prefix }).then(
          (workspaceResult) => {
            if (requestId === s3PrefixRequestIdRef.current) {
              startTransition(() => {
                setWorkspace(workspaceResult);
              });
            }
          },
        );
      }}
      s3UploadStatus={s3UploadStatus}
      s3SignedUrlStatus={s3SignedUrlStatus}
      s3SignedUrlResult={s3SignedUrlResult}
      s3UrlInspection={s3UrlInspection}
      s3UrlValidation={s3UrlValidation}
      onUploadS3Object={(sourcePath, objectKey) => {
        setS3UploadStatus(`Queueing upload for ${objectKey}.`);
        void backendRequest<JobStatus>("aws.s3.uploadObject", { sourcePath, objectKey }).then(
          (job) => {
            setS3UploadStatus(job.message);
          },
        );
      }}
      onPresignS3Object={(durationSeconds) => {
        setS3SignedUrlResult(undefined);
        setS3SignedUrlStatus("Queueing signed URL generation.");
        void backendRequest<JobStatus>("aws.s3.presignObject", { durationSeconds }).then(
          (job) => {
            setS3SignedUrlStatus(job.message);
          },
        );
      }}
      onAnalyseS3Url={(url) => {
        void backendRequest<UrlInspection>("aws.s3.analyseUrl", { url }).then((inspection) => {
          setS3UrlInspection(inspection);
        });
      }}
      onValidateS3Url={(url) => {
        void backendRequest<JobStatus>("aws.s3.validateUrl", { url });
      }}
      ec2ActionStatus={ec2ActionStatus}
      ec2ActionInFlight={ec2ActionInFlight}
      ec2ActionHistory={ec2ActionHistory}
      onSelectEC2Region={(region) => {
        setEC2ActionStatus("Select an instance to run lifecycle actions.");
        setEC2ActionInFlight(false);
        cancelEC2Polling();
        void backendRequest<WorkspaceSnapshot>("aws.ec2.selectRegion", { region }).then(
          (workspaceResult) => {
            startTransition(() => {
              setWorkspace(workspaceResult);
            });
          },
        );
      }}
      onSelectEC2Instance={(instanceId) => {
        setEC2ActionStatus("Instance selected. EC2 lifecycle writes require a local endpoint profile with write opt-in.");
        setEC2ActionInFlight(false);
        cancelEC2Polling();
        void backendRequest<WorkspaceSnapshot>("aws.ec2.selectInstance", { instanceId }).then(
          (workspaceResult) => {
            startTransition(() => {
              setWorkspace(workspaceResult);
            });
          },
        );
      }}
      onInvokeEC2Action={(action, instanceId) => {
        setEC2ActionStatus(`Queueing EC2 ${action} for ${instanceId}.`);
        setEC2ActionInFlight(true);
        void backendRequest<JobStatus>("aws.ec2.invokeAction", { action, instanceId }).then(
          (job) => {
            setEC2ActionStatus(job.message);
            setEC2ActionInFlight(job.status === "queued" || job.status === "running");
            void pollEC2ActionResult(action, instanceId);
          },
        ).catch((error: unknown) => {
          setEC2ActionStatus(error instanceof Error ? error.message : String(error));
          setEC2ActionInFlight(false);
        });
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
