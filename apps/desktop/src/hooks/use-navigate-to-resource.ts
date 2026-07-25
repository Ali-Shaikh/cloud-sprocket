// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useCallback } from "react";

import {
  type NavigateToResourceParams,
  planNavigateToResource,
} from "@/lib/navigate-to-resource";
import { mergeAwsS3Selection, normaliseWorkspaceSnapshot } from "@/lib/workspace-snapshot";
import type { AwsActions } from "@/components/workspace/aws-actions-context";
import type { AzureActions } from "@/components/workspace/azure-actions-context";
import type { WorkspaceNavigationContextValue } from "@/components/workspace/workspace-navigation-context";
import type { WorkspaceSessionContextValue } from "@/components/workspace/workspace-session-context";
import type { WorkspaceTabRouterProps } from "@/components/workspace/workspace-tab-router-props";

type NavigateToResourceDeps = Pick<
  WorkspaceNavigationContextValue,
  | "setActiveWorkspaceTabId"
  | "setActiveAzurePageId"
  | "setLambdaCreateFormOpen"
  | "recordLocation"
> &
  Pick<WorkspaceSessionContextValue, "setWorkspace"> &
  Pick<WorkspaceTabRouterProps, "mutateWorkspaceSelection"> &
  Pick<
    AwsActions,
    | "selectLambdaFunction"
    | "selectDynamoDBTable"
    | "selectSQSQueue"
    | "selectSNSTopic"
    | "selectRDSInstance"
    | "selectLogGroup"
    | "selectLogsRegion"
    | "selectIAMRole"
    | "selectEC2Instance"
  > &
  Pick<
    AzureActions,
    | "selectAzureResourceGroup"
    | "selectAzureVirtualMachine"
  >;

type SelectionHandler = (
  deps: NavigateToResourceDeps,
  value: string,
) => void | Promise<void>;

const HANDLER_RPC_MAP: Record<string, SelectionHandler> = {
  "aws.lambda.selectFunction": (deps, value) => deps.selectLambdaFunction(value),
  "aws.dynamodb.selectTable": (deps, value) => deps.selectDynamoDBTable(value),
  "aws.sqs.selectQueue": (deps, value) => deps.selectSQSQueue(value),
  "aws.sns.selectTopic": (deps, value) => deps.selectSNSTopic(value),
  "aws.rds.selectInstance": (deps, value) => deps.selectRDSInstance(value),
  // Region must finish before log-group selection (see serialize Logs selections).
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

      // Run selections in order so region RPCs complete before resource selection
      // (e.g. Logs region then log group). Fire-and-forget would race. Stop the
      // chain if a selection fails so later steps do not run against stale state.
      void (async () => {
        try {
          for (const selection of plan.selections) {
            const paramValue = Object.values(selection.params)[0];
            if (typeof paramValue !== "string" || !paramValue) {
              continue;
            }

            const handler = HANDLER_RPC_MAP[selection.method];
            if (handler) {
              await Promise.resolve(handler(deps, paramValue));
              continue;
            }

            if (selection.method === "aws.s3.selectBucket") {
              await Promise.resolve(
                deps.mutateWorkspaceSelection(selection.method, selection.params, {
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
                }),
              );
              continue;
            }

            await Promise.resolve(
              deps.mutateWorkspaceSelection(selection.method, selection.params),
            );
          }

          if (plan.uiFlags?.openLambdaCreate) {
            deps.setLambdaCreateFormOpen(true);
          }
        } catch {
          // Handlers surface status to the user; do not continue the chain.
        }
      })();
    },
    [deps],
  );

  return navigateToResource;
}
