// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { startTransition } from "react";
import type { ReactNode } from "react";
import { backendRequest } from "@/lib/backend";
import { requestWorkspaceSnapshot } from "@/lib/workspace-request";
import {
  mergeAzureCosmosSelection,
  mergeAzureFrontDoorSelection,
  mergeAzureFunctionsSelection,
  mergeAzureKeyVaultSelection,
  mergeAzurePostgresSelection,
  mergeAzureQueuesSelection,
  mergeAzureStorageSelection,
  normaliseSessionSnapshot,
  normaliseWorkspaceSnapshot,
  formatBackendError,
} from "@/lib/workspace-snapshot";
import {
  AzureAppServiceView,
  AzureCosmosView,
  AzureEntraView,
  AzureFrontDoorView,
  AzureFunctionsView,
  AzureKeyVaultView,
  AzurePostgresView,
  AzureQueuesView,
  AzureStorageView,
  AzureView,
  AzureWafView,
  LogAnalyticsView,
  ToolsHubView,
} from "@/views/workspace/lazy-views";
import type {
  AzureBastionConnectResult,
  AzureBastionHost,
  AzureFunctionInvokeResult,
  AzureLogAnalyticsSavedQuery,
  AzureLogAnalyticsTableInfo,
  AzureLogQueryResult,
  AzureWafLogSchemaProfile,
  WorkspaceSnapshot,
} from "@/types/backend";
import type { AzureWorkspaceTabsProps } from "./workspace-tab-router-props";

const AZURE_TAB_IDS = new Set([
  "azure-overview",
  "azure-resource-groups",
  "azure-vms",
  "azure-storage",
  "azure-app-service",
  "azure-tools",
  "azure-log-analytics",
  "azure-waf",
  "azure-front-door",
  "azure-functions",
  "azure-key-vault",
  "azure-cosmos",
  "azure-postgres",
  "azure-queues",
  "azure-entra",
]);

export function AzureWorkspaceTabs(props: AzureWorkspaceTabsProps): ReactNode {
  const {
    activeWorkspaceTabId,
    setActiveWorkspaceTabId,
    session,
    activeWorkspace,
    workspace,
    selectedProvider,
    selectedProfile,
    profiles,
    providers,
    loading,
    openingProfileId,
    logs,
    showSensitiveValues,
    setShowSensitiveValues,
    activeS3PageId,
    setActiveS3PageId,
    activeAzurePageId,
    activeAzureStoragePageId,
    s3UploadStatus,
    setS3UploadStatus,
    s3SignedUrlStatus,
    setS3SignedUrlStatus,
    s3SignedUrlResult,
    s3UrlInspection,
    setS3UrlInspection,
    s3UrlValidation,
    ec2ActionStatus,
    ec2ActionInFlight,
    ec2ActionHistory,
    lambdaActionStatus,
    lambdaInvokeResult,
    lambdaInvokeInFlight,
    lambdaCreateInFlight,
    lambdaCreateFormOpen,
    setLambdaCreateFormOpen,
    dynamodbActionStatus,
    sqsActionStatus,
    sqsPeekResult,
    sqsPeekInFlight,
    snsActionStatus,
    rdsActionStatus,
    logsActionStatus,
    iamActionStatus,
    azureActionStatus,
    setAzureActionStatus,
    azureStorageActionStatus,
    setAzureStorageActionStatus,
    azureAppServiceActionStatus,
    setAzureAppServiceActionStatus,
    azureFrontDoorActionStatus,
    setAzureFrontDoorActionStatus,
    azureServiceInventoryLoading,
    azureLogWorkspaceSelectionLoading,
    azureWafConfigLoading,
    azureFrontDoorTopologyLoading,
    logAnalyticsPrefill,
    setLogAnalyticsPrefill,
    frontDoorAccessPrefill,
    setFrontDoorAccessPrefill,
    localStackAuthToken,
    setLocalStackAuthToken,
    localStackPersistence,
    setLocalStackPersistence,
    localStackEnvironmentText,
    setLocalStackEnvironmentText,
    localStackLogs,
    localStackLogsStatus,
    localStackActionStatus,
    localStackActionInFlight,
    flociAzPersistence,
    setFlociAzPersistence,
    flociAzEnvironmentText,
    setFlociAzEnvironmentText,
    flociAzLogs,
    flociAzLogsStatus,
    flociAzActionStatus,
    flociAzActionInFlight,
    setWorkspace,
    setSession,
    mutateWorkspaceSelection,
    mutateSession,
    refreshDiscovery,
    refreshDockerRuntime,
    refreshLocalStackLogs,
    refreshFlociAzLogs,
    refreshEC2Inventory,
    selectEC2Region,
    selectEC2Instance,
    invokeEC2LifecycleAction,
    refreshLambdaInventory,
    selectLambdaRegion,
    selectLambdaFunction,
    invokeLambda,
    createLambda,
    refreshDynamoDBInventory,
    selectDynamoDBRegion,
    selectDynamoDBTable,
    putDynamoDBItem,
    deleteDynamoDBItem,
    refreshSQSInventory,
    selectSQSRegion,
    selectSQSQueue,
    peekSQSQueue,
    sendSQSMessage,
    createSQSQueue,
    refreshSNSInventory,
    selectSNSRegion,
    selectSNSTopic,
    publishSNSTopic,
    createSNSTopic,
    refreshRDSInventory,
    selectRDSRegion,
    selectRDSInstance,
    refreshLogsInventory,
    selectLogsRegion,
    selectLogGroup,
    refreshIAMInventory,
    selectIAMRole,
    applyS3PrefixFilter,
    selectAzureResourceGroup,
    selectAzureVirtualMachine,
    selectAzureWebApp,
    selectAzureWebAppSlot,
    selectAzureLogAnalyticsWorkspace,
    selectAzureWafPolicy,
    refreshAzureFrontDoorTopology,
    listLogAnalyticsHistory,
    listLogAnalyticsSaved,
    invokeLocalStackAction,
    invokeFlociAzAction,
    openWorkspace,
    chooseAuthMethod,
  } = props;

  if (!session.isLocked || !AZURE_TAB_IDS.has(activeWorkspaceTabId)) {
    return null;
  }

  return session.isLocked &&
    ["azure-overview", "azure-resource-groups", "azure-vms"].includes(activeWorkspaceTabId) ? (
    <AzureView
      workspace={activeWorkspace}
      inventoryLoading={azureServiceInventoryLoading}
      activePageId={
        activeWorkspaceTabId === "azure-resource-groups"
          ? "resource-groups"
          : activeWorkspaceTabId === "azure-vms"
            ? "virtual-machines"
            : activeAzurePageId
      }
      showSensitiveValues={showSensitiveValues}
      actionStatus={azureActionStatus}
      onSelectResourceGroup={(resourceGroup) => {
        void selectAzureResourceGroup(resourceGroup);
      }}
      onSelectVirtualMachine={(vmId) => {
        void selectAzureVirtualMachine(vmId);
      }}
      onCreateResourceGroup={(name, location) => {
        setAzureActionStatus(`Creating resource group ${name}...`);
        void requestWorkspaceSnapshot("azure.resourceGroups.create", { name, location })
          .then((workspaceResult) => {
            startTransition(() => {
              setWorkspace(workspaceResult);
            });
            setAzureActionStatus(workspaceResult.azureStatusMessage || `Created resource group ${name}.`);
          })
          .catch((error: unknown) => {
            setAzureActionStatus(error instanceof Error ? error.message : String(error));
          });
      }}
      onDeleteResourceGroup={(name) => {
        setAzureActionStatus(`Deleting resource group ${name}...`);
        void requestWorkspaceSnapshot("azure.resourceGroups.delete", { name })
          .then((workspaceResult) => {
            startTransition(() => {
              setWorkspace(workspaceResult);
            });
            setAzureActionStatus(workspaceResult.azureStatusMessage || `Deleted resource group ${name}.`);
          })
          .catch((error: unknown) => {
            setAzureActionStatus(error instanceof Error ? error.message : String(error));
          });
      }}
      onInvokeVMAction={(action, vmId) => {
        setAzureActionStatus(`Invoking ${action} on virtual machine...`);
        void requestWorkspaceSnapshot("azure.virtualMachines.invokeAction", { action, vmId })
          .then((workspaceResult) => {
            startTransition(() => {
              setWorkspace(workspaceResult);
            });
            setAzureActionStatus(workspaceResult.azureStatusMessage || `Invoked ${action} on virtual machine.`);
          })
          .catch((error: unknown) => {
            setAzureActionStatus(error instanceof Error ? error.message : String(error));
          });
      }}
      onListBastionHosts={() =>
        backendRequest<{ hosts: AzureBastionHost[]; statusMessage: string }>("azure.bastion.list")
      }
      onBastionConnect={(request) =>
        backendRequest<AzureBastionConnectResult>("azure.bastion.connect", request)
      }
    />
  ) : session.isLocked && activeWorkspaceTabId === "azure-storage" ? (
    <AzureStorageView
      workspace={activeWorkspace}
      activePageId={activeAzureStoragePageId}
      actionStatus={azureStorageActionStatus}
      inventoryLoading={azureServiceInventoryLoading}
      onSelectAccount={(accountName) => {
        void mutateWorkspaceSelection("azure.storage.selectAccount", { accountName }, {
          panelLoading: true,
          merge: mergeAzureStorageSelection,
          onOptimistic: () => {
            setSession((current) =>
              normaliseSessionSnapshot({
                ...current,
                selectedAzureStorageAccount: accountName,
                selectedAzureBlobContainer: undefined,
                selectedAzureBlobName: undefined,
              }),
            );
            setWorkspace((current) =>
              normaliseWorkspaceSnapshot({
                ...current,
                selectedAzureStorageAccount: accountName,
                selectedAzureBlobContainer: undefined,
                selectedAzureBlobName: undefined,
                azureBlobContainers: [],
                azureBlobs: [],
              }),
            );
          },
          errorTitle: "Could not select storage account",
        });
      }}
      onSelectContainer={(containerName) => {
        void mutateWorkspaceSelection("azure.storage.selectContainer", { containerName }, {
          panelLoading: true,
          merge: mergeAzureStorageSelection,
          onOptimistic: () => {
            setSession((current) =>
              normaliseSessionSnapshot({
                ...current,
                selectedAzureBlobContainer: containerName,
                selectedAzureBlobName: undefined,
              }),
            );
            setWorkspace((current) =>
              normaliseWorkspaceSnapshot({
                ...current,
                selectedAzureBlobContainer: containerName,
                selectedAzureBlobName: undefined,
                azureBlobs: [],
              }),
            );
          },
          errorTitle: "Could not select blob container",
        });
      }}
      onSelectBlob={(blobName) => {
        void mutateWorkspaceSelection("azure.storage.selectBlob", { blobName }, {
          persistOnly: true,
          onOptimistic: () => {
            setSession((current) =>
              normaliseSessionSnapshot({
                ...current,
                selectedAzureBlobName: blobName,
              }),
            );
            setWorkspace((current) =>
              normaliseWorkspaceSnapshot({
                ...current,
                selectedAzureBlobName: blobName,
              }),
            );
          },
          errorTitle: "Could not select blob",
        });
      }}
      onSetPrefixFilter={(prefix) => {
        void mutateWorkspaceSelection("azure.storage.setPrefixFilter", { prefix }, {
          panelLoading: true,
          merge: mergeAzureStorageSelection,
          onOptimistic: () => {
            setSession((current) =>
              normaliseSessionSnapshot({
                ...current,
                azureBlobPrefixFilter: prefix,
                selectedAzureBlobName: undefined,
              }),
            );
            setWorkspace((current) =>
              normaliseWorkspaceSnapshot({
                ...current,
                azureBlobPrefixFilter: prefix,
                selectedAzureBlobName: undefined,
                azureBlobs: [],
              }),
            );
          },
          errorTitle: "Could not update blob prefix filter",
        });
      }}
      onCreateAccount={(resourceGroup, accountName, location) => {
        setAzureStorageActionStatus(`Creating storage account ${accountName}...`);
        void requestWorkspaceSnapshot("azure.storage.createAccount", {
          resourceGroup,
          accountName,
          location,
        })
          .then((workspaceResult) => {
            startTransition(() => {
              setWorkspace(workspaceResult);
            });
            setAzureStorageActionStatus(
              workspaceResult.azureStorageStatusMessage || `Created storage account ${accountName}.`,
            );
          })
          .catch((error: unknown) => {
            setAzureStorageActionStatus(error instanceof Error ? error.message : String(error));
          });
      }}
      onCreateContainer={(containerName) => {
        setAzureStorageActionStatus(`Creating container ${containerName}...`);
        void requestWorkspaceSnapshot("azure.storage.createContainer", { containerName })
          .then((workspaceResult) => {
            startTransition(() => {
              setWorkspace(workspaceResult);
            });
            setAzureStorageActionStatus(
              workspaceResult.azureStorageStatusMessage || `Created container ${containerName}.`,
            );
          })
          .catch((error: unknown) => {
            setAzureStorageActionStatus(error instanceof Error ? error.message : String(error));
          });
      }}
      onUploadBlob={(sourcePath, blobName) => {
        setAzureStorageActionStatus(`Uploading ${blobName}...`);
        void backendRequest<{ workspace: WorkspaceSnapshot }>("azure.storage.uploadBlob", {
          sourcePath,
          blobName,
        })
          .then((response) => {
            startTransition(() => {
              setWorkspace(normaliseWorkspaceSnapshot(response.workspace));
            });
            setAzureStorageActionStatus(`Uploaded blob ${blobName}.`);
          })
          .catch((error: unknown) => {
            setAzureStorageActionStatus(error instanceof Error ? error.message : String(error));
          });
      }}
      onDeleteBlob={(blobName) => {
        setAzureStorageActionStatus(`Deleting blob ${blobName}...`);
        void requestWorkspaceSnapshot("azure.storage.deleteBlob", { blobName })
          .then((workspaceResult) => {
            startTransition(() => {
              setWorkspace(workspaceResult);
            });
            setAzureStorageActionStatus(`Deleted blob ${blobName}.`);
          })
          .catch((error: unknown) => {
            setAzureStorageActionStatus(error instanceof Error ? error.message : String(error));
          });
      }}
      onCopyBlob={(sourceBlobName, destinationBlobName) => {
        setAzureStorageActionStatus(`Copying blob to ${destinationBlobName}...`);
        void requestWorkspaceSnapshot("azure.storage.copyBlob", { sourceBlobName, destinationBlobName })
          .then((workspaceResult) => {
            startTransition(() => {
              setWorkspace(workspaceResult);
            });
            setAzureStorageActionStatus(`Copied blob to ${destinationBlobName}.`);
          })
          .catch((error: unknown) => {
            setAzureStorageActionStatus(error instanceof Error ? error.message : String(error));
          });
      }}
      onCreateFolderPrefix={(folderPrefix) => {
        setAzureStorageActionStatus(`Creating folder prefix ${folderPrefix}...`);
        void requestWorkspaceSnapshot("azure.storage.createFolderPrefix", { folderPrefix })
          .then((workspaceResult) => {
            startTransition(() => {
              setWorkspace(workspaceResult);
            });
            setAzureStorageActionStatus(`Created folder prefix ${folderPrefix}.`);
          })
          .catch((error: unknown) => {
            setAzureStorageActionStatus(error instanceof Error ? error.message : String(error));
          });
      }}
    />
  ) : session.isLocked && activeWorkspaceTabId === "azure-app-service" ? (
    <AzureAppServiceView
      workspace={activeWorkspace}
      inventoryLoading={azureServiceInventoryLoading}
      actionStatus={azureAppServiceActionStatus}
      onSelectResourceGroup={(resourceGroup) => {
        void selectAzureResourceGroup(resourceGroup);
      }}
      onSelectWebApp={(appName) => {
        void selectAzureWebApp(appName);
      }}
      onSelectSlot={(slot) => {
        void selectAzureWebAppSlot(slot);
      }}
      onEditInLogAnalytics={(workspaceName, query, timespan) => {
        setLogAnalyticsPrefill({ query, timespan });
        void selectAzureLogAnalyticsWorkspace(workspaceName).finally(() => {
          setActiveWorkspaceTabId("azure-log-analytics");
        });
      }}
      onCreateWebApp={(resourceGroup, appName, location, runtime, planOptions) => {
        setAzureAppServiceActionStatus(`Creating web app ${appName}...`);
        void requestWorkspaceSnapshot("azure.webApps.create", {
          resourceGroup,
          appName,
          location,
          runtime,
          existingPlanName: planOptions.existingPlanName,
          newPlanName: planOptions.newPlanName,
          planSku: planOptions.planSku,
        })
          .then((workspaceResult) => {
            startTransition(() => {
              setWorkspace(workspaceResult);
            });
            setAzureAppServiceActionStatus(
              workspaceResult.azureAppServiceStatusMessage || `Created web app ${appName}.`,
            );
          })
          .catch((error: unknown) => {
            setAzureAppServiceActionStatus(error instanceof Error ? error.message : String(error));
          });
      }}
      onInvokeAction={(action, appName) => {
        setAzureAppServiceActionStatus(`Invoking ${action} on web app...`);
        void requestWorkspaceSnapshot("azure.webApps.invokeAction", { action, appName })
          .then((workspaceResult) => {
            startTransition(() => {
              setWorkspace(workspaceResult);
            });
            setAzureAppServiceActionStatus(
              workspaceResult.azureAppServiceStatusMessage || `Invoked ${action} on web app.`,
            );
          })
          .catch((error: unknown) => {
            setAzureAppServiceActionStatus(error instanceof Error ? error.message : String(error));
          });
      }}
      onSetSetting={(appName, name, value, slotSetting) => {
        setAzureAppServiceActionStatus(`Setting ${name}...`);
        return requestWorkspaceSnapshot("azure.webApps.setSetting", {
          appName,
          name,
          value,
          slotSetting,
        }).then((workspaceResult) => {
          startTransition(() => {
            setWorkspace(workspaceResult);
          });
          setAzureAppServiceActionStatus(
            workspaceResult.azureAppServiceStatusMessage || `Set application setting ${name}.`,
          );
        });
      }}
      onDeleteSetting={(appName, name) => {
        setAzureAppServiceActionStatus(`Deleting ${name}...`);
        return requestWorkspaceSnapshot("azure.webApps.deleteSetting", {
          appName,
          name,
        }).then((workspaceResult) => {
          startTransition(() => {
            setWorkspace(workspaceResult);
          });
          setAzureAppServiceActionStatus(
            workspaceResult.azureAppServiceStatusMessage || `Deleted application setting ${name}.`,
          );
        });
      }}
      onCreateSlot={(appName, slotName) => {
        setAzureAppServiceActionStatus(`Creating deployment slot ${slotName}...`);
        void requestWorkspaceSnapshot("azure.webApps.createSlot", { appName, slotName })
          .then((workspaceResult) => {
            startTransition(() => {
              setWorkspace(workspaceResult);
            });
            setAzureAppServiceActionStatus(
              workspaceResult.azureAppServiceStatusMessage ||
                `Created deployment slot ${slotName}.`,
            );
          })
          .catch((error: unknown) => {
            setAzureAppServiceActionStatus(error instanceof Error ? error.message : String(error));
          });
      }}
      onSwapSlot={(appName, slotName) => {
        setAzureAppServiceActionStatus(`Swapping production with ${slotName}...`);
        void requestWorkspaceSnapshot("azure.webApps.swapSlots", { appName, slotName })
          .then((workspaceResult) => {
            startTransition(() => {
              setWorkspace(workspaceResult);
            });
            setAzureAppServiceActionStatus(
              workspaceResult.azureAppServiceStatusMessage ||
                `Swapped production with deployment slot ${slotName}.`,
            );
          })
          .catch((error: unknown) => {
            setAzureAppServiceActionStatus(error instanceof Error ? error.message : String(error));
          });
      }}
    />
  ) : session.isLocked && activeWorkspaceTabId === "azure-tools" ? (
    <ToolsHubView
      workspace={activeWorkspace}
      providerLabel={workspace.provider?.label ?? selectedProvider?.label ?? "Azure"}
      profileLabel={activeWorkspace.profile?.displayName ?? selectedProfile?.displayName}
      workspaceTabs={session.workspaceTabs}
      onNavigate={(tabId) => {
        setActiveWorkspaceTabId(tabId);
      }}
    />
  ) : session.isLocked && activeWorkspaceTabId === "azure-log-analytics" ? (
    <LogAnalyticsView
      workspace={activeWorkspace}
      workspaceSelectionLoading={azureLogWorkspaceSelectionLoading}
      inventoryLoading={azureServiceInventoryLoading}
      initialQuery={logAnalyticsPrefill?.query}
      initialTimespan={logAnalyticsPrefill?.timespan}
      onSelectWorkspace={(ws) => {
        void selectAzureLogAnalyticsWorkspace(ws);
      }}
      onRunQuery={(ws, query, timespan, maxRows, historyQuery) =>
        backendRequest<AzureLogQueryResult>("azure.logAnalytics.query", {
          workspace: ws,
          query,
          historyQuery,
          timespan,
          maxRows,
        })
      }
      onListHistory={listLogAnalyticsHistory}
      onListSaved={listLogAnalyticsSaved}
      onSaveQuery={(ws, name, query, timespan, id) =>
        backendRequest<AzureLogAnalyticsSavedQuery>("azure.logAnalytics.saved.save", {
          workspace: ws,
          name,
          query,
          timespan,
          id,
        })
      }
      onDeleteSaved={(ws, id) =>
        backendRequest<{ deleted: boolean }>("azure.logAnalytics.saved.delete", { workspace: ws, id }).then(
          () => undefined,
        )
      }
      onListTables={(ws, includeColumns) =>
        backendRequest<AzureLogAnalyticsTableInfo[]>("azure.logAnalytics.tables.list", {
          workspace: ws,
          includeColumns,
        })
      }
      onGetTableSchema={(ws, tableName) =>
        backendRequest<AzureLogAnalyticsTableInfo>("azure.logAnalytics.table.schema", {
          workspace: ws,
          tableName,
        })
      }
    />
  ) : session.isLocked && activeWorkspaceTabId === "azure-waf" ? (
    <AzureWafView
      workspace={activeWorkspace}
      workspaceSelectionLoading={azureLogWorkspaceSelectionLoading}
      inventoryLoading={azureServiceInventoryLoading}
      configLoading={azureWafConfigLoading}
      onSelectWorkspace={(ws) => {
        void selectAzureLogAnalyticsWorkspace(ws);
      }}
      onSelectPolicy={(policyName) => {
        void selectAzureWafPolicy(policyName);
      }}
      onProbeLogSchema={(ws, timespan) =>
        backendRequest<AzureWafLogSchemaProfile>("azure.waf.logs.schema", {
          workspace: ws,
          timespan,
        })
      }
      onCorrelateTrackingRef={(trackingReference, ws, timespan) => {
        setFrontDoorAccessPrefill({ trackingReference, workspace: ws, timespan });
        setActiveWorkspaceTabId("azure-front-door");
      }}
      onRunQuery={(ws, query, timespan, maxRows) =>
        backendRequest<AzureLogQueryResult>("azure.logAnalytics.query", {
          workspace: ws,
          query,
          timespan,
          maxRows,
        })
      }
      onEditInLogAnalytics={(ws, query, timespan) => {
        setLogAnalyticsPrefill({ query, timespan });
        void selectAzureLogAnalyticsWorkspace(ws).finally(() => {
          setActiveWorkspaceTabId("azure-log-analytics");
        });
      }}
      onSetMode={(resourceGroup, policyName, mode) =>
        requestWorkspaceSnapshot("azure.waf.config.setMode", {
          resourceGroup,
          policyName,
          mode,
          confirm: true,
        }).then((workspaceResult) => {
          startTransition(() => {
            setWorkspace(workspaceResult);
          });
        })
      }
      onSetManagedRule={(
        resourceGroup,
        policyName,
        ruleSetType,
        ruleSetVersion,
        ruleGroupName,
        ruleId,
        enabled,
      ) =>
        requestWorkspaceSnapshot("azure.waf.config.setManagedRule", {
          resourceGroup,
          policyName,
          ruleSetType,
          ruleSetVersion,
          ruleGroupName,
          ruleId,
          enabled,
          confirm: true,
        }).then((workspaceResult) => {
          startTransition(() => {
            setWorkspace(workspaceResult);
          });
        })
      }
      onRemoveExclusion={(resourceGroup, policyName, exclusion) =>
        requestWorkspaceSnapshot("azure.waf.config.removeExclusion", {
          resourceGroup,
          policyName,
          exclusion,
          confirm: true,
        }).then((workspaceResult) => {
          startTransition(() => {
            setWorkspace(workspaceResult);
          });
        })
      }
      onAddExclusion={(resourceGroup, policyName, exclusion) =>
        requestWorkspaceSnapshot("azure.waf.config.addExclusion", {
          resourceGroup,
          policyName,
          exclusion,
          confirm: true,
        }).then((workspaceResult) => {
          startTransition(() => {
            setWorkspace(workspaceResult);
          });
        })
      }
      onListSaved={listLogAnalyticsSaved}
      onSaveQuery={(ws, name, queryText, timespan, id) =>
        backendRequest<AzureLogAnalyticsSavedQuery>("azure.logAnalytics.saved.save", {
          workspace: ws,
          name,
          query: queryText,
          timespan,
          id,
        })
      }
      onDeleteSaved={(ws, id) =>
        backendRequest<{ deleted: boolean }>("azure.logAnalytics.saved.delete", {
          workspace: ws,
          id,
        }).then(() => undefined)
      }
    />
  ) : session.isLocked && activeWorkspaceTabId === "azure-front-door" ? (
    <AzureFrontDoorView
      workspace={activeWorkspace}
      initialTrackingReference={frontDoorAccessPrefill?.trackingReference}
      initialLogWorkspace={frontDoorAccessPrefill?.workspace}
      initialTimespan={frontDoorAccessPrefill?.timespan}
      inventoryLoading={azureServiceInventoryLoading || azureFrontDoorTopologyLoading}
      actionStatus={azureFrontDoorActionStatus}
      onRefresh={() => {
        setAzureFrontDoorActionStatus("Refreshing Front Door topology...");
        void refreshAzureFrontDoorTopology(workspace, session.selectedProfileId ?? "", { force: true });
      }}
      onPurgeCache={(profile, endpointName, contentPaths, domains) => {
        setAzureFrontDoorActionStatus(`Purging cache for ${endpointName}...`);
        void requestWorkspaceSnapshot("azure.frontDoor.purgeCache", {
          profileName: profile,
          endpointName,
          contentPaths,
          domains,
        })
          .then((workspaceResult) => {
            startTransition(() => {
              setWorkspace((current) => mergeAzureFrontDoorSelection(current, workspaceResult));
            });
            setAzureFrontDoorActionStatus(
              workspaceResult.azureFrontDoorStatusMessage || `Purged cache for ${endpointName}.`,
            );
          })
          .catch((error: unknown) => {
            setAzureFrontDoorActionStatus(formatBackendError(error));
          });
      }}
      onSelectProfile={(profile) => {
        void mutateWorkspaceSelection("azure.frontDoor.selectProfile", { profile }, {
          panelLoading: true,
          merge: mergeAzureFrontDoorSelection,
          onOptimistic: () => {
            setSession((current) =>
              normaliseSessionSnapshot({
                ...current,
                selectedAzureFrontDoorProfile: profile,
                selectedAzureFrontDoorEndpoint: undefined,
                selectedAzureFrontDoorOriginGroup: undefined,
              }),
            );
            setWorkspace((current) =>
              normaliseWorkspaceSnapshot({
                ...current,
                selectedAzureFrontDoorProfile: profile,
                selectedAzureFrontDoorEndpoint: undefined,
                selectedAzureFrontDoorOriginGroup: undefined,
                azureFrontDoorEndpoints: [],
                azureFrontDoorOriginGroups: [],
                azureFrontDoorOrigins: [],
              }),
            );
          },
          errorTitle: "Could not select Front Door profile",
        });
      }}
      onSelectEndpoint={(endpoint) => {
        void mutateWorkspaceSelection("azure.frontDoor.selectEndpoint", { endpoint }, {
          panelLoading: true,
          merge: mergeAzureFrontDoorSelection,
          onOptimistic: () => {
            setSession((current) =>
              normaliseSessionSnapshot({
                ...current,
                selectedAzureFrontDoorEndpoint: endpoint,
              }),
            );
            setWorkspace((current) =>
              normaliseWorkspaceSnapshot({
                ...current,
                selectedAzureFrontDoorEndpoint: endpoint,
              }),
            );
          },
          errorTitle: "Could not select Front Door endpoint",
        });
      }}
      onSelectOriginGroup={(originGroup) => {
        void mutateWorkspaceSelection("azure.frontDoor.selectOriginGroup", { originGroup }, {
          panelLoading: true,
          merge: mergeAzureFrontDoorSelection,
          onOptimistic: () => {
            setSession((current) =>
              normaliseSessionSnapshot({
                ...current,
                selectedAzureFrontDoorOriginGroup: originGroup,
              }),
            );
            setWorkspace((current) =>
              normaliseWorkspaceSnapshot({
                ...current,
                selectedAzureFrontDoorOriginGroup: originGroup,
                azureFrontDoorOrigins: [],
              }),
            );
          },
          errorTitle: "Could not select Front Door origin group",
        });
      }}
      onOpenWafPolicy={(policyName) => {
        void selectAzureWafPolicy(policyName).finally(() => {
          setActiveWorkspaceTabId("azure-waf");
        });
      }}
      onEditInLogAnalytics={(ws, query, timespan) => {
        setLogAnalyticsPrefill({ query, timespan });
        void selectAzureLogAnalyticsWorkspace(ws).finally(() => {
          setActiveWorkspaceTabId("azure-log-analytics");
        });
      }}
      onRunQuery={(ws, query, timespan) =>
        backendRequest<AzureLogQueryResult>("azure.logAnalytics.query", {
          workspace: ws,
          query,
          timespan,
        })
      }
    />
  ) : session.isLocked && activeWorkspaceTabId === "azure-functions" ? (
    <AzureFunctionsView
      workspace={activeWorkspace}
      inventoryLoading={azureServiceInventoryLoading}
      onSelectApp={(appName) => {
        void mutateWorkspaceSelection("azure.functions.selectApp", { appName }, {
          panelLoading: true,
          merge: mergeAzureFunctionsSelection,
          onOptimistic: () => {
            setSession((current) =>
              normaliseSessionSnapshot({
                ...current,
                selectedAzureFunctionApp: appName,
                selectedAzureFunction: undefined,
              }),
            );
            setWorkspace((current) =>
              normaliseWorkspaceSnapshot({
                ...current,
                selectedAzureFunctionApp: appName,
                selectedAzureFunction: undefined,
                azureFunctions: [],
              }),
            );
          },
          errorTitle: "Could not select Function App",
        });
      }}
      onSelectFunction={(functionName) => {
        void mutateWorkspaceSelection("azure.functions.selectFunction", { functionName }, {
          persistOnly: true,
          onOptimistic: () => {
            setSession((current) =>
              normaliseSessionSnapshot({
                ...current,
                selectedAzureFunction: functionName,
              }),
            );
            setWorkspace((current) =>
              normaliseWorkspaceSnapshot({
                ...current,
                selectedAzureFunction: functionName,
              }),
            );
          },
          errorTitle: "Could not select function",
        });
      }}
      onInvoke={(appName, functionName, payload) =>
        backendRequest<AzureFunctionInvokeResult>("azure.functions.invoke", {
          appName,
          functionName,
          payload,
        })
      }
    />
  ) : session.isLocked && activeWorkspaceTabId === "azure-key-vault" ? (
    <AzureKeyVaultView
      workspace={activeWorkspace}
      inventoryLoading={azureServiceInventoryLoading}
      onSelectVault={(vaultName) => {
        void mutateWorkspaceSelection("azure.keyVault.selectVault", { vaultName }, {
          panelLoading: true,
          merge: mergeAzureKeyVaultSelection,
          onOptimistic: () => {
            setSession((current) =>
              normaliseSessionSnapshot({
                ...current,
                selectedAzureKeyVault: vaultName,
                selectedAzureSecret: undefined,
              }),
            );
            setWorkspace((current) =>
              normaliseWorkspaceSnapshot({
                ...current,
                selectedAzureKeyVault: vaultName,
                selectedAzureSecret: undefined,
                azureKeyVaultSecrets: [],
              }),
            );
          },
          errorTitle: "Could not select Key Vault",
        });
      }}
      onReveal={(vaultName, secretName) =>
        backendRequest<{ value: string }>("azure.keyVault.revealSecret", { vaultName, secretName }).then(
          (result) => result.value,
        )
      }
      onSetSecret={(vaultName, secretName, value) =>
        requestWorkspaceSnapshot("azure.keyVault.setSecret", { vaultName, secretName, value }).then(
          (workspaceResult) => {
            startTransition(() => {
              setWorkspace(workspaceResult);
            });
          },
        )
      }
    />
  ) : session.isLocked && activeWorkspaceTabId === "azure-cosmos" ? (
    <AzureCosmosView
      workspace={activeWorkspace}
      inventoryLoading={azureServiceInventoryLoading}
      onSelectAccount={(account) => {
        void mutateWorkspaceSelection("azure.cosmos.selectAccount", { account }, {
          panelLoading: true,
          merge: mergeAzureCosmosSelection,
          onOptimistic: () => {
            setSession((current) =>
              normaliseSessionSnapshot({
                ...current,
                selectedAzureCosmosAccount: account,
                selectedAzureCosmosDatabase: undefined,
                selectedAzureCosmosContainer: undefined,
              }),
            );
            setWorkspace((current) =>
              normaliseWorkspaceSnapshot({
                ...current,
                selectedAzureCosmosAccount: account,
                selectedAzureCosmosDatabase: undefined,
                selectedAzureCosmosContainer: undefined,
                azureCosmosDatabases: [],
                azureCosmosContainers: [],
                azureCosmosItems: [],
              }),
            );
          },
          errorTitle: "Could not select Cosmos account",
        });
      }}
      onSelectDatabase={(database) => {
        void mutateWorkspaceSelection("azure.cosmos.selectDatabase", { database }, {
          panelLoading: true,
          merge: mergeAzureCosmosSelection,
          onOptimistic: () => {
            setSession((current) =>
              normaliseSessionSnapshot({
                ...current,
                selectedAzureCosmosDatabase: database,
                selectedAzureCosmosContainer: undefined,
              }),
            );
            setWorkspace((current) =>
              normaliseWorkspaceSnapshot({
                ...current,
                selectedAzureCosmosDatabase: database,
                selectedAzureCosmosContainer: undefined,
                azureCosmosContainers: [],
                azureCosmosItems: [],
              }),
            );
          },
          errorTitle: "Could not select Cosmos database",
        });
      }}
      onSelectContainer={(container) => {
        void mutateWorkspaceSelection("azure.cosmos.selectContainer", { container }, {
          panelLoading: true,
          merge: mergeAzureCosmosSelection,
          onOptimistic: () => {
            setSession((current) =>
              normaliseSessionSnapshot({
                ...current,
                selectedAzureCosmosContainer: container,
              }),
            );
            setWorkspace((current) =>
              normaliseWorkspaceSnapshot({
                ...current,
                selectedAzureCosmosContainer: container,
                azureCosmosItems: [],
              }),
            );
          },
          errorTitle: "Could not select Cosmos container",
        });
      }}
    />
  ) : session.isLocked && activeWorkspaceTabId === "azure-postgres" ? (
    <AzurePostgresView
      workspace={activeWorkspace}
      inventoryLoading={azureServiceInventoryLoading}
      onSelectServer={(server) => {
        void mutateWorkspaceSelection("azure.postgres.selectServer", { server }, {
          panelLoading: true,
          merge: mergeAzurePostgresSelection,
          onOptimistic: () => {
            setSession((current) =>
              normaliseSessionSnapshot({
                ...current,
                selectedAzurePostgresServer: server,
              }),
            );
            setWorkspace((current) =>
              normaliseWorkspaceSnapshot({
                ...current,
                selectedAzurePostgresServer: server,
                azurePostgresConnection: undefined,
              }),
            );
          },
          errorTitle: "Could not select PostgreSQL server",
        });
      }}
    />
  ) : session.isLocked && activeWorkspaceTabId === "azure-queues" ? (
    <AzureQueuesView
      workspace={activeWorkspace}
      inventoryLoading={azureServiceInventoryLoading}
      onSelectAccount={(account) => {
        void mutateWorkspaceSelection("azure.storage.selectAccount", { accountName: account }, {
          panelLoading: true,
          merge: mergeAzureQueuesSelection,
          onOptimistic: () => {
            setSession((current) =>
              normaliseSessionSnapshot({
                ...current,
                selectedAzureStorageAccount: account,
                selectedAzureQueue: undefined,
              }),
            );
            setWorkspace((current) =>
              normaliseWorkspaceSnapshot({
                ...current,
                selectedAzureStorageAccount: account,
                selectedAzureQueue: undefined,
                azureStorageQueues: [],
                azureQueueMessages: [],
              }),
            );
          },
          errorTitle: "Could not select storage account",
        });
      }}
      onSelectQueue={(queue) => {
        void mutateWorkspaceSelection("azure.queues.selectQueue", { queue }, {
          panelLoading: true,
          merge: mergeAzureQueuesSelection,
          onOptimistic: () => {
            setSession((current) =>
              normaliseSessionSnapshot({
                ...current,
                selectedAzureQueue: queue,
              }),
            );
            setWorkspace((current) =>
              normaliseWorkspaceSnapshot({
                ...current,
                selectedAzureQueue: queue,
              }),
            );
          },
          errorTitle: "Could not select queue",
        });
      }}
    />
  ) : session.isLocked && activeWorkspaceTabId === "azure-entra" ? (
    <AzureEntraView
      workspace={activeWorkspace}
      inventoryLoading={azureServiceInventoryLoading}
    />
  ) : null;
}
