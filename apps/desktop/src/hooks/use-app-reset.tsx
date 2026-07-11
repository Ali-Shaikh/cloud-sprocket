// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { startTransition, useCallback, useState, type Dispatch, type MutableRefObject, type ReactNode, type SetStateAction } from "react";

import { clearDebugLogs, backendRequest } from "@/lib/backend";
import { emptySession } from "@/lib/workspace-snapshot";
import { clearOnboardingState } from "@/views/onboarding/onboarding-state";
import type { NotificationTone } from "@/lib/notify";
import type { ActivityLogEntry, AppResetResult, HiddenResourceHit, PreferencesSnapshot, SessionSnapshot } from "@/types/backend";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export type UseAppResetParams = {
  resetWorkspaceUiState: () => void;
  loadState: () => Promise<void>;
  pushNotification: (tone: NotificationTone, header: string, content: string) => void;
  clearNotifications: () => void;
  setSession: Dispatch<SetStateAction<SessionSnapshot>>;
  setLogs: Dispatch<SetStateAction<ActivityLogEntry[]>>;
  setPreferencesSnapshot: Dispatch<SetStateAction<PreferencesSnapshot | null>>;
  setHiddenResourceHits: Dispatch<SetStateAction<HiddenResourceHit[]>>;
  setHiddenResourceEnablingServiceId: Dispatch<SetStateAction<string | null>>;
  hiddenResourcesProbeKeyRef: MutableRefObject<string | null>;
  setActiveWorkspaceTabId: Dispatch<SetStateAction<string>>;
  setSplitPanelOpen: Dispatch<SetStateAction<boolean>>;
  setNotificationsOpen: Dispatch<SetStateAction<boolean>>;
};

export function useAppReset(params: UseAppResetParams) {
  const {
    resetWorkspaceUiState,
    loadState,
    pushNotification,
    clearNotifications,
    setSession,
    setLogs,
    setPreferencesSnapshot,
    setHiddenResourceHits,
    setHiddenResourceEnablingServiceId,
    hiddenResourcesProbeKeyRef,
    setActiveWorkspaceTabId,
    setSplitPanelOpen,
    setNotificationsOpen,
  } = params;

  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetConfirmation, setResetConfirmation] = useState("");
  const [resetInFlight, setResetInFlight] = useState(false);

  const openResetModal = useCallback(() => {
    setResetModalOpen(true);
  }, []);

  const resetAppData = useCallback(async (): Promise<void> => {
    if (resetConfirmation !== "RESET") {
      return;
    }

    setResetInFlight(true);
    try {
      const result = await backendRequest<AppResetResult>("app.reset", {
        confirmation: resetConfirmation,
      });
      clearDebugLogs();
      // Reset restores default service enablement, so the first-run wizard
      // (whose job is choosing providers) must run again on next launch.
      clearOnboardingState();
      startTransition(() => {
        setSession(emptySession);
        resetWorkspaceUiState();
        setLogs([]);
        setPreferencesSnapshot(null);
        setHiddenResourceHits([]);
        setHiddenResourceEnablingServiceId(null);
        hiddenResourcesProbeKeyRef.current = null;
        setActiveWorkspaceTabId("overview");
        setSplitPanelOpen(false);
        setNotificationsOpen(false);
      });
      clearNotifications();
      setResetModalOpen(false);
      setResetConfirmation("");
      void loadState().catch((error: unknown) => {
        const message =
          error instanceof Error ? error.message : "Provider discovery reload failed after reset";
        pushNotification("warning", "Reset completed, reload failed", message);
      });
      pushNotification("success", "App reset complete", result.summary);
    } catch (error) {
      const message = error instanceof Error ? error.message : "App reset failed";
      pushNotification("error", "Failed to reset app", message);
    } finally {
      setResetInFlight(false);
    }
  }, [
    clearNotifications,
    hiddenResourcesProbeKeyRef,
    loadState,
    pushNotification,
    resetConfirmation,
    resetWorkspaceUiState,
    setActiveWorkspaceTabId,
    setHiddenResourceEnablingServiceId,
    setHiddenResourceHits,
    setLogs,
    setNotificationsOpen,
    setPreferencesSnapshot,
    setSession,
    setSplitPanelOpen,
  ]);

  const resetDialog: ReactNode = (
    <AlertDialog
      open={resetModalOpen}
      onOpenChange={(open) => {
        if (!open && !resetInFlight) {
          setResetModalOpen(false);
          setResetConfirmation("");
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reset app data</AlertDialogTitle>
          <AlertDialogDescription>
            This clears CloudSprocket session state, activity logs, cached inventory, debug logs,
            and app-managed local runtime files. It does not touch AWS, Azure, or GCP config files
            outside the CloudSprocket app data folder.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Input
          value={resetConfirmation}
          placeholder="RESET"
          aria-label="Reset confirmation"
          disabled={resetInFlight}
          onChange={(event) => {
            setResetConfirmation(event.target.value);
          }}
        />
        <AlertDialogFooter>
          <Button
            variant="ghost"
            disabled={resetInFlight}
            onClick={() => {
              setResetModalOpen(false);
              setResetConfirmation("");
            }}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={resetConfirmation !== "RESET" || resetInFlight}
            onClick={() => {
              void resetAppData();
            }}
          >
            {resetInFlight ? "Resetting..." : "Reset app"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return {
    resetModalOpen,
    openResetModal,
    resetDialog,
  };
}