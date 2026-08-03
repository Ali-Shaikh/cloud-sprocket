// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useRef, useState, type ReactNode } from "react";
import { backendRequest } from "@/lib/backend";
import {
  mergeAwsS3LoadMore,
  mergeAwsS3ObjectSelection,
  mergeAwsS3Selection,
  normaliseWorkspaceSnapshot,
} from "@/lib/workspace-snapshot";
import type { UrlInspection } from "@/types/backend";
import {
  ComputeView,
  DynamoDBView,
  IAMView,
  LambdaView,
  LogsView,
  ApiGatewayView,
  SecretsManagerView,
  ECSView,
  EKSView,
  CloudFormationView,
  EventBridgeView,
  Route53View,
  ELBView,
  KMSView,
  RDSView,
  SNSView,
  SQSView,
  StorageView,
} from "@/views/workspace/lazy-views";
import { useAwsActionsContext } from "./aws-actions-context";
import { useWorkspaceNavigationContext } from "./workspace-navigation-context";
import { useWorkspaceSessionContext } from "./workspace-session-context";
import type { AwsWorkspaceTabsProps } from "./workspace-tab-router-props";

export const AWS_TAB_IDS = new Set([
  "s3",
  "ec2",
  "lambda",
  "dynamodb",
  "sqs",
  "sns",
  "rds",
  "ecs",
  "eks",
  "cloudformation",
  "eventbridge",
  "route53",
  "elb",
  "kms",
  "apigateway",
  "secrets",
  "logs",
  "iam",
]);

export function AwsWorkspaceTabs(props: AwsWorkspaceTabsProps): ReactNode {
  const [s3LoadMoreInFlight, setS3LoadMoreInFlight] = useState(false);
  const [s3ListingLoading, setS3ListingLoading] = useState(false);
  const [s3ListingLabel, setS3ListingLabel] = useState("Loading objects…");
  const s3ListingGenerationRef = useRef(0);
  const {
    activeWorkspaceTabId,
    lambdaCreateFormOpen,
    setLambdaCreateFormOpen,
  } = useWorkspaceNavigationContext();
  const {
    session,
    activeWorkspace,
    setWorkspace,
  } = useWorkspaceSessionContext();
  const {
    loading,
    openingProfileId,
    logs,
    showSensitiveValues,
    setShowSensitiveValues,
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
    dynamodbActionStatus,
    sqsActionStatus,
    sqsPeekResult,
    sqsPeekInFlight,
    snsActionStatus,
    rdsActionStatus,
    ecsActionStatus,
    eksActionStatus,
    cloudFormationActionStatus,
    eventBridgeActionStatus,
    route53ActionStatus,
    elbActionStatus,
    kmsActionStatus,
    apiGatewayActionStatus,
    secretsManagerActionStatus,
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
    mutateWorkspaceSelection,
    mutateSession,
    refreshDiscovery,
    refreshDockerRuntime,
    refreshLocalStackLogs,
    refreshFlociAzLogs,
    listLogAnalyticsHistory,
    listLogAnalyticsSaved,
    invokeLocalStackAction,
    invokeFlociAzAction,
    openWorkspace,
    chooseAuthMethod,
  } = props;

  const {
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
    deleteS3Object,
    createS3Bucket,
    copyS3Object,
    createS3FolderPrefix,
    runEC2Instances,
    terminateEC2Instance,
    deleteLambdaFunction,
    invokeRDSLifecycleAction,
    createLogGroup,
    putLogEvents,
    filterLogEvents,
    createIAMRole,
    refreshECSInventory,
    selectECSRegion,
    selectECSCluster,
    selectECSService,
    selectECSTask,
    refreshEKSInventory,
    selectEKSRegion,
    selectEKSCluster,
    refreshCloudFormationInventory,
    selectCloudFormationRegion,
    selectCloudFormationStack,
    refreshEventBridgeInventory,
    selectEventBridgeRegion,
    selectEventBridgeBus,
    refreshRoute53Inventory,
    selectRoute53HostedZone,
    refreshElbInventory,
    selectElbRegion,
    selectElbLoadBalancer,
    refreshKmsInventory,
    selectKmsRegion,
    selectKmsKey,
    refreshApiGatewayInventory,
    selectApiGatewayRegion,
    selectApiGatewayApi,
    refreshSecretsManagerInventory,
    selectSecretsManagerRegion,
    selectSecretsManagerSecret,
    refreshLogsInventory,
    selectLogsRegion,
    selectLogGroup,
    refreshIAMInventory,
    selectIAMRole,
    applyS3PrefixFilter,
  } = useAwsActionsContext();

  if (!session.isLocked || !AWS_TAB_IDS.has(activeWorkspaceTabId)) {
    return null;
  }

  return session.isLocked && activeWorkspaceTabId === "s3" ? (
    <StorageView
      workspace={activeWorkspace}
      showSensitiveValues={showSensitiveValues}
      listingLoading={s3ListingLoading}
      listingLoadingLabel={s3ListingLabel}
      onSelectBucket={(bucketName) => {
        if (s3ListingLoading) {
          return;
        }
        const generation = s3ListingGenerationRef.current + 1;
        s3ListingGenerationRef.current = generation;
        setS3ListingLabel(`Loading ${bucketName}…`);
        setS3ListingLoading(true);
        void mutateWorkspaceSelection("aws.s3.selectBucket", { bucketName }, {
          // Sync updates so loading does not clear before objects paint.
          immediate: true,
          merge: mergeAwsS3Selection,
          onOptimistic: () => {
            setWorkspace((current) =>
              normaliseWorkspaceSnapshot({
                ...current,
                selectedS3BucketName: bucketName,
                selectedS3ObjectKey: undefined,
                // Do not keep the previous bucket's folder path on the new bucket.
                s3PrefixFilter: "",
                s3Objects: [],
                s3ObjectsNextToken: undefined,
                s3ObjectsHasMore: false,
                s3StatusMessage: `Loading ${bucketName}…`,
              }),
            );
          },
          errorTitle: "Could not select S3 bucket",
        }).finally(() => {
          if (generation === s3ListingGenerationRef.current) {
            setS3ListingLoading(false);
          }
        });
      }}
      onSelectObject={(objectKey) => {
        void mutateWorkspaceSelection("aws.s3.selectObject", { objectKey }, {
          // Do not replace the browser list with a fresh page-1 response.
          merge: mergeAwsS3ObjectSelection,
          onOptimistic: () => {
            setWorkspace((current) =>
              normaliseWorkspaceSnapshot({
                ...current,
                selectedS3ObjectKey: objectKey,
              }),
            );
          },
          errorTitle: "Could not select S3 object",
        });
      }}
      onSetPrefixFilter={(prefix) => {
        if (s3ListingLoading) {
          return;
        }
        const generation = s3ListingGenerationRef.current + 1;
        s3ListingGenerationRef.current = generation;
        const folderLabel = prefix ? prefix.replace(/\/$/, "") : "bucket root";
        setS3ListingLabel(`Opening ${folderLabel}…`);
        setS3ListingLoading(true);
        setWorkspace((current) =>
          normaliseWorkspaceSnapshot({
            ...current,
            s3PrefixFilter: prefix,
            selectedS3ObjectKey: undefined,
            s3Objects: [],
            s3ObjectsNextToken: undefined,
            s3ObjectsHasMore: false,
            s3StatusMessage: `Opening ${folderLabel}…`,
          }),
        );
        void applyS3PrefixFilter(prefix).finally(() => {
          if (generation === s3ListingGenerationRef.current) {
            setS3ListingLoading(false);
          }
        });
      }}
      loadMoreInFlight={s3LoadMoreInFlight}
      onLoadMoreObjects={() => {
        const token = activeWorkspace.s3ObjectsNextToken;
        if (!token || s3LoadMoreInFlight || s3ListingLoading) {
          return;
        }
        setS3LoadMoreInFlight(true);
        void mutateWorkspaceSelection(
          "aws.s3.loadMoreObjects",
          { continuationToken: token },
          {
            merge: mergeAwsS3LoadMore,
            errorTitle: "Could not load more S3 objects",
          },
        ).finally(() => {
          setS3LoadMoreInFlight(false);
        });
      }}
      uploadStatus={s3UploadStatus}
      signedUrlStatus={s3SignedUrlStatus}
      signedUrlResult={s3SignedUrlResult}
      urlInspection={s3UrlInspection}
      urlValidation={s3UrlValidation}
      onUploadObject={(sourcePath, objectKey) => {
        setS3UploadStatus(`Queueing upload for ${objectKey}.`);
        void backendRequest("aws.s3.uploadObject", { objectKey, sourcePath });
      }}
      onPresignObject={(durationSeconds) => {
        setS3SignedUrlStatus("Queueing signed URL generation.");
        void backendRequest("aws.s3.presignObject", { durationSeconds });
      }}
      onAnalyseUrl={(url) => {
        void (async () => {
          setS3UrlInspection(await backendRequest<UrlInspection>("aws.s3.analyseUrl", { url }));
        })();
      }}
      onValidateUrl={(url) => {
        void (async () => {
          await backendRequest("aws.s3.validateUrl", { url });
        })();
      }}
      onDeleteObject={deleteS3Object}
      onCreateBucket={createS3Bucket}
      onCopyObject={copyS3Object}
      onCreateFolderPrefix={createS3FolderPrefix}
    />
  ) : session.isLocked && activeWorkspaceTabId === "ec2" ? (
    <ComputeView
      workspace={activeWorkspace}
      actionStatus={ec2ActionStatus}
      actionInFlight={ec2ActionInFlight}
      actionHistory={ec2ActionHistory}
      onRefreshInstances={refreshEC2Inventory}
      onSelectRegion={selectEC2Region}
      onSelectInstance={selectEC2Instance}
      onInvokeAction={invokeEC2LifecycleAction}
      onRunInstances={runEC2Instances}
      onTerminateInstance={terminateEC2Instance}
    />
  ) : session.isLocked && activeWorkspaceTabId === "lambda" ? (
    <LambdaView
      workspace={activeWorkspace}
      actionStatus={lambdaActionStatus}
      invokeResult={lambdaInvokeResult}
      invokeInFlight={lambdaInvokeInFlight}
      createInFlight={lambdaCreateInFlight}
      onRefresh={refreshLambdaInventory}
      onSelectRegion={selectLambdaRegion}
      onSelectFunction={selectLambdaFunction}
      onInvoke={invokeLambda}
      onCreate={createLambda}
      onDeleteFunction={deleteLambdaFunction}
      openCreateForm={lambdaCreateFormOpen}
      onCreateFormOpenChange={setLambdaCreateFormOpen}
      navigateToResource={props.navigateToResource}
    />
  ) : session.isLocked && activeWorkspaceTabId === "dynamodb" ? (
    <DynamoDBView
      workspace={activeWorkspace}
      actionStatus={dynamodbActionStatus}
      onRefresh={refreshDynamoDBInventory}
      onSelectRegion={selectDynamoDBRegion}
      onSelectTable={selectDynamoDBTable}
      onPutItem={putDynamoDBItem}
      onDeleteItem={deleteDynamoDBItem}
    />
  ) : session.isLocked && activeWorkspaceTabId === "sqs" ? (
    <SQSView
      workspace={activeWorkspace}
      actionStatus={sqsActionStatus}
      peekResult={sqsPeekResult}
      peekInFlight={sqsPeekInFlight}
      onRefresh={refreshSQSInventory}
      onSelectRegion={selectSQSRegion}
      onSelectQueue={selectSQSQueue}
      onPeek={peekSQSQueue}
      onSendMessage={sendSQSMessage}
      onCreateQueue={createSQSQueue}
    />
  ) : session.isLocked && activeWorkspaceTabId === "sns" ? (
    <SNSView
      workspace={activeWorkspace}
      actionStatus={snsActionStatus}
      onRefresh={refreshSNSInventory}
      onSelectRegion={selectSNSRegion}
      onSelectEntity={selectSNSTopic}
      onPublish={publishSNSTopic}
      onCreateTopic={createSNSTopic}
    />
  ) : session.isLocked && activeWorkspaceTabId === "rds" ? (
    <RDSView
      workspace={activeWorkspace}
      actionStatus={rdsActionStatus}
      onRefresh={refreshRDSInventory}
      onSelectRegion={selectRDSRegion}
      onSelectEntity={selectRDSInstance}
      onInvokeLifecycleAction={invokeRDSLifecycleAction}
    />
  ) : session.isLocked && activeWorkspaceTabId === "ecs" ? (
    <ECSView
      workspace={activeWorkspace}
      actionStatus={ecsActionStatus}
      onRefresh={refreshECSInventory}
      onSelectRegion={selectECSRegion}
      onSelectCluster={selectECSCluster}
      onSelectService={selectECSService}
      onSelectTask={selectECSTask}
    />
  ) : session.isLocked && activeWorkspaceTabId === "eks" ? (
    <EKSView
      workspace={activeWorkspace}
      actionStatus={eksActionStatus}
      onRefresh={refreshEKSInventory}
      onSelectRegion={selectEKSRegion}
      onSelectCluster={selectEKSCluster}
    />
  ) : session.isLocked && activeWorkspaceTabId === "cloudformation" ? (
    <CloudFormationView
      workspace={activeWorkspace}
      actionStatus={cloudFormationActionStatus}
      onRefresh={refreshCloudFormationInventory}
      onSelectRegion={selectCloudFormationRegion}
      onSelectStack={selectCloudFormationStack}
    />
  ) : session.isLocked && activeWorkspaceTabId === "eventbridge" ? (
    <EventBridgeView
      workspace={activeWorkspace}
      actionStatus={eventBridgeActionStatus}
      onRefresh={refreshEventBridgeInventory}
      onSelectRegion={selectEventBridgeRegion}
      onSelectBus={selectEventBridgeBus}
    />
  ) : session.isLocked && activeWorkspaceTabId === "route53" ? (
    <Route53View
      workspace={activeWorkspace}
      actionStatus={route53ActionStatus}
      onRefresh={refreshRoute53Inventory}
      onSelectHostedZone={selectRoute53HostedZone}
    />
  ) : session.isLocked && activeWorkspaceTabId === "elb" ? (
    <ELBView
      workspace={activeWorkspace}
      actionStatus={elbActionStatus}
      onRefresh={refreshElbInventory}
      onSelectRegion={selectElbRegion}
      onSelectLoadBalancer={selectElbLoadBalancer}
    />
  ) : session.isLocked && activeWorkspaceTabId === "kms" ? (
    <KMSView
      workspace={activeWorkspace}
      actionStatus={kmsActionStatus}
      onRefresh={refreshKmsInventory}
      onSelectRegion={selectKmsRegion}
      onSelectKey={selectKmsKey}
    />
  ) : session.isLocked && activeWorkspaceTabId === "apigateway" ? (
    <ApiGatewayView
      workspace={activeWorkspace}
      actionStatus={apiGatewayActionStatus}
      onRefresh={refreshApiGatewayInventory}
      onSelectRegion={selectApiGatewayRegion}
      onSelectApi={selectApiGatewayApi}
    />
  ) : session.isLocked && activeWorkspaceTabId === "secrets" ? (
    <SecretsManagerView
      workspace={activeWorkspace}
      actionStatus={secretsManagerActionStatus}
      onRefresh={refreshSecretsManagerInventory}
      onSelectRegion={selectSecretsManagerRegion}
      onSelectSecret={selectSecretsManagerSecret}
      onReveal={(region, secretName) =>
        backendRequest<{ value: string }>("aws.secrets.reveal", { region, secretName }).then(
          (result) => result.value,
        )
      }
    />
  ) : session.isLocked && activeWorkspaceTabId === "logs" ? (
    <LogsView
      workspace={activeWorkspace}
      actionStatus={logsActionStatus}
      onRefresh={refreshLogsInventory}
      onSelectRegion={selectLogsRegion}
      onSelectEntity={selectLogGroup}
      onCreateLogGroup={createLogGroup}
      onPutLogEvents={putLogEvents}
      onFilterEvents={filterLogEvents}
    />
  ) : session.isLocked && activeWorkspaceTabId === "iam" ? (
    <IAMView
      workspace={activeWorkspace}
      actionStatus={iamActionStatus}
      onRefresh={refreshIAMInventory}
      onSelectRegion={selectSQSRegion}
      onSelectEntity={selectIAMRole}
      onCreateRole={createIAMRole}
    />
  ) : null;
}
