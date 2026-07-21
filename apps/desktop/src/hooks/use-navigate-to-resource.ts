// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useCallback } from "react";

import type { NavigationLocation } from "@/lib/navigation-location";
import {
  type NavigateToResourceParams,
  planNavigateToResource,
} from "@/lib/navigate-to-resource";
import { mergeAwsS3Selection, normaliseWorkspaceSnapshot } from "@/lib/workspace-snapshot";
import type { WorkspaceTabRouterProps } from "@/components/workspace/workspace-tab-router-props";

type NavigateToResourceDeps = Pick<
  WorkspaceTabRouterProps,
  | "setActiveWorkspaceTabId"
  | "setActiveS3PageId"
  | "setActiveAzurePageId"
  | "setActiveAzureStoragePageId"
  | "setLambdaCreateFormOpen"
  | "mutateWorkspaceSelection"
  | "setWorkspace"
  | "selectLambdaFunction"
  | "selectDynamoDBTable"
  | "selectSQSQueue"
  | "selectSNSTopic"
  | "selectRDSInstance"
  | "selectLogGroup"
  | "selectLogsRegion"
  | "selectIAMRole"
  | "selectEC2Instance"
  | "selectAzureResourceGroup"
  | "selectAzureVirtualMachine"
> & {
  /** Optional history/recents recorder (shell navigation controller). */
  recordLocation?: (location: NavigationLocation) => void;
};

const HANDLER_RPC_MAP: Record<string, (deps: NavigateToResourceDeps, value: string) => void> = {
  "aws.lambda.selectFunction": (deps, value) => deps.selectLambdaFunction(value),
  "aws.dynamodb.selectTable": (deps, value) => deps.selectDynamoDBTable(value),
  "aws.sqs.selectQueue": (deps, value) => deps.selectSQSQueue(value),
  "aws.sns.selectTopic": (deps, value) => deps.selectSNSTopic(value),
  "aws.rds.selectInstance": (deps, value) => deps.selectRDSInstance(value),
  "aws.logs.selectRegion": (deps, value) => deps.selectLogsRegion(value),
  "aws.logs.selectLogGroup": (deps, value) => deps.selectLogGroup(value),
  "aws.iam.selectRole": (deps, value) => deps.selectIAMRole(value),
  "aws.ec2.selectInstance": (deps, value) => deps.selectEC2Instance(value),
  "azure.resourceGroups.select": (deps, value) => {
    void deps.selectAzureResourceGroup(value);
  },
  "azure.virtualMachines.select": (deps, value) => {
    void deps.selectAzureVirtualMachine(value);
  },
};

export type NavigateToResourceOptions = {
  /** When false, skip history/recents (used by back/forward). Default true. */
  record?: boolean;
};

export function useNavigateToResource(deps: NavigateToResourceDeps) {
  const navigateToResource = useCallback(
    (params: NavigateToResourceParams, options: NavigateToResourceOptions = {}) => {
      const plan = planNavigateToResource(params);

      deps.setActiveWorkspaceTabId(plan.tabId);
      if (options.record !== false) {
        deps.recordLocation?.({
          tabId: plan.tabId,
          label: params.resourceKey?.trim() || plan.tabId,
          focus: params,
        });
      }

      if (plan.subPage) {
        // S3 and Azure Storage are single browsers; only Azure overview still has sub-pages.
        if (plan.subPage.tab === "azure-overview") {
          deps.setActiveAzurePageId(plan.subPage.pageId);
        }
      }

      for (const selection of plan.selections) {
        const paramValue = Object.values(selection.params)[0];
        if (typeof paramValue !== "string" || !paramValue) {
          continue;
        }

        const handler = HANDLER_RPC_MAP[selection.method];
        if (handler) {
          handler(deps, paramValue);
          continue;
        }

        if (selection.method === "aws.s3.selectBucket") {
          void deps.mutateWorkspaceSelection(
            selection.method,
            selection.params,
            {
              merge: mergeAwsS3Selection,
              onOptimistic: () => {
                deps.setWorkspace((current) =>
                  normaliseWorkspaceSnapshot({
                    ...current,
                    selectedS3BucketName: paramValue,
                    selectedS3ObjectKey: undefined,
                  }),
                );
              },
            },
          );
          continue;
        }

        void deps.mutateWorkspaceSelection(selection.method, selection.params);
      }

      if (plan.uiFlags?.openLambdaCreate) {
        deps.setLambdaCreateFormOpen(true);
      }
    },
    [deps],
  );

  return navigateToResource;
}