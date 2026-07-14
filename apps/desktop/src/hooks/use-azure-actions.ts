// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { startTransition, useCallback } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import { azureInventoryLoaded } from "@/lib/azure-inventory";
import { backendRequest } from "@/lib/backend";
import { hasBackendErrorCode } from "@/lib/backend-error";
import type { NotificationTone } from "@/lib/notify";
import { requestWorkspaceSnapshot } from "@/lib/workspace-request";
import {
  formatBackendError,
  frontDoorTopologyLoaded,
  mergeAzureFrontDoorSelection,
  mergeAzureResourceGroupSelection,
  mergeAzureWafSelection,
  normaliseSessionSnapshot,
  normaliseWorkspaceSnapshot,
} from "@/lib/workspace-snapshot";
import type {
  AzureLogAnalyticsSelectionResult,
  SessionSnapshot,
  WorkspaceSnapshot,
} from "@/types/backend";

export type UseAzureActionsParams = {
  workspace: WorkspaceSnapshot;
  setWorkspace: Dispatch<SetStateAction<WorkspaceSnapshot>>;
  setSession: Dispatch<SetStateAction<SessionSnapshot>>;
  beginAzureInventoryFetch: () => void;
  endAzureInventoryFetch: () => void;
  pushNotification: (tone: NotificationTone, header: string, content: string) => void;
  frontDoorRefreshInFlightRef: MutableRefObject<boolean>;
  wafRefreshInFlightRef: MutableRefObject<boolean>;
  azureLogWorkspaceSelectionRequest: MutableRefObject<number>;
  setAzureLogWorkspaceSelectionLoading: Dispatch<SetStateAction<boolean>>;
  setAzureFrontDoorTopologyLoading: Dispatch<SetStateAction<boolean>>;
  setAzureWafConfigLoading: Dispatch<SetStateAction<boolean>>;
  setAzureFrontDoorActionStatus: Dispatch<SetStateAction<string>>;
};

export function useAzureActions({
  workspace,
  setWorkspace,
  setSession,
  beginAzureInventoryFetch,
  endAzureInventoryFetch,
  pushNotification,
  frontDoorRefreshInFlightRef,
  wafRefreshInFlightRef,
  azureLogWorkspaceSelectionRequest,
  setAzureLogWorkspaceSelectionLoading,
  setAzureFrontDoorTopologyLoading,
  setAzureWafConfigLoading,
  setAzureFrontDoorActionStatus,
}: UseAzureActionsParams) {
  const selectAzureWebAppSlot = useCallback(
    async (slot: string): Promise<void> => {
      beginAzureInventoryFetch();
      startTransition(() => {
        setSession((current) =>
          normaliseSessionSnapshot({
            ...current,
            selectedAzureWebAppSlot: slot,
          }),
        );
        setWorkspace((current) =>
          normaliseWorkspaceSnapshot({
            ...current,
            selectedAzureWebAppSlot: slot,
          }),
        );
      });
      try {
        const workspaceResult = await requestWorkspaceSnapshot("azure.webApps.selectSlot", {
          slot,
        });
        startTransition(() => {
          setWorkspace((current) => mergeAzureResourceGroupSelection(current, workspaceResult));
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Deployment slot selection failed";
        pushNotification("error", "Could not select deployment slot", message);
      } finally {
        endAzureInventoryFetch();
      }
    },
    [
      beginAzureInventoryFetch,
      endAzureInventoryFetch,
      pushNotification,
      setSession,
      setWorkspace,
    ],
  );

  const selectAzureWebApp = useCallback(
    async (appName: string): Promise<void> => {
      const trimmed = appName.trim();
      if (!trimmed) {
        return;
      }
      beginAzureInventoryFetch();
      startTransition(() => {
        setSession((current) =>
          normaliseSessionSnapshot({
            ...current,
            selectedAzureWebAppName: trimmed,
            selectedAzureWebAppSlot: undefined,
          }),
        );
        setWorkspace((current) =>
          normaliseWorkspaceSnapshot({
            ...current,
            selectedAzureWebAppName: trimmed,
            selectedAzureWebAppSlot: undefined,
            azureWebAppDeploymentSlots: [],
            azureWebAppSettings: [],
            azureWebAppActiveDetail: undefined,
          }),
        );
      });
      try {
        const workspaceResult = await requestWorkspaceSnapshot("azure.webApps.select", {
          appName: trimmed,
        });
        startTransition(() => {
          setWorkspace((current) => mergeAzureResourceGroupSelection(current, workspaceResult));
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "App Service selection failed";
        pushNotification("error", "Could not select web app", message);
      } finally {
        endAzureInventoryFetch();
      }
    },
    [
      beginAzureInventoryFetch,
      endAzureInventoryFetch,
      pushNotification,
      setSession,
      setWorkspace,
    ],
  );

  const selectAzureVirtualMachine = useCallback(
    async (vmId: string): Promise<void> => {
      const trimmed = vmId.trim();
      if (!trimmed) {
        return;
      }
      beginAzureInventoryFetch();
      startTransition(() => {
        setSession((current) =>
          normaliseSessionSnapshot({
            ...current,
            selectedAzureVmId: trimmed,
          }),
        );
        setWorkspace((current) =>
          normaliseWorkspaceSnapshot({
            ...current,
            selectedAzureVmId: trimmed,
          }),
        );
      });
      try {
        const workspaceResult = await requestWorkspaceSnapshot("azure.selectVirtualMachine", {
          vmId: trimmed,
        });
        startTransition(() => {
          setWorkspace((current) =>
            mergeAzureResourceGroupSelection(current, workspaceResult),
          );
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Virtual machine selection failed";
        pushNotification("error", "Could not select virtual machine", message);
      } finally {
        endAzureInventoryFetch();
      }
    },
    [
      beginAzureInventoryFetch,
      endAzureInventoryFetch,
      pushNotification,
      setSession,
      setWorkspace,
    ],
  );

  const selectAzureResourceGroup = useCallback(
    async (resourceGroup: string): Promise<void> => {
      const trimmed = resourceGroup.trim();
      if (!trimmed) {
        return;
      }
      beginAzureInventoryFetch();
      startTransition(() => {
        setSession((current) =>
          normaliseSessionSnapshot({
            ...current,
            selectedAzureResourceGroup: trimmed,
            selectedAzureVmId: undefined,
          }),
        );
        setWorkspace((current) =>
          normaliseWorkspaceSnapshot({
            ...current,
            selectedAzureResourceGroup: trimmed,
            selectedAzureVmId: undefined,
            azureVirtualMachines: [],
            azureWebApps: [],
            azureAppServicePlans: [],
            azureWebAppSettings: [],
            selectedAzureWebAppName: undefined,
            azureStatusMessage: `Loading virtual machines from ${trimmed}...`,
            azureAppServiceStatusMessage: `Loading App Service web apps from ${trimmed}...`,
          }),
        );
      });
      try {
        const workspaceResult = await requestWorkspaceSnapshot("azure.selectResourceGroup", {
          resourceGroup: trimmed,
        });
        startTransition(() => {
          setWorkspace((current) =>
            mergeAzureResourceGroupSelection(current, workspaceResult),
          );
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Resource group selection failed";
        pushNotification("error", "Could not load resource group inventory", message);
      } finally {
        endAzureInventoryFetch();
      }
    },
    [
      beginAzureInventoryFetch,
      endAzureInventoryFetch,
      pushNotification,
      setSession,
      setWorkspace,
    ],
  );

  const refreshAzureFrontDoorTopology = useCallback(
    async (
      current: WorkspaceSnapshot,
      sessionProfileId: string,
      options: { force?: boolean } = {},
    ): Promise<void> => {
      if (frontDoorRefreshInFlightRef.current) {
        return;
      }
      if (!options.force && frontDoorTopologyLoaded(current, sessionProfileId)) {
        setAzureFrontDoorTopologyLoading(false);
        return;
      }

      frontDoorRefreshInFlightRef.current = true;
      beginAzureInventoryFetch();
      setAzureFrontDoorTopologyLoading(true);
      try {
        const workspaceResult = await requestWorkspaceSnapshot("azure.frontDoor.refresh", {});
        startTransition(() => {
          setWorkspace((prev) => mergeAzureFrontDoorSelection(prev, workspaceResult));
        });
        setAzureFrontDoorActionStatus("");
      } catch (error) {
        pushNotification(
          "error",
          "Could not refresh Front Door topology",
          formatBackendError(error),
        );
        setAzureFrontDoorActionStatus(formatBackendError(error));
      } finally {
        frontDoorRefreshInFlightRef.current = false;
        endAzureInventoryFetch();
        setAzureFrontDoorTopologyLoading(false);
      }
    },
    [
      beginAzureInventoryFetch,
      endAzureInventoryFetch,
      frontDoorRefreshInFlightRef,
      pushNotification,
      setAzureFrontDoorActionStatus,
      setAzureFrontDoorTopologyLoading,
      setWorkspace,
    ],
  );

  const refreshAzureWafPolicyConfig = useCallback(
    async (current: WorkspaceSnapshot, sessionProfileId: string): Promise<void> => {
      if (wafRefreshInFlightRef.current) {
        return;
      }
      const selected =
        current.selectedAzureWafPolicy?.trim() ||
        current.azureWafPolicies?.[0]?.name?.trim() ||
        "";
      const inventoryReady =
        azureInventoryLoaded(current, "waf") && current.profile?.profileId === sessionProfileId;
      if (
        inventoryReady &&
        (!selected || current.azureWafPolicyDetail?.name === selected)
      ) {
        setAzureWafConfigLoading(false);
        return;
      }

      wafRefreshInFlightRef.current = true;
      beginAzureInventoryFetch();
      setAzureWafConfigLoading(true);
      try {
        let workspaceResult: WorkspaceSnapshot;
        try {
          workspaceResult = await requestWorkspaceSnapshot("azure.waf.refresh", {});
        } catch (error) {
          const message = formatBackendError(error);
          const missingRefresh =
            hasBackendErrorCode(error, "method_not_found") ||
            (message.includes("unknown backend method") &&
              message.includes("azure.waf.refresh"));
          if (!missingRefresh || !selected) {
            throw error;
          }
          workspaceResult = await requestWorkspaceSnapshot("azure.waf.selectPolicy", {
            policyName: selected,
          });
        }
        startTransition(() => {
          setWorkspace((prev) => mergeAzureWafSelection(prev, workspaceResult));
        });
      } catch (error) {
        pushNotification(
          "error",
          "Could not refresh WAF policy config",
          formatBackendError(error),
        );
      } finally {
        wafRefreshInFlightRef.current = false;
        endAzureInventoryFetch();
        setAzureWafConfigLoading(false);
      }
    },
    [
      beginAzureInventoryFetch,
      endAzureInventoryFetch,
      pushNotification,
      setAzureWafConfigLoading,
      setWorkspace,
      wafRefreshInFlightRef,
    ],
  );

  const selectAzureWafPolicy = useCallback(
    async (policyName: string): Promise<void> => {
      const trimmed = policyName.trim();
      if (!trimmed) {
        return;
      }
      const previousPolicy = workspace.selectedAzureWafPolicy;
      beginAzureInventoryFetch();
      startTransition(() => {
        setSession((current) =>
          normaliseSessionSnapshot({
            ...current,
            selectedAzureWafPolicy: trimmed,
          }),
        );
        setWorkspace((current) =>
          normaliseWorkspaceSnapshot({
            ...current,
            selectedAzureWafPolicy: trimmed,
          }),
        );
      });
      try {
        const workspaceResult = await requestWorkspaceSnapshot("azure.waf.selectPolicy", {
          policyName: trimmed,
        });
        startTransition(() => {
          setWorkspace((current) => mergeAzureWafSelection(current, workspaceResult));
        });
      } catch (error) {
        setWorkspace((current) => ({ ...current, selectedAzureWafPolicy: previousPolicy }));
        pushNotification("error", "Could not select WAF policy", formatBackendError(error));
      } finally {
        endAzureInventoryFetch();
      }
    },
    [
      beginAzureInventoryFetch,
      endAzureInventoryFetch,
      pushNotification,
      setSession,
      setWorkspace,
      workspace.selectedAzureWafPolicy,
    ],
  );

  const selectAzureLogAnalyticsWorkspace = useCallback(
    async (nextWorkspace: string): Promise<void> => {
      const requestID = ++azureLogWorkspaceSelectionRequest.current;
      const previousWorkspace = workspace.selectedAzureLogWorkspace;
      setAzureLogWorkspaceSelectionLoading(true);
      setWorkspace((current) => ({ ...current, selectedAzureLogWorkspace: nextWorkspace }));
      try {
        const result = await backendRequest<AzureLogAnalyticsSelectionResult>(
          "azure.logAnalytics.selectWorkspace",
          { workspace: nextWorkspace },
        );
        if (requestID !== azureLogWorkspaceSelectionRequest.current) return;
        setWorkspace((current) => ({ ...current, selectedAzureLogWorkspace: result.workspace }));
      } catch (error) {
        if (requestID !== azureLogWorkspaceSelectionRequest.current) return;
        setWorkspace((current) => ({ ...current, selectedAzureLogWorkspace: previousWorkspace }));
        const message = error instanceof Error ? error.message : "Workspace selection failed";
        pushNotification("error", "Could not select Log Analytics workspace", message);
      } finally {
        if (requestID === azureLogWorkspaceSelectionRequest.current) {
          setAzureLogWorkspaceSelectionLoading(false);
        }
      }
    },
    [
      azureLogWorkspaceSelectionRequest,
      pushNotification,
      setAzureLogWorkspaceSelectionLoading,
      setWorkspace,
      workspace.selectedAzureLogWorkspace,
    ],
  );

  return {
    selectAzureWebAppSlot,
    selectAzureWebApp,
    selectAzureVirtualMachine,
    selectAzureResourceGroup,
    refreshAzureFrontDoorTopology,
    refreshAzureWafPolicyConfig,
    selectAzureWafPolicy,
    selectAzureLogAnalyticsWorkspace,
  };
}
