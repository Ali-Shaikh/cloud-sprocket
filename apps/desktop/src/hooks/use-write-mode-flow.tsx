// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import {
  startTransition,
  useCallback,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

import { backendRequest } from "@/lib/backend";
import { awsWriteEnableDialogIntent, awsWriteTargetSummary } from "@/lib/aws-write-policy";
import { notify } from "@/lib/notify";
import { applySessionWriteModeToWorkspace, normaliseSessionSnapshot } from "@/lib/workspace-snapshot";
import type { ProfileSummary, SessionSnapshot, WorkspaceSnapshot } from "@/types/backend";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export type UseWriteModeFlowParams = {
  session: SessionSnapshot;
  activeWorkspace: WorkspaceSnapshot;
  workspace: WorkspaceSnapshot;
  lockedProfile: ProfileSummary | undefined;
  setSession: Dispatch<SetStateAction<SessionSnapshot>>;
  setWorkspace: Dispatch<SetStateAction<WorkspaceSnapshot>>;
};

type WriteModeDialogIntent = "enable-local" | "enable-cloud" | "incapable";

export function useWriteModeFlow(params: UseWriteModeFlowParams) {
  const { session, activeWorkspace, workspace, lockedProfile, setSession, setWorkspace } = params;

  const [writeModeDialogOpen, setWriteModeDialogOpen] = useState(false);
  const [writeModeDialogIntent, setWriteModeDialogIntent] = useState<WriteModeDialogIntent>("enable-local");
  const [writeModePending, setWriteModePending] = useState(false);
  const [cloudWriteAcknowledged, setCloudWriteAcknowledged] = useState(false);
  const writeModeRequestRef = useRef(0);

  const writeModeEnabled =
    session.lockedProviderId === "azure"
      ? activeWorkspace.azureWriteModeEnabled
      : session.lockedProviderId === "gcp"
        ? Boolean(activeWorkspace.gcpWriteModeEnabled)
        : activeWorkspace.awsWriteModeEnabled;
  const writeModeCapable =
    session.lockedProviderId === "azure"
      ? activeWorkspace.azureWriteCapable
      : session.lockedProviderId === "gcp"
        ? Boolean(activeWorkspace.gcpWriteCapable)
        : activeWorkspace.awsWriteCapable;

  const setWriteMode = useCallback(
    (enabled: boolean): void => {
      const token = ++writeModeRequestRef.current;
      setWriteModePending(true);
      void backendRequest<SessionSnapshot>("session.setWriteMode", { enabled })
        .then((sessionResult) => {
          if (token !== writeModeRequestRef.current) {
            return;
          }
          const normalisedSession = normaliseSessionSnapshot(sessionResult);
          startTransition(() => {
            setSession(normalisedSession);
            setWorkspace((currentWorkspace) =>
              applySessionWriteModeToWorkspace(currentWorkspace, normalisedSession),
            );
          });
          setWriteModeDialogOpen(false);
          setCloudWriteAcknowledged(false);
        })
        .catch((error: unknown) => {
          if (token !== writeModeRequestRef.current) {
            return;
          }
          notify("error", "Write mode", error instanceof Error ? error.message : String(error));
        })
        .finally(() => {
          if (token === writeModeRequestRef.current) {
            setWriteModePending(false);
          }
        });
    },
    [setSession, setWorkspace],
  );

  const requestWriteModeChange = useCallback((): void => {
    if (writeModePending) {
      return;
    }
    if (writeModeEnabled) {
      void setWriteMode(false);
      return;
    }
    if (!writeModeCapable) {
      setWriteModeDialogIntent("incapable");
    } else if (session.lockedProviderId === "aws") {
      setWriteModeDialogIntent(awsWriteEnableDialogIntent(activeWorkspace));
      setCloudWriteAcknowledged(false);
    } else if (session.lockedProviderId === "gcp") {
      // GCP mutations always target the live project for the active gcloud configuration.
      setWriteModeDialogIntent("enable-cloud");
      setCloudWriteAcknowledged(false);
    } else {
      setWriteModeDialogIntent("enable-local");
    }
    setWriteModeDialogOpen(true);
  }, [
    activeWorkspace,
    session.lockedProviderId,
    setWriteMode,
    writeModeCapable,
    writeModeEnabled,
    writeModePending,
  ]);

  const profileLabel =
    workspace.profile?.displayName || lockedProfile?.displayName || "Workspace";
  const gcpProject =
    activeWorkspace.profile?.attributes.find((field) => field.label.toLowerCase() === "project")
      ?.value ||
    lockedProfile?.attributes.find((field) => field.label.toLowerCase() === "project")?.value;
  const targetLabel =
    session.lockedProviderId === "azure"
      ? activeWorkspace.azureEndpointUrl || "Azure CLI"
      : session.lockedProviderId === "gcp"
        ? gcpProject
          ? `gcloud · project ${gcpProject}`
          : "gcloud (live project)"
        : awsWriteTargetSummary(activeWorkspace);

  const writeModeDialog: ReactNode = (
    <AlertDialog
      open={writeModeDialogOpen}
      onOpenChange={(open) => {
        setWriteModeDialogOpen(open);
        if (!open) {
          setCloudWriteAcknowledged(false);
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {writeModeDialogIntent === "incapable"
              ? "This profile cannot enable write mode"
              : writeModeDialogIntent === "enable-cloud"
                ? session.lockedProviderId === "gcp"
                  ? "Enable write mode on live GCP?"
                  : "Enable write mode on live AWS?"
                : "Enable write mode for this session?"}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm text-muted-foreground">
              {writeModeDialogIntent === "incapable" ? (
                <p>
                  {session.lockedProviderId === "azure"
                    ? "Write mode needs the floci-az local profile or an Azure CLI sign-in. Real cloud profiles require the CLI to be available."
                    : session.lockedProviderId === "gcp"
                      ? "Open a locked GCP workspace before changing write mode."
                      : "Open a locked AWS workspace before changing write mode."}
                </p>
              ) : writeModeDialogIntent === "enable-cloud" ? (
                <>
                  <p className="font-medium text-destructive">
                    {session.lockedProviderId === "gcp"
                      ? "Mutating actions will hit your live GCP project for the rest of this locked session."
                      : "Mutating actions will hit your live AWS account for the rest of this locked session."}
                  </p>
                  <ul className="list-disc space-y-1 pl-5">
                    <li>Creates, updates, and deletes are real and may be irreversible.</li>
                    <li>
                      {session.lockedProviderId === "gcp"
                        ? "Billing, quotas, and IAM permissions apply as in the Google Cloud console."
                        : "Billing, quotas, and IAM permissions apply as in the AWS console."}
                    </li>
                    <li>
                      {session.lockedProviderId === "gcp"
                        ? "Confirm the active gcloud configuration and project before enabling writes."
                        : "Prefer a local endpoint profile when you are experimenting."}
                    </li>
                  </ul>
                  <p>
                    <span className="font-semibold text-foreground">Profile:</span> {profileLabel}
                  </p>
                  <p>
                    <span className="font-semibold text-foreground">Target:</span> {targetLabel}
                  </p>
                  <label className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-foreground">
                    <input
                      type="checkbox"
                      checked={cloudWriteAcknowledged}
                      onChange={(event) => setCloudWriteAcknowledged(event.target.checked)}
                      className="mt-0.5 size-4 shrink-0 accent-destructive"
                    />
                    <span>
                      {session.lockedProviderId === "gcp" ? (
                        <>
                          I understand write mode will send mutating gcloud commands to the live GCP
                          project for profile <span className="font-semibold">{profileLabel}</span>.
                        </>
                      ) : (
                        <>
                          I understand write mode will send mutating API calls to the live AWS account
                          for profile <span className="font-semibold">{profileLabel}</span>.
                        </>
                      )}
                    </span>
                  </label>
                </>
              ) : (
                <>
                  <p>
                    {session.lockedProviderId === "azure"
                      ? "Mutating actions (resource group create/delete, blob upload/delete) will target the endpoint below for the rest of this locked session."
                      : "Mutating actions (S3 uploads, EC2 start/stop/reboot, Lambda invoke/create) will be sent to the endpoint below for the rest of this locked session."}
                  </p>
                  <p>
                    <span className="font-semibold text-foreground">Profile:</span> {profileLabel}
                  </p>
                  <p>
                    <span className="font-semibold text-foreground">Target:</span> {targetLabel}
                  </p>
                </>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button
            variant="outline"
            disabled={writeModePending}
            onClick={() => setWriteModeDialogOpen(false)}
          >
            Cancel
          </Button>
          {writeModeDialogIntent !== "incapable" ? (
            <Button
              variant="destructive"
              disabled={
                writeModePending ||
                (writeModeDialogIntent === "enable-cloud" && !cloudWriteAcknowledged)
              }
              onClick={() => {
                setWriteMode(true);
              }}
            >
              {writeModePending
                ? "Enabling..."
                : writeModeDialogIntent === "enable-cloud"
                  ? session.lockedProviderId === "gcp"
                    ? "Enable live GCP writes"
                    : "Enable live AWS writes"
                  : "Enable writes"}
            </Button>
          ) : null}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return {
    writeModeEnabled,
    writeModeCapable,
    requestWriteModeChange,
    writeModeDialog,
  };
}