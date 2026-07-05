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

export function useWriteModeFlow(params: UseWriteModeFlowParams) {
  const { session, activeWorkspace, workspace, lockedProfile, setSession, setWorkspace } = params;

  const [writeModeDialogOpen, setWriteModeDialogOpen] = useState(false);
  const [writeModeDialogIntent, setWriteModeDialogIntent] = useState<"enable" | "incapable">("enable");
  const [writeModePending, setWriteModePending] = useState(false);
  const writeModeRequestRef = useRef(0);

  const writeModeEnabled =
    session.lockedProviderId === "azure"
      ? activeWorkspace.azureWriteModeEnabled
      : activeWorkspace.awsWriteModeEnabled;
  const writeModeCapable =
    session.lockedProviderId === "azure"
      ? activeWorkspace.azureWriteCapable
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
    setWriteModeDialogIntent(writeModeCapable ? "enable" : "incapable");
    setWriteModeDialogOpen(true);
  }, [setWriteMode, writeModeCapable, writeModeEnabled, writeModePending]);

  const writeModeDialog: ReactNode = (
    <AlertDialog open={writeModeDialogOpen} onOpenChange={setWriteModeDialogOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {writeModeDialogIntent === "incapable"
              ? "This profile cannot enable write mode"
              : "Enable write mode for this session?"}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm text-muted-foreground">
              {writeModeDialogIntent === "incapable" ? (
                <p>
                  {session.lockedProviderId === "azure"
                    ? "Write mode needs the floci-az local profile or an Azure CLI sign-in. Real cloud profiles require the CLI to be available."
                    : "Write mode needs a profile with a local endpoint_url and cloudsprocket_allow_writes = true in your AWS config. Real AWS endpoints stay read-only in this release."}
                </p>
              ) : (
                <>
                  <p>
                    {session.lockedProviderId === "azure"
                      ? "Mutating actions (resource group create/delete, blob upload/delete) will target the endpoint below for the rest of this locked session."
                      : "Mutating actions (S3 uploads, EC2 start/stop/reboot, Lambda invoke/create) will be sent to the endpoint below for the rest of this locked session."}
                  </p>
                  <p>
                    <span className="font-semibold text-foreground">Profile:</span>{" "}
                    {workspace.profile?.displayName || lockedProfile?.displayName || "Workspace"}
                  </p>
                  <p>
                    <span className="font-semibold text-foreground">Target:</span>{" "}
                    {session.lockedProviderId === "azure"
                      ? activeWorkspace.azureEndpointUrl || "Azure CLI"
                      : activeWorkspace.awsEndpointUrl || "Default AWS endpoint"}
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
          {writeModeDialogIntent === "enable" ? (
            <Button
              variant="destructive"
              disabled={writeModePending}
              onClick={() => {
                setWriteMode(true);
              }}
            >
              {writeModePending ? "Enabling..." : "Enable writes"}
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