// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useCallback, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { ProfileSummary, ProviderSummary, SessionSnapshot } from "@/types/backend";

export type UseProviderSwitchFlowParams = {
  session: SessionSnapshot;
  providers: ProviderSummary[];
  profiles: ProfileSummary[];
  mutateSession: (method: string, params?: Record<string, unknown>) => Promise<boolean>;
  onSwitched: () => void;
};

export function useProviderSwitchFlow(params: UseProviderSwitchFlowParams) {
  const { session, providers, profiles, mutateSession, onSwitched } = params;
  const [pendingProviderId, setPendingProviderId] = useState<string | null>(null);
  const [switchPending, setSwitchPending] = useState(false);

  const lockedProfile = profiles.find(
    (profile) =>
      profile.profileId === session.lockedProfileId &&
      profile.providerId === session.lockedProviderId,
  );
  const lockedProfileName =
    lockedProfile?.displayName ??
    session.lockedProfileId ??
    "this workspace";

  const pendingProvider = providers.find((provider) => provider.providerId === pendingProviderId);
  const pendingProviderLabel = pendingProvider?.label ?? pendingProviderId ?? "provider";

  const applyProviderSwitch = useCallback(
    async (providerId: string): Promise<void> => {
      setSwitchPending(true);
      try {
        // Daemon policy (F-011): selectProvider refuses while locked. After the
        // leave-workspace dialog confirms, unlock explicitly, then select.
        // mutateSession swallows backend errors and returns false so callers
        // can avoid navigating away when the switch did not apply.
        if (session.isLocked) {
          const unlocked = await mutateSession("session.unlock");
          if (!unlocked) {
            return;
          }
        }
        const ok = await mutateSession("session.selectProvider", { providerId });
        if (ok) {
          onSwitched();
        }
      } finally {
        setSwitchPending(false);
        setPendingProviderId(null);
      }
    },
    [mutateSession, onSwitched, session.isLocked],
  );

  const requestProviderSwitch = useCallback(
    (providerId: string): void => {
      if (!providerId || providerId === session.currentProviderId) {
        return;
      }
      if (!session.isLocked) {
        void applyProviderSwitch(providerId);
        return;
      }
      setPendingProviderId(providerId);
    },
    [applyProviderSwitch, session.currentProviderId, session.isLocked],
  );

  const providerSwitchDialog: ReactNode = (
    <AlertDialog
      open={pendingProviderId != null}
      onOpenChange={(open) => {
        if (!open && !switchPending) {
          setPendingProviderId(null);
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Leave this workspace?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                You have an open workspace for{" "}
                <span className="font-semibold text-foreground">{lockedProfileName}</span>.
                Switching provider closes that workspace and returns you to the Connect screen.
              </p>
              <p>Nothing is deleted. You can reopen the profile at any time.</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button
            variant="outline"
            disabled={switchPending}
            onClick={() => setPendingProviderId(null)}
          >
            Cancel
          </Button>
          <Button
            disabled={switchPending || pendingProviderId == null}
            onClick={() => {
              if (pendingProviderId) {
                void applyProviderSwitch(pendingProviderId);
              }
            }}
          >
            {switchPending ? "Switching..." : `Switch to ${pendingProviderLabel}`}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return {
    requestProviderSwitch,
    providerSwitchDialog,
  };
}
