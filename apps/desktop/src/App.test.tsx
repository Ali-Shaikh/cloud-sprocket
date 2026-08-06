// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { AppProviders } from "./components/app-providers";
import { backendRequest } from "./lib/backend";
import { __resetNotifications } from "./lib/notify";
import { ONBOARDING_COMPLETED_KEY } from "./views/onboarding/onboarding-state";
import type {
  ActivityLogEntry,
  AppSettingsSnapshot,
  ProfileSummary,
  ProviderSummary,
  SessionSnapshot,
  WorkspaceSnapshot,
} from "./types/backend";

const providerFixtures: ProviderSummary[] = [
  {
    providerId: "aws",
    label: "AWS",
    state: "configured",
    summary: "AWS config detected.",
    profileCount: 1,
    commandPath: "aws",
    locations: ["~/.aws/config"],
  },
  {
    providerId: "azure",
    label: "Azure",
    state: "configured",
    summary: "Azure profile cache detected.",
    profileCount: 1,
    commandPath: "az",
    locations: ["~/.azure/azureProfile.json"],
  },
];

const profileFixtures: ProfileSummary[] = [
  {
    providerId: "aws",
    profileId: "sandbox",
    displayName: "sandbox",
    summary: "AWS sandbox profile.",
    sourcePaths: ["~/.aws/config"],
    attributes: [
      { label: "Region", value: "us-east-1" },
      { label: "AWS Secret Access Key", value: "super-secret-value", sensitive: true },
    ],
    authMethods: [
      { method: "cli", label: "CLI", summary: "AWS CLI detected.", available: true },
      { method: "sso", label: "SSO", summary: "SSO metadata detected.", available: true },
      { method: "local-files", label: "Local Files", summary: "Read-only data.", available: true },
    ],
  },
  {
    providerId: "azure",
    profileId: "sub-001",
    displayName: "Marketing Subscription",
    summary: "tenant-marketing, ali@example.com",
    sourcePaths: ["~/.azure/azureProfile.json"],
    attributes: [
      { label: "Subscription ID", value: "sub-001" },
      { label: "Tenant ID", value: "tenant-marketing" },
      { label: "User Name", value: "ali@example.com" },
    ],
    authMethods: [
      { method: "cli", label: "CLI", summary: "Azure CLI detected.", available: true },
      { method: "sso", label: "SSO", summary: "Provider-specific SSO not yet exposed.", available: false },
      { method: "local-files", label: "Local Files", summary: "Read-only data.", available: true },
    ],
  },
  // Appended last so profileFixtures[0]/[1] keep their AWS/Azure meaning for the
  // index-based assertions elsewhere. This profile exposes a single usable auth
  // path (CLI only) to exercise the one-click open flow.
  {
    providerId: "aws",
    profileId: "prod",
    displayName: "prod",
    summary: "AWS production profile with a single usable auth path.",
    sourcePaths: ["~/.aws/config"],
    attributes: [{ label: "Region", value: "eu-west-1" }],
    authMethods: [
      { method: "cli", label: "CLI", summary: "AWS CLI detected.", available: true },
      { method: "sso", label: "SSO", summary: "No SSO metadata detected.", available: false },
      { method: "local-files", label: "Local Files", summary: "Local files unavailable.", available: false },
    ],
  },
];

let sessionFixture: SessionSnapshot;
let logFixtures: ActivityLogEntry[];
let workspaceFixture: WorkspaceSnapshot;
let s3PrefixDelays: Map<string, number>;
let backendEventHandlers: Record<string, (payload: unknown) => void>;
let emulatorStartParams: Record<string, unknown> | undefined;
const settingsFixture: AppSettingsSnapshot = {
  platformName: "windows",
  configDir: "C:/Users/Ali/AppData/Local/CloudSprocket",
  databasePath: "C:/Users/Ali/AppData/Local/CloudSprocket/cloudsprocket.db",
  logPath: "C:/Users/Ali/AppData/Local/CloudSprocket/logs/cloudsprocket.log",
  runtimeMode: "cloud",
  localConfigDir: "C:/Users/Ali/AppData/Local/CloudSprocket/local-config",
  emulatorStateDir: "C:/Users/Ali/AppData/Local/CloudSprocket/emulators",
  localStackImage: "localstack/localstack:stable",
  flociAzImage: "floci/floci-az:latest",
};

vi.mock("./lib/backend", () => ({
  addDebugLog: vi.fn(),
  clearDebugLogs: vi.fn(),
  getDebugLogs: vi.fn(() => []),
  subscribeToDebugLogs: vi.fn(() => () => undefined),
  listDeployments: vi.fn(async () => []),
  backendRequest: vi.fn(async (method: string, params?: Record<string, unknown>) => {
    switch (method) {
      case "providers.list":
        return providerFixtures;
      case "profiles.list":
        return profileFixtures;
      case "session.get":
        return sessionFixture;
      case "session.selectProvider": {
        // Mirrors daemon F-011: select refuses while a workspace is locked.
        if (sessionFixture.isLocked) {
          throw new Error(
            "close the active workspace with session.unlock before changing provider or profile",
          );
        }
        const providerId = String(params?.providerId ?? "");
        sessionFixture = {
          ...sessionFixture,
          currentProviderId: providerId,
          selectedProfileId: undefined,
          selectedAuthMethod: undefined,
          availableAuthMethods: [],
          workspaceTabs: [],
        };
        return sessionFixture;
      }
      case "session.selectProfile": {
        if (sessionFixture.isLocked) {
          throw new Error(
            "close the active workspace with session.unlock before changing provider or profile",
          );
        }
        const providerId = String(params?.providerId ?? "");
        const profileId = String(params?.profileId ?? "");
        const profile = profileFixtures.find(
          (candidate) => candidate.providerId === providerId && candidate.profileId === profileId,
        );
        sessionFixture = {
          ...sessionFixture,
          currentProviderId: providerId,
          selectedProfileId: profileId,
          selectedAuthMethod: undefined,
          availableAuthMethods: profile?.authMethods ?? [],
          workspaceTabs: [],
        };
        return sessionFixture;
      }
      case "session.selectAuthMethod":
        sessionFixture = {
          ...sessionFixture,
          selectedAuthMethod: params?.authMethod as SessionSnapshot["selectedAuthMethod"],
        };
        return sessionFixture;
      case "session.lock":
        sessionFixture = {
          ...sessionFixture,
          isLocked: true,
          lockedProviderId: sessionFixture.currentProviderId,
          lockedProfileId: sessionFixture.selectedProfileId,
          lockedAuthMethod: sessionFixture.selectedAuthMethod,
          workspaceTabs:
            sessionFixture.workspaceTabs && sessionFixture.workspaceTabs.length > 0
              ? sessionFixture.workspaceTabs
              : [{ tabId: "overview", label: "Overview", summary: "Summary", detail: "Overview panel" }],
        };
        return sessionFixture;
      case "session.unlock":
        sessionFixture = {
          ...sessionFixture,
          isLocked: false,
          lockedProviderId: undefined,
          lockedProfileId: undefined,
          lockedAuthMethod: undefined,
          workspaceTabs: [],
        };
        return sessionFixture;
      case "app.settings.get":
        return settingsFixture;
      case "app.reset":
        if (params?.confirmation !== "RESET") {
          throw new Error("type RESET to confirm the app reset");
        }
        sessionFixture = {
          currentProviderId: "aws",
          selectedProfileId: "sandbox",
          selectedAuthMethod: "cli",
          isLocked: false,
          availableAuthMethods: profileFixtures[0].authMethods,
          workspaceTabs: [],
        };
        logFixtures = [];
        backendEventHandlers["state.changed"]?.({
          providers: providerFixtures,
          profiles: profileFixtures.filter((profile) => profile.providerId === "aws"),
          session: sessionFixture,
        });
        return {
          summary: "CloudSprocket app state has been reset. External AWS, Azure, and GCP config files were not touched.",
          resetPaths: [
            settingsFixture.localConfigDir,
            settingsFixture.emulatorStateDir,
          ],
          skippedPaths: [],
        };
      case "workspace.get":
        return workspaceFixture;
      case "aws.inventory.get":
        if (params?.scope !== "lambda") {
          throw new Error(`unexpected AWS inventory test scope ${String(params?.scope)}`);
        }
        return {
          providerId: "aws",
          scope: "lambda",
          payload: {
            selectedLambdaRegion: "us-east-1",
            selectedLambdaFunctionName: "process-order",
            lambdaRegions: ["us-east-1", "eu-west-2"],
            lambdaFunctions: [
              {
                functionName: "process-order",
                runtime: "nodejs20.x",
                memorySize: 512,
                lastModified: "2026-06-10T12:00:00Z",
                description: "Handles order processing from SQS",
                state: "Active",
                handler: "index.handler",
                timeout: 30,
                logGroup: "/aws/lambda/process-order",
                recentLogs: ["2026-06-15 10:05:12 START RequestId: abc123"],
              },
            ],
            lambdaStatusMessage: "Loaded 1 Lambda function from us-east-1.",
          },
        };
      case "azure.inventory.get":
        return {
          ...workspaceFixture,
          azureStorageAccounts: [
            {
              name: "refreshed-store",
              kind: "StorageV2",
              location: "uaenorth",
              blobEndpoint: "https://refreshed.blob.core.windows.net/",
            },
          ],
          azureStorageStatusMessage: "Loaded 1 storage account after refresh.",
        };
      case "runtime.get":
        return {
          dockerRuntime: workspaceFixture.dockerRuntime,
          dockerResources: workspaceFixture.dockerResources,
          emulatorSummaries: workspaceFixture.emulatorSummaries,
          dockerDiagnostics: workspaceFixture.dockerDiagnostics,
        };
      case "docker.runtime.get":
        return workspaceFixture.dockerRuntime;
      case "docker.resources.list":
        return workspaceFixture.dockerResources;
      case "emulators.prepareProfile":
        if (params?.emulatorId === "floci-az") {
          workspaceFixture = {
            ...workspaceFixture,
            localConfigArtifacts: workspaceFixture.localConfigArtifacts.map((artifact) =>
              artifact.providerId === "azure"
                ? { ...artifact, status: "available", summary: "App-managed floci-az env file is prepared." }
                : artifact,
            ),
          };
          return {
            emulatorId: "floci-az",
            action: "prepareProfile",
            state: "succeeded",
            summary: "floci-az managed env file is prepared.",
            status: workspaceFixture.emulatorSummaries.find((emulator) => emulator.emulatorId === "floci-az"),
          };
        }
        workspaceFixture = {
          ...workspaceFixture,
          localConfigArtifacts: workspaceFixture.localConfigArtifacts.map((artifact) =>
            artifact.providerId === "aws"
              ? { ...artifact, status: "available", summary: "App-managed LocalStack profile is prepared." }
              : artifact,
          ),
        };
        return {
          emulatorId: "localstack",
          action: "prepareProfile",
          state: "succeeded",
          summary: "LocalStack managed profile is prepared.",
          status: workspaceFixture.emulatorSummaries[0],
        };
      case "emulators.start":
        emulatorStartParams = params;
        if (params?.emulatorId === "floci-az") {
          workspaceFixture = {
            ...workspaceFixture,
            emulatorSummaries: workspaceFixture.emulatorSummaries.map((emulator) =>
              emulator.emulatorId === "floci-az"
                ? { ...emulator, status: "running", summary: "floci-az is running at http://localhost:4577." }
                : emulator,
            ),
          };
          return {
            emulatorId: "floci-az",
            action: "start",
            state: "succeeded",
            summary: "floci-az is running at http://localhost:4577.",
            status: workspaceFixture.emulatorSummaries.find((emulator) => emulator.emulatorId === "floci-az"),
          };
        }
        workspaceFixture = {
          ...workspaceFixture,
          emulatorSummaries: workspaceFixture.emulatorSummaries.map((emulator) =>
            emulator.emulatorId === "localstack"
              ? { ...emulator, status: "running", summary: "LocalStack is running at http://localhost:4566." }
              : emulator,
          ),
        };
        return {
          emulatorId: "localstack",
          action: "start",
          state: "succeeded",
          summary: "LocalStack is running at http://localhost:4566.",
          status: workspaceFixture.emulatorSummaries[0],
        };
      case "emulators.stop":
        if (params?.emulatorId === "floci-az") {
          workspaceFixture = {
            ...workspaceFixture,
            emulatorSummaries: workspaceFixture.emulatorSummaries.map((emulator) =>
              emulator.emulatorId === "floci-az"
                ? { ...emulator, status: "stopped", summary: "floci-az container is present but not running." }
                : emulator,
            ),
          };
          return {
            emulatorId: "floci-az",
            action: "stop",
            state: "succeeded",
            summary: "floci-az container is present but not running.",
            status: workspaceFixture.emulatorSummaries.find((emulator) => emulator.emulatorId === "floci-az"),
          };
        }
        workspaceFixture = {
          ...workspaceFixture,
          emulatorSummaries: workspaceFixture.emulatorSummaries.map((emulator) =>
            emulator.emulatorId === "localstack"
              ? { ...emulator, status: "stopped", summary: "LocalStack container is present but not running." }
              : emulator,
          ),
        };
        return {
          emulatorId: "localstack",
          action: "stop",
          state: "succeeded",
          summary: "LocalStack container is present but not running.",
          status: workspaceFixture.emulatorSummaries[0],
        };
      case "emulators.logs":
        if (params?.emulatorId === "floci-az") {
          const flociAz = workspaceFixture.emulatorSummaries.find((emulator) => emulator.emulatorId === "floci-az");
          return {
            emulatorId: "floci-az",
            lines: flociAz?.status === "running" ? ["floci-az ready.", "Serving Azure APIs on 4577."] : [],
            summary: flociAz?.status === "running"
              ? "Showing the latest 2 floci-az log lines."
              : "No managed floci-az container is running.",
          };
        }
        return {
          emulatorId: "localstack",
          lines: workspaceFixture.emulatorSummaries[0]?.status === "running" ? ["Ready.", "Serving edge on 4566."] : [],
          summary: workspaceFixture.emulatorSummaries[0]?.status === "running"
            ? "Showing the latest 2 LocalStack log lines."
            : "No managed LocalStack container is running.",
        };
      case "logs.list":
        return logFixtures;
      case "actions.invoke":
        return {
          jobId: "job-1",
          label: "Refresh Discovery",
          status: "queued",
          message: "Refreshing discovery.",
        };
      case "aws.s3.selectBucket":
        workspaceFixture = {
          ...workspaceFixture,
          selectedS3BucketName: String(params?.bucketName ?? ""),
          selectedS3ObjectKey: undefined,
        };
        return workspaceFixture;
      case "aws.s3.setPrefixFilter": {
        const prefix = String(params?.prefix ?? "");
        const delayMs = s3PrefixDelays.get(prefix) ?? 0;
        if (delayMs > 0) {
          await new Promise((resolve) => {
            window.setTimeout(resolve, delayMs);
          });
        }
        workspaceFixture = {
          ...workspaceFixture,
          s3PrefixFilter: prefix,
          s3StatusMessage: `Loaded 1 objects from ${workspaceFixture.selectedS3BucketName}.`,
          s3Objects: [{ key: `${prefix}filtered-object.json`, size: "128 B" }],
          selectedS3ObjectKey: `${prefix}filtered-object.json`,
          s3ObjectMetadata: [
            { label: "Bucket", value: workspaceFixture.selectedS3BucketName ?? "" },
            { label: "Key", value: `${prefix}filtered-object.json` },
            { label: "Metadata: owner", value: "analytics" },
          ],
          s3ExportSnippets: [
            {
              label: "S3 URI",
              value: `s3://${workspaceFixture.selectedS3BucketName}/${prefix}filtered-object.json`,
            },
          ],
        };
        return workspaceFixture;
      }
      case "aws.s3.selectObject": {
        const objectKey = String(params?.objectKey ?? "");
        workspaceFixture = {
          ...workspaceFixture,
          selectedS3ObjectKey: objectKey,
          s3ObjectMetadata: [
            { label: "Bucket", value: workspaceFixture.selectedS3BucketName ?? "" },
            { label: "Key", value: objectKey },
            { label: "Metadata: owner", value: "analytics" },
          ],
          s3ExportSnippets: [
            {
              label: "S3 URI",
              value: `s3://${workspaceFixture.selectedS3BucketName}/${objectKey}`,
            },
          ],
        };
        return workspaceFixture;
      }
      case "aws.s3.analyseUrl":
        return {
          summary: "Nominal expiry is visible in the signed URL.",
          detailFields: [{ label: "Signature Type", value: "AWS SigV4 presigned URL" }],
        };
      case "aws.s3.uploadObject":
        return {
          jobId: "job-upload",
          label: "S3 Upload",
          status: "queued",
          message: "Uploading object.",
        };
      case "aws.s3.presignObject":
        return {
          jobId: "job-presign",
          label: "S3 Signed URL",
          status: "queued",
          message: "Generating a signed URL.",
        };
      case "aws.s3.validateUrl":
        return {
          jobId: "job-validate",
          label: "S3 URL Validation",
          status: "queued",
          message: "Validating the pasted URL.",
        };
      case "aws.ec2.selectRegion":
        workspaceFixture = {
          ...workspaceFixture,
          selectedEc2Region: String(params?.region ?? ""),
          selectedEc2InstanceId: "i-0123456789abcdef0",
          ec2StatusMessage: `Loaded ${workspaceFixture.ec2Instances.length} EC2 instances from ${String(params?.region ?? "")}.`,
        };
        return workspaceFixture;
      case "aws.ec2.selectInstance":
        workspaceFixture = {
          ...workspaceFixture,
          selectedEc2InstanceId: String(params?.instanceId ?? ""),
        };
        return workspaceFixture;
      case "aws.ec2.invokeAction":
        return {
          jobId: "job-ec2",
          label: "EC2 Action",
          status: "queued",
          message: `Queueing EC2 ${params?.action} for ${params?.instanceId}.`,
        };
      case "aws.lambda.selectRegion":
        workspaceFixture = {
          ...workspaceFixture,
          selectedLambdaRegion: String(params?.region ?? ""),
          selectedLambdaFunctionName: workspaceFixture.lambdaFunctions[0]?.functionName,
          lambdaStatusMessage: `Loaded ${workspaceFixture.lambdaFunctions.length} Lambda functions from ${String(params?.region ?? "")}.`,
        };
        return workspaceFixture;
      case "aws.lambda.selectFunction":
        workspaceFixture = {
          ...workspaceFixture,
          selectedLambdaFunctionName: String(params?.functionName ?? ""),
          lambdaStatusMessage: `Selected Lambda function ${String(params?.functionName ?? "")}.`,
        };
        return workspaceFixture;
      case "aws.dynamodb.selectRegion":
        workspaceFixture = {
          ...workspaceFixture,
          selectedDynamodbRegion: String(params?.region ?? ""),
          selectedDynamodbTableName: workspaceFixture.dynamodbTables[0]?.tableName,
          dynamodbStatusMessage: `Loaded ${workspaceFixture.dynamodbTables.length} DynamoDB tables from ${String(params?.region ?? "")}.`,
        };
        return workspaceFixture;
      case "aws.dynamodb.selectTable":
        workspaceFixture = {
          ...workspaceFixture,
          selectedDynamodbTableName: String(params?.tableName ?? ""),
          dynamodbStatusMessage: `Selected DynamoDB table ${String(params?.tableName ?? "")}.`,
        };
        return workspaceFixture;
      case "aws.sqs.selectRegion":
        workspaceFixture = {
          ...workspaceFixture,
          selectedSqsRegion: String(params?.region ?? ""),
          selectedSqsQueueUrl: workspaceFixture.sqsQueues[0]?.queueUrl,
          sqsStatusMessage: `Loaded ${workspaceFixture.sqsQueues.length} SQS queues from ${String(params?.region ?? "")}.`,
        };
        return workspaceFixture;
      case "aws.sqs.selectQueue":
        workspaceFixture = {
          ...workspaceFixture,
          selectedSqsQueueUrl: String(params?.queueUrl ?? ""),
          sqsStatusMessage: "Selected SQS queue.",
        };
        return workspaceFixture;
      case "aws.sqs.peek":
        return {
          queueUrl: String(params?.queueUrl ?? workspaceFixture.selectedSqsQueueUrl ?? ""),
          summary: "Peeked 1 messages without deleting them.",
          messages: [
            {
              messageId: "mock-msg-001",
              body: '{"orderId":"ord-001"}',
            },
          ],
        };
      case "aws.sns.selectRegion":
        workspaceFixture = {
          ...workspaceFixture,
          selectedSnsRegion: String(params?.region ?? ""),
          selectedSnsTopicArn: workspaceFixture.snsTopics[0]?.topicArn,
          snsStatusMessage: `Loaded ${workspaceFixture.snsTopics.length} SNS topics from ${String(params?.region ?? "")}.`,
        };
        return workspaceFixture;
      case "aws.sns.selectTopic":
        workspaceFixture = {
          ...workspaceFixture,
          selectedSnsTopicArn: String(params?.topicArn ?? ""),
          snsStatusMessage: `Selected SNS topic ${String(params?.topicArn ?? "")}.`,
        };
        return workspaceFixture;
      case "aws.rds.selectRegion":
        workspaceFixture = {
          ...workspaceFixture,
          selectedRdsRegion: String(params?.region ?? ""),
          selectedRdsInstanceId: workspaceFixture.rdsInstances[0]?.dbInstanceIdentifier,
          rdsStatusMessage: `Loaded ${workspaceFixture.rdsInstances.length} RDS instances from ${String(params?.region ?? "")}.`,
        };
        return workspaceFixture;
      case "aws.rds.selectInstance":
        workspaceFixture = {
          ...workspaceFixture,
          selectedRdsInstanceId: String(params?.instanceId ?? ""),
          rdsStatusMessage: `Selected RDS instance ${String(params?.instanceId ?? "")}.`,
        };
        return workspaceFixture;
      case "aws.logs.selectRegion":
        workspaceFixture = {
          ...workspaceFixture,
          selectedLogsRegion: String(params?.region ?? ""),
          selectedLogGroupName: workspaceFixture.logGroups[0]?.logGroupName,
          logsStatusMessage: `Loaded ${workspaceFixture.logGroups.length} log groups from ${String(params?.region ?? "")}.`,
        };
        return workspaceFixture;
      case "aws.logs.selectLogGroup":
        workspaceFixture = {
          ...workspaceFixture,
          selectedLogGroupName: String(params?.logGroupName ?? ""),
          logsStatusMessage: `Selected log group ${String(params?.logGroupName ?? "")}.`,
        };
        return workspaceFixture;
      case "aws.iam.selectRole":
        workspaceFixture = {
          ...workspaceFixture,
          selectedIamRoleName: String(params?.roleName ?? ""),
          iamStatusMessage: `Selected IAM role ${String(params?.roleName ?? "")}.`,
        };
        return workspaceFixture;
      case "aws.lambda.invoke":
        return {
          statusCode: 200,
          executedVersion: "$LATEST",
          logResult: "START RequestId: mock-123\nEND RequestId: mock-123",
          payload: JSON.stringify({ echoed: params?.payload ?? {} }),
        };
      case "session.setWriteMode":
        sessionFixture = {
          ...sessionFixture,
          awsWriteModeEnabled:
            sessionFixture.lockedProviderId === "aws" ? Boolean(params?.enabled) : sessionFixture.awsWriteModeEnabled,
          azureWriteModeEnabled:
            sessionFixture.lockedProviderId === "azure"
              ? Boolean(params?.enabled)
              : sessionFixture.azureWriteModeEnabled,
        };
        return sessionFixture;
      case "azure.waf.selectPolicy": {
        const policyName = String(params?.policyName ?? "");
        workspaceFixture = {
          ...workspaceFixture,
          selectedAzureWafPolicy: policyName,
          azureWafPolicyDetail: {
            name: policyName,
            resourceGroup: "rg-marketing-prod",
            mode: "Prevention",
            enabled: true,
            managedRuleSets: [],
            managedRuleOverrides: [],
            exclusions: [],
            customRules: [],
          },
        };
        return workspaceFixture;
      }
      default:
        return sessionFixture;
    }
  }),
  subscribeToBackendEvent: vi.fn(
    async (eventName: string, handler: (payload: unknown) => void) => {
      backendEventHandlers[eventName] = handler;
      return () => {
        delete backendEventHandlers[eventName];
      };
    },
  ),
}));

describe("App", () => {
  beforeEach(() => {
    __resetNotifications();
    window.localStorage.setItem(ONBOARDING_COMPLETED_KEY, "true");
    sessionFixture = {
      currentProviderId: "aws",
      selectedProfileId: "sandbox",
      selectedAuthMethod: "cli",
      isLocked: false,
      availableAuthMethods: profileFixtures[0].authMethods,
      workspaceTabs: [],
    };
    logFixtures = [
      {
        id: 1,
        level: "info",
        message: "Initial discovery loaded.",
        timestamp: "2026-04-14T09:00:00Z",
        details: "Provider discovery completed in test mode.",
      },
    ];
    workspaceFixture = {
      provider: providerFixtures[0],
      profile: {
        ...profileFixtures[0],
        displayName: "workspace sandbox",
      },
      authMethod: "cli",
      runtimeSettings: {
        ...settingsFixture,
        databasePath: "D:/Workspace/runtime/cloudsprocket-workspace.db",
      },
      dockerDiagnostics: {
        engineState: "available",
        summary: "Docker engine endpoint detected. Active container control is not wired into this slice yet.",
        contextName: "desktop-linux",
        host: "npipe:////./pipe/docker_engine",
        details: [
          { label: "Detection", value: "DOCKER_HOST" },
          { label: "Host", value: "npipe:////./pipe/docker_engine" },
          { label: "Context", value: "desktop-linux" },
        ],
      },
      dockerRuntime: {
        reachable: true,
        host: "npipe:////./pipe/docker_engine",
        hostSource: "DOCKER_HOST",
        contextName: "desktop-linux",
        serverVersion: "28.5.1",
        apiVersion: "1.51",
        operatingSystem: "Docker Desktop",
        architecture: "x86_64",
        engineName: "docker",
        resourceOwnership: {
          labelKey: "com.cloudsprocket.managed",
          labelValue: "true",
          projectLabelKey: "com.cloudsprocket.project",
          projectName: "cloud-sprocket",
          summary: "Only CloudSprocket-managed Docker resources are eligible for future lifecycle control.",
        },
        summary: "Docker engine is reachable and ready for managed runtime operations.",
        details: [
          { label: "Host Source", value: "DOCKER_HOST" },
          { label: "Host", value: "npipe:////./pipe/docker_engine" },
          { label: "Context", value: "desktop-linux" },
          { label: "Server Version", value: "28.5.1" },
        ],
      },
      dockerResources: [
        {
          resourceId: "ctr-001",
          kind: "container",
          name: "cloudsprocket-localstack",
          state: "running",
          summary: "CloudSprocket-managed emulator container.",
          owned: true,
          details: [
            { label: "Image", value: "localstack/localstack:stable" },
            { label: "Status", value: "Up 10 seconds" },
          ],
        },
      ],
      emulatorSummaries: [
        {
          emulatorId: "localstack",
          providerId: "aws",
          label: "LocalStack",
          kind: "docker",
          status: "not-configured",
          summary: "Managed AWS local runtime is planned but not configured yet.",
          details: [
            { label: "Image", value: "localstack/localstack:stable" },
            { label: "Managed Config Root", value: "C:/Users/Ali/AppData/Local/CloudSprocket/local-config/aws" },
          ],
        },
        {
          emulatorId: "floci-az",
          providerId: "azure",
          label: "floci-az",
          kind: "docker",
          status: "not-configured",
          summary: "Managed Azure local runtime is planned but not configured yet.",
          details: [
            { label: "Image", value: "floci/floci-az:latest" },
            { label: "Managed Config Root", value: "C:/Users/Ali/AppData/Local/CloudSprocket/local-config/azure" },
          ],
        },
      ],
      localConfigArtifacts: [
        {
          artifactId: "aws-local-config",
          providerId: "aws",
          label: "AWS Local Config",
          path: "C:/Users/Ali/AppData/Local/CloudSprocket/local-config/aws/config",
          status: "not-created",
          managed: true,
          summary: "App-managed AWS local profile configuration will be written here.",
        },
      ],
      awsEndpointUrl: "http://192.168.50.168:4566",
      awsWriteCapable: true,
      awsWriteTargetIsLocal: true,
      awsWriteModeEnabled: false,
      awsWritesEnabled: false,
      azureWriteCapable: false,
      azureWriteModeEnabled: false,
      azureWritesEnabled: false,
      azureResourceGroups: [],
      azureVirtualMachines: [],
      azureStorageAccounts: [],
      azureBlobContainers: [],
      azureBlobs: [],
      azureBlobMetadata: [],
      azureWebApps: [],
      azureAppServicePlans: [],
      azureWebAppSettings: [],
      azureWebAppDeploymentSlots: [],
      azureLogAnalyticsWorkspaces: [],
      azureWafPolicies: [],
      azureWafRuleFireCounts: [],
      azureFunctionApps: [],
      azureFunctions: [],
      azureKeyVaults: [],
      azureKeyVaultSecrets: [],
      azureCosmosAccounts: [],
      azurePostgresServers: [],
      azureCosmosDatabases: [],
      azureCosmosContainers: [],
      azureCosmosItems: [],
      azureFrontDoorProfiles: [],
      azureFrontDoorEndpoints: [],
      azureFrontDoorOriginGroups: [],
      azureFrontDoorOrigins: [],
      azureStorageQueues: [],
      azureQueueMessages: [],
      azureEntraUsers: [],
      azureEntraGroups: [],
      azureEntraApps: [],
      selectedS3BucketName: "cloudsprocket-artifacts",
      selectedS3ObjectKey: "reports/weekly-summary.json",
      s3PrefixFilter: "",
      s3StatusMessage: "Loaded 1 objects from cloudsprocket-artifacts.",
      s3Buckets: [
        { name: "cloudsprocket-artifacts" },
        { name: "cloudsprocket-reports" },
      ],
      s3Objects: [{ key: "reports/weekly-summary.json" }],
      s3ObjectMetadata: [
        { label: "Bucket", value: "cloudsprocket-artifacts" },
        { label: "Key", value: "reports/weekly-summary.json" },
      ],
      s3ExportSnippets: [
        {
          label: "S3 URI",
          value: "s3://cloudsprocket-artifacts/reports/weekly-summary.json",
        },
      ],
      selectedEc2Region: "us-east-1",
      selectedEc2InstanceId: "i-0123456789abcdef0",
      ec2StatusMessage: "Loaded 1 EC2 instances from us-east-1.",
      ec2Regions: ["us-east-1"],
      ec2Instances: [
        {
          instanceId: "i-0123456789abcdef0",
          name: "sandbox-api-1",
          state: "running",
          instanceType: "t3.medium",
          availabilityZone: "us-east-1a",
          privateIp: "10.0.14.22",
        },
      ],
      selectedLambdaRegion: "us-east-1",
      selectedLambdaFunctionName: "process-order",
      lambdaStatusMessage: "Loaded 2 Lambda functions from us-east-1.",
      lambdaRegions: ["us-east-1", "eu-west-2"],
      lambdaFunctions: [
        {
          functionName: "process-order",
          runtime: "nodejs20.x",
          memorySize: 512,
          lastModified: "2026-06-10T12:00:00Z",
          description: "Handles order processing from SQS",
          state: "Active",
          handler: "index.handler",
          timeout: 30,
          logGroup: "/aws/lambda/process-order",
          recentLogs: ["2026-06-15 10:05:12 START RequestId: abc123"],
        },
        {
          functionName: "resize-image",
          runtime: "python3.12",
          memorySize: 1024,
          lastModified: "2026-06-08T09:15:00Z",
          state: "Active",
        },
      ],
      selectedDynamodbRegion: "us-east-1",
      selectedDynamodbTableName: "cloudsprocket-orders",
      dynamodbStatusMessage: "Loaded 2 DynamoDB tables from us-east-1.",
      dynamodbRegions: ["us-east-1", "eu-west-2"],
      dynamodbTables: [
        {
          tableName: "cloudsprocket-orders",
          status: "ACTIVE",
          itemCount: 1284,
          hashKey: "orderId",
          rangeKey: "createdAt",
        },
        {
          tableName: "cloudsprocket-sessions",
          status: "ACTIVE",
          itemCount: 42,
          hashKey: "sessionId",
        },
      ],
      selectedSqsRegion: "us-east-1",
      selectedSqsQueueUrl: "http://localhost:4566/000000000000/process-order",
      sqsStatusMessage: "Loaded 2 SQS queues from us-east-1.",
      sqsRegions: ["us-east-1", "eu-west-2"],
      sqsQueues: [
        {
          queueName: "process-order",
          queueUrl: "http://localhost:4566/000000000000/process-order",
          approximateNumberOfMessages: 4,
          approximateNumberOfMessagesNotVisible: 1,
        },
        {
          queueName: "cloudsprocket-events",
          queueUrl: "http://localhost:4566/000000000000/cloudsprocket-events",
          approximateNumberOfMessages: 0,
        },
      ],
      selectedSnsRegion: "us-east-1",
      selectedSnsTopicArn: "arn:aws:sns:us-east-1:000000000000:order-events",
      snsStatusMessage: "Loaded 2 SNS topics from us-east-1.",
      snsRegions: ["us-east-1", "eu-west-2"],
      snsTopics: [
        {
          topicArn: "arn:aws:sns:us-east-1:000000000000:order-events",
          topicName: "order-events",
          displayName: "Order events",
          subscriptionsConfirmed: "2",
        },
        {
          topicArn: "arn:aws:sns:us-east-1:000000000000:cloudsprocket-alerts",
          topicName: "cloudsprocket-alerts",
          subscriptionsConfirmed: "1",
        },
      ],
      selectedRdsRegion: "us-east-1",
      selectedRdsInstanceId: "cloudsprocket-app-db",
      rdsStatusMessage: "Loaded 2 RDS instances from us-east-1.",
      rdsRegions: ["us-east-1", "eu-west-2"],
      rdsInstances: [
        {
          dbInstanceIdentifier: "cloudsprocket-app-db",
          engine: "postgres",
          engineVersion: "15.4",
          status: "available",
          instanceClass: "db.t3.micro",
        },
        {
          dbInstanceIdentifier: "cloudsprocket-analytics-db",
          engine: "mysql",
          status: "available",
        },
      ],
      ecsRegions: [],
      ecsClusters: [],
      ecsServices: [],
      ecsTasks: [],
  eksRegions: [],
  eksClusters: [],
  eksNodeGroups: [],
      apiGatewayRegions: [],
      apiGatewayApis: [],
      apiGatewayStages: [],
  secretsManagerRegions: [],
  secretsManagerSecrets: [],
  cloudFormationRegions: [],
  cloudFormationStacks: [],
  cloudFormationStackEvents: [],
  eventBridgeRegions: [],
  eventBridgeBuses: [],
  route53HostedZones: [],
  route53ResourceRecordSets: [],
  elbRegions: [],
  elbLoadBalancers: [],
  elbTargetGroups: [],
  kmsRegions: [],
  kmsKeys: [],
  kmsAliases: [],
  eventBridgeRules: [],

      selectedLogsRegion: "us-east-1",
      selectedLogGroupName: "/aws/lambda/process-order",
      logsStatusMessage: "Loaded 2 log groups from us-east-1.",
      logsRegions: ["us-east-1", "eu-west-2"],
      logGroups: [
        {
          logGroupName: "/aws/lambda/process-order",
          retentionInDays: 7,
        },
        {
          logGroupName: "/ecs/cloudsprocket-app",
          retentionInDays: 30,
        },
      ],
      selectedIamRoleName: "cloudsprocket-lambda-role",
      iamStatusMessage: "Loaded 2 IAM roles and 1 customer-managed policies.",
      iamRoles: [
        {
          roleName: "cloudsprocket-lambda-role",
          roleArn: "arn:aws:iam::000000000000:role/cloudsprocket-lambda-role",
          attachedPolicies: ["AWSLambdaBasicExecutionRole"],
        },
        {
          roleName: "cloudsprocket-ecs-task-role",
          roleArn: "arn:aws:iam::000000000000:role/cloudsprocket-ecs-task-role",
        },
      ],
      iamPolicies: [
        {
          policyName: "cloudsprocket-data-access",
          policyArn: "arn:aws:iam::000000000000:policy/cloudsprocket-data-access",
          attachmentCount: 2,
        },
      ],
    };
    s3PrefixDelays = new Map();
    backendEventHandlers = {};
    emulatorStartParams = undefined;
  });

  it("renders the connect view while unlocked", async () => {
    render(
      <AppProviders>
        <App />
      </AppProviders>,
    );

    expect(await screen.findByRole("heading", { name: "Your clouds" })).toBeInTheDocument();
    expect(await screen.findByText("Azure")).toBeInTheDocument();
    // The default session has AWS selected, so its profile picker is shown.
    expect(await screen.findByRole("heading", { name: "Open AWS" })).toBeInTheDocument();
    // Profile cards are now the open action; each exposes an "Open" affordance.
    expect(screen.getByRole("button", { name: /sandbox/ })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Open workspace" })).not.toBeInTheDocument();
  });

  it("opens the developer toolbox before a workspace is locked", async () => {
    render(
      <AppProviders>
        <App />
      </AppProviders>,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: /Developer Toolbox · JSON, YAML, diff, encoders/i }),
    );

    expect(await screen.findByRole("heading", { name: "Developer Toolbox" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /json/i })).toBeInTheDocument();
  });

  it("opens the workspace in one click when a profile has a single usable auth path", async () => {
    render(
      <AppProviders>
        <App />
      </AppProviders>,
    );

    // The prod profile has only CLI usable, so clicking it opens directly with
    // no auth chip ceremony.
    fireEvent.click(await screen.findByRole("button", { name: /prod/ }));

    expect(await screen.findByText(/Write mode is off/)).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Switch connection" })).toBeInTheDocument();
    await waitFor(() => {
      const workspaceRequests = vi.mocked(backendRequest).mock.calls.filter(([method]) => method === "workspace.get");
      expect(workspaceRequests).toHaveLength(1);
    });
  });

  it("shows auth chips for a multi-path profile and opens after a chip click", async () => {
    render(
      <AppProviders>
        <App />
      </AppProviders>,
    );

    // The sandbox profile has CLI, SSO, and Local Files all usable, so clicking
    // it must surface the auth choice rather than opening immediately.
    fireEvent.click(await screen.findByRole("button", { name: /sandbox/ }));
    expect(await screen.findByText(/Pick one to open the workspace/)).toBeInTheDocument();
    expect(screen.queryByText(/Write mode is off/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "SSO" }));
    expect(await screen.findByText(/Write mode is off/)).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Switch connection" })).toBeInTheDocument();
  });

  it("renders startup when backend list fields are null", async () => {
    const originalProvider = providerFixtures[0];
    const originalProfile = profileFixtures[0];
    sessionFixture = {
      ...sessionFixture,
      availableAuthMethods: null,
      workspaceTabs: null,
    } as unknown as SessionSnapshot;
    providerFixtures[0] = {
      ...providerFixtures[0],
      locations: null,
    } as unknown as ProviderSummary;
    profileFixtures[0] = {
      ...profileFixtures[0],
      sourcePaths: null,
      attributes: null,
      authMethods: null,
    } as unknown as ProfileSummary;

    render(
      <AppProviders>
        <App />
      </AppProviders>,
    );

    expect(await screen.findByRole("heading", { name: "Your clouds" })).toBeInTheDocument();
    expect(await screen.findByText("Azure")).toBeInTheDocument();
    providerFixtures[0] = originalProvider;
    profileFixtures[0] = originalProfile;
  });

  it("masks sensitive profile values until they are revealed", async () => {
    // The connect screen no longer shows the profile inspector, and the locked
    // overview tab is now the Tailwind OverviewView. The masking still lives in
    // PlaceholderView, reachable via a workspace tab without a dedicated panel.
    sessionFixture = {
      ...sessionFixture,
      isLocked: true,
      lockedProviderId: "aws",
      lockedProfileId: "sandbox",
      lockedAuthMethod: "cli",
      workspaceTabs: [
        { tabId: "overview", label: "Overview", summary: "Summary", detail: "Overview panel" },
        {
          tabId: "profile-inspector",
          label: "Profile",
          summary: "Profile summary",
          detail: "Profile panel",
        },
      ],
    };

    render(
      <AppProviders>
        <App />
      </AppProviders>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Profile" }));
    expect(await screen.findByText("Hidden until revealed")).toBeInTheDocument();
    expect(
      screen.getByText(/Credential and secret fields are redacted by the daemon/i),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reveal Sensitive Values" }));
    // Fixture path may still carry a value; live discovery redacts secrets server-side.
    expect(await screen.findByText("super-secret-value")).toBeInTheDocument();
  });

  it("renders the locked workspace tabs when the session is locked", async () => {
    sessionFixture = {
      ...sessionFixture,
      isLocked: true,
      lockedProviderId: "aws",
      lockedProfileId: "sandbox",
      lockedAuthMethod: "cli",
      awsWriteModeEnabled: true,
      workspaceTabs: [
        {
          tabId: "overview",
          label: "Overview",
          summary: "Summary",
          detail: "Overview panel",
        },
        {
          tabId: "virtualisation",
          label: "Local Runtime",
          summary: "Runtime summary",
          detail: "Runtime panel",
        },
        {
          tabId: "s3",
          label: "S3",
          summary: "S3 summary",
          detail: "S3 panel",
        },
        {
          tabId: "ec2",
          label: "EC2",
          summary: "EC2 summary",
          detail: "EC2 panel",
        },
        {
          tabId: "lambda",
          label: "Lambda",
          summary: "Lambda summary",
          detail: "Lambda panel",
        },
        {
          tabId: "dynamodb",
          label: "DynamoDB",
          summary: "DynamoDB summary",
          detail: "DynamoDB panel",
        },
        {
          tabId: "sqs",
          label: "SQS",
          summary: "SQS summary",
          detail: "SQS panel",
        },
        {
          tabId: "sns",
          label: "SNS",
          summary: "SNS summary",
          detail: "SNS panel",
        },
        {
          tabId: "rds",
          label: "RDS",
          summary: "RDS summary",
          detail: "RDS panel",
        },
        {
          tabId: "logs",
          label: "Logs",
          summary: "Logs summary",
          detail: "Logs panel",
        },
        {
          tabId: "iam",
          label: "IAM",
          summary: "IAM summary",
          detail: "IAM panel",
        },
      ],
    };
    workspaceFixture = {
      ...workspaceFixture,
      awsEndpointUrl: "http://192.168.50.168:4566",
      awsWriteCapable: true,
      awsWriteModeEnabled: true,
      awsWritesEnabled: true,
    };

    render(
      <AppProviders>
        <App />
      </AppProviders>,
    );

    // Locked landing is now the Tailwind OverviewView: safety banner reflects
    // awsWritesEnabled, stat cards and recents come from the workspace snapshot.
    expect(await screen.findByText(/Write mode is on/)).toBeInTheDocument();
    expect(await screen.findByText("S3 buckets")).toBeInTheDocument();
    expect(screen.getByText("EC2 instances")).toBeInTheDocument();
    expect(screen.getByText("Lambda functions")).toBeInTheDocument();
    expect(screen.getByText("DynamoDB tables")).toBeInTheDocument();
    expect(screen.getByText("SQS queues")).toBeInTheDocument();
    expect(screen.getByText("SNS topics")).toBeInTheDocument();
    expect(screen.getByText("RDS instances")).toBeInTheDocument();
    expect(screen.getByText("Log groups")).toBeInTheDocument();
    expect(screen.getByText("IAM roles")).toBeInTheDocument();
    expect(screen.getByText(/workspace sandbox/)).toBeInTheDocument();
    expect(screen.getByText("cloudsprocket-artifacts")).toBeInTheDocument();
    expect(screen.getByText("sandbox-api-1")).toBeInTheDocument();
    expect((await screen.findAllByText("process-order")).length).toBeGreaterThan(0);
    expect(screen.getByText("cloudsprocket-orders")).toBeInTheDocument();
    expect(screen.getByText("order-events")).toBeInTheDocument();
    expect(screen.getByText("cloudsprocket-app-db")).toBeInTheDocument();
    expect(screen.getByText("/aws/lambda/process-order")).toBeInTheDocument();
    expect(screen.getByText("cloudsprocket-lambda-role")).toBeInTheDocument();
    const nav = within(document.querySelector('[data-slot="context-nav"]') as HTMLElement);
    expect(nav.getByText("Overview")).toBeInTheDocument();
    expect(nav.getByText("Local Runtime")).toBeInTheDocument();
    expect(nav.getByText("S3")).toBeInTheDocument();
    expect(nav.getByText("EC2")).toBeInTheDocument();
    expect(nav.getByText("Lambda")).toBeInTheDocument();
    expect(nav.getByText("DynamoDB")).toBeInTheDocument();
    expect(nav.getByText("SQS")).toBeInTheDocument();
    expect(nav.getByText("SNS")).toBeInTheDocument();
    expect(nav.getByText("RDS")).toBeInTheDocument();
    expect(nav.getByText("Logs")).toBeInTheDocument();
    expect(nav.getByText("IAM")).toBeInTheDocument();
    expect(nav.getByRole("button", { name: /S3/ }).querySelector("img")).not.toBeNull();
    expect(nav.getByRole("button", { name: /EC2/ }).querySelector("img")).not.toBeNull();
    fireEvent.click(nav.getByText("Local Runtime"));
    expect(await screen.findByText("Docker Runtime")).toBeInTheDocument();
    expect(await screen.findByText("Local Runtimes")).toBeInTheDocument();
    expect(await screen.findByText("Managed Docker Resources")).toBeInTheDocument();
    expect(await screen.findByText("Local Config Artefacts")).toBeInTheDocument();
    expect(await screen.findByText("LocalStack")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create AWS Profile" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start LocalStack" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start floci-az" })).toBeInTheDocument();
    expect(
      await screen.findByText(/cloudsprocket-workspace\.db/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Switch connection" })).toBeInTheDocument();
  });

  it("enables write mode from the top bar after confirmation", async () => {
    sessionFixture = {
      ...sessionFixture,
      isLocked: true,
      lockedProviderId: "aws",
      lockedProfileId: "sandbox",
      lockedAuthMethod: "cli",
      workspaceTabs: [{ tabId: "overview", label: "Overview", summary: "Summary", detail: "Overview panel" }],
    };

    render(
      <AppProviders>
        <App />
      </AppProviders>,
    );

    expect(await screen.findByText(/Write mode is off/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Read-only mode" }));
    expect(
      await screen.findByRole("alertdialog", { name: "Enable write mode for this session?" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Enable writes" }));
    expect(await screen.findByText(/Write mode is on/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Write mode on" })).toBeInTheDocument();
  });

  it("shows an overview CTA to create the first Lambda function when inventory is empty", async () => {
    sessionFixture = {
      ...sessionFixture,
      isLocked: true,
      lockedProviderId: "aws",
      lockedProfileId: "sandbox",
      lockedAuthMethod: "cli",
      awsWriteModeEnabled: true,
      workspaceTabs: [
        { tabId: "overview", label: "Overview", summary: "Summary", detail: "Overview panel" },
        { tabId: "lambda", label: "Lambda", summary: "Lambda summary", detail: "Lambda panel" },
      ],
    };
    workspaceFixture = {
      ...workspaceFixture,
      awsEndpointUrl: "http://localhost:4566",
      awsWriteCapable: true,
      awsWriteModeEnabled: true,
      awsWritesEnabled: true,
      selectedLambdaRegion: "us-east-1",
      lambdaRegions: ["us-east-1"],
      lambdaFunctions: [],
      lambdaStatusMessage: "No Lambda functions were returned for us-east-1.",
      selectedLambdaFunctionName: undefined,
    };

    render(
      <AppProviders>
        <App />
      </AppProviders>,
    );

    const createCta = await screen.findByRole("button", { name: "Create your first function" });
    expect(screen.getByText("No Lambda functions yet")).toBeInTheDocument();
    fireEvent.click(createCta);
    expect(await screen.findByRole("alertdialog", { name: "Create Lambda function" })).toBeInTheDocument();
  });

  it("renders the locked workspace when backend runtime fields are sparse", async () => {
    sessionFixture = {
      ...sessionFixture,
      isLocked: true,
      lockedProviderId: "aws",
      lockedProfileId: "sandbox",
      lockedAuthMethod: "cli",
      workspaceTabs: [
        {
          tabId: "overview",
          label: "Overview",
          summary: "Summary",
          detail: "Overview panel",
        },
      ],
    };
    workspaceFixture = {
      provider: providerFixtures[0],
      profile: profileFixtures[0],
      authMethod: "cli",
      runtimeSettings: settingsFixture,
      dockerDiagnostics: {
        engineState: "available",
        summary: "Docker is available.",
      },
      dockerRuntime: {
        reachable: true,
        summary: "Docker is reachable.",
      },
      awsWriteCapable: true,
      awsWriteTargetIsLocal: true,
      awsWriteModeEnabled: false,
      awsWritesEnabled: false,
    } as WorkspaceSnapshot;

    render(
      <AppProviders>
        <App />
      </AppProviders>,
    );

    expect(await screen.findByText(/Write mode is off/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Local Runtime/ }));
    expect(await screen.findByText("Docker Runtime")).toBeInTheDocument();
    expect(await screen.findByText("Local Runtimes")).toBeInTheDocument();
    expect(await screen.findByText("Managed Docker Resources")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Start LocalStack" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Start floci-az" })).toBeInTheDocument();
  });

  it("keeps emulator start actions enabled while Docker reports unhealthy during wake-up", async () => {
    sessionFixture = {
      ...sessionFixture,
      isLocked: true,
      lockedProviderId: "aws",
      lockedProfileId: "sandbox",
      lockedAuthMethod: "cli",
      workspaceTabs: [
        {
          tabId: "overview",
          label: "Overview",
          summary: "Summary",
          detail: "Overview panel",
        },
        {
          tabId: "virtualisation",
          label: "Local Runtime",
          summary: "Runtime summary",
          detail: "Runtime panel",
        },
      ],
    };
    workspaceFixture = {
      ...workspaceFixture,
      emulatorSummaries: workspaceFixture.emulatorSummaries.map((emulator) => ({
        ...emulator,
        status: "unhealthy",
        summary: `${emulator.label} health check is unavailable while Docker wakes up.`,
      })),
    };

    render(
      <AppProviders>
        <App />
      </AppProviders>,
    );

    fireEvent.click(await screen.findByText("Local Runtime"));
    expect(await screen.findByRole("button", { name: "Start LocalStack" })).toBeEnabled();
    expect(await screen.findByRole("button", { name: "Start floci-az" })).toBeEnabled();
  });

  it("unlocks from the local runtime workspace back to setup", async () => {
    sessionFixture = {
      ...sessionFixture,
      isLocked: true,
      lockedProviderId: "aws",
      lockedProfileId: "sandbox",
      lockedAuthMethod: "cli",
      workspaceTabs: [
        {
          tabId: "overview",
          label: "Overview",
          summary: "Summary",
          detail: "Overview panel",
        },
      ],
    };

    render(
      <AppProviders>
        <App />
      </AppProviders>,
    );

    expect(await screen.findByText(/Write mode is off/)).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Switch connection" })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: /^Local Runtime/ }));
    expect(await screen.findByRole("button", { name: "Start LocalStack" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Switch connection" }));

    expect(await screen.findByRole("heading", { name: "Your clouds" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /sandbox/ })).toBeEnabled();
  });

  it("resets app-owned state back to setup without cloud config deletion", async () => {
    const user = userEvent.setup();
    sessionFixture = {
      ...sessionFixture,
      isLocked: true,
      lockedProviderId: "aws",
      lockedProfileId: "sandbox",
      lockedAuthMethod: "cli",
      workspaceTabs: [
        {
          tabId: "overview",
          label: "Overview",
          summary: "Summary",
          detail: "Overview panel",
        },
      ],
    };

    render(
      <AppProviders>
        <App />
      </AppProviders>,
    );

    expect(await screen.findByText(/Write mode is off/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "App menu" }));
    await user.click(await screen.findByRole("menuitem", { name: /Reset app data/ }));
    expect(await screen.findByRole("alertdialog", { name: "Reset app data" })).toBeInTheDocument();
    expect(screen.getByText(/does not touch AWS, Azure, or GCP config files/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Reset confirmation"), {
      target: { value: "RESET" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Reset app" }));

    expect(await screen.findByRole("heading", { name: "Your clouds" })).toBeInTheDocument();
    expect(await screen.findByText("App reset complete")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /sandbox/ })).toBeEnabled();
  });

  it("confirms before switching provider while a workspace is locked", async () => {
    sessionFixture = {
      ...sessionFixture,
      isLocked: true,
      currentProviderId: "aws",
      lockedProviderId: "aws",
      lockedProfileId: "sandbox",
      lockedAuthMethod: "cli",
      selectedProfileId: "sandbox",
      workspaceTabs: [
        { tabId: "overview", label: "Overview", summary: "Summary", detail: "Overview panel" },
        {
          tabId: "dynamodb",
          label: "DynamoDB",
          summary: "Tables",
          detail: "DynamoDB panel",
          category: "service",
          domain: "database",
        },
      ],
    };

    render(
      <AppProviders>
        <App />
      </AppProviders>,
    );

    expect(await screen.findByText(/Write mode is off/)).toBeInTheDocument();
    vi.mocked(backendRequest).mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Azure · 1 profile" }));

    const leaveDialog = await screen.findByRole("alertdialog", { name: "Leave this workspace?" });
    expect(within(leaveDialog).getByText("sandbox", { exact: true })).toBeInTheDocument();
    expect(
      vi.mocked(backendRequest).mock.calls.some(([method]) => method === "session.selectProvider"),
    ).toBe(false);

    fireEvent.click(within(leaveDialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog", { name: "Leave this workspace?" })).not.toBeInTheDocument();
    expect(await screen.findByText(/Write mode is off/)).toBeInTheDocument();
    expect(sessionFixture.isLocked).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Azure · 1 profile" }));
    fireEvent.click(await screen.findByRole("button", { name: "Switch to Azure" }));

    await waitFor(() => {
      const methods = vi.mocked(backendRequest).mock.calls.map(([method]) => method);
      // Confirm path: unlock first (F-011), then selectProvider.
      expect(methods).toContain("session.unlock");
      expect(
        vi.mocked(backendRequest).mock.calls.some(
          ([method, params]) =>
            method === "session.selectProvider" &&
            (params as { providerId?: string } | undefined)?.providerId === "azure",
        ),
      ).toBe(true);
      const unlockIdx = methods.indexOf("session.unlock");
      const selectIdx = methods.findIndex(
        (method, index) =>
          method === "session.selectProvider" &&
          index > unlockIdx &&
          (vi.mocked(backendRequest).mock.calls[index][1] as { providerId?: string } | undefined)
            ?.providerId === "azure",
      );
      expect(unlockIdx).toBeGreaterThanOrEqual(0);
      expect(selectIdx).toBeGreaterThan(unlockIdx);
    });
    expect(await screen.findByRole("heading", { name: "Your clouds" })).toBeInTheDocument();
    expect(sessionFixture.isLocked).toBe(false);
    expect(sessionFixture.selectedProfileId).toBeUndefined();
  });

  it("switches provider immediately when the session is unlocked", async () => {
    render(
      <AppProviders>
        <App />
      </AppProviders>,
    );

    expect(await screen.findByRole("heading", { name: "Open AWS" })).toBeInTheDocument();
    vi.mocked(backendRequest).mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Azure · 1 profile" }));

    await waitFor(() => {
      expect(
        vi.mocked(backendRequest).mock.calls.some(
          ([method, params]) =>
            method === "session.selectProvider" &&
            (params as { providerId?: string } | undefined)?.providerId === "azure",
        ),
      ).toBe(true);
    });
    expect(screen.queryByRole("alertdialog", { name: "Leave this workspace?" })).not.toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Open Azure" })).toBeInTheDocument();
  });

  it("offers locked workspace tabs in the palette from a non-workspace area", async () => {
    // Radix Dialog can leave pointer-events:none on the input during open animation;
    // skip that check so palette typing stays deterministic in jsdom.
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    sessionFixture = {
      ...sessionFixture,
      isLocked: true,
      currentProviderId: "aws",
      lockedProviderId: "aws",
      lockedProfileId: "sandbox",
      lockedAuthMethod: "cli",
      workspaceTabs: [
        { tabId: "overview", label: "Overview", summary: "Summary", detail: "Overview panel" },
        {
          tabId: "dynamodb",
          label: "DynamoDB",
          summary: "Tables",
          detail: "DynamoDB panel",
          category: "service",
          domain: "database",
        },
      ],
    };

    render(
      <AppProviders>
        <App />
      </AppProviders>,
    );

    expect(await screen.findByText(/Write mode is off/)).toBeInTheDocument();
    // Developer Toolbox is a non-workspace rail area that does not need Deploy
    // catalogue mocks; palette should still list workspace services while locked.
    fireEvent.click(
      screen.getByRole("button", { name: /Developer Toolbox · JSON, YAML, diff, encoders/i }),
    );
    expect(await screen.findByRole("heading", { name: "Developer Toolbox" })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const search = await screen.findByRole("textbox", { name: "Search commands" });
    await user.type(search, "DynamoDB{enter}");

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /DynamoDB/i })).toBeInTheDocument();
    });
  });

  it("opens reset confirmation from the command palette", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    sessionFixture = {
      ...sessionFixture,
      isLocked: true,
      lockedProviderId: "aws",
      lockedProfileId: "sandbox",
      lockedAuthMethod: "cli",
      workspaceTabs: [],
    };

    render(
      <AppProviders>
        <App />
      </AppProviders>,
    );

    expect(await screen.findByText(/Write mode is off/)).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const search = await screen.findByRole("textbox", { name: "Search commands" });
    await user.type(search, "Reset app data{enter}");

    expect(await screen.findByRole("alertdialog", { name: "Reset app data" })).toBeInTheDocument();
  });

  it("starts and stops LocalStack from the local runtime workspace", async () => {
    sessionFixture = {
      ...sessionFixture,
      isLocked: true,
      lockedProviderId: "aws",
      lockedProfileId: "sandbox",
      lockedAuthMethod: "cli",
      workspaceTabs: [
        {
          tabId: "overview",
          label: "Overview",
          summary: "Summary",
          detail: "Overview panel",
        },
        {
          tabId: "virtualisation",
          label: "Local Runtime",
          summary: "Runtime summary",
          detail: "Runtime panel",
        },
      ],
    };

    render(
      <AppProviders>
        <App />
      </AppProviders>,
    );

    fireEvent.click(await screen.findByText("Local Runtime"));
    fireEvent.change(await screen.findByLabelText("LocalStack auth token"), {
      target: { value: "localstack-token" },
    });
    fireEvent.click(screen.getByLabelText("Enable LocalStack persistence"));
    fireEvent.change(screen.getByPlaceholderText("DEBUG=1"), {
      target: { value: "DEBUG=1\nLOCALSTACK_AUTH_TOKEN=ignored\nBAD-NAME=ignored" },
    });
    fireEvent.click(await screen.findByRole("button", { name: "Start LocalStack" }));
    await waitFor(() => {
      expect(emulatorStartParams).toEqual({
        emulatorId: "localstack",
        authToken: "localstack-token",
        persistence: true,
        environment: { DEBUG: "1" },
      });
    });
    await waitFor(() => {
      expect(screen.queryAllByText("LocalStack is running at http://localhost:4566.").length).toBeGreaterThan(0);
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Stop LocalStack" })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole("button", { name: "Stop LocalStack" }));
    await waitFor(() => {
      expect(screen.queryAllByText("LocalStack container is present but not running.").length).toBeGreaterThan(0);
    });
  }, 10000);

  it("starts and stops floci-az from the local runtime workspace", async () => {
    sessionFixture = {
      ...sessionFixture,
      isLocked: true,
      lockedProviderId: "azure",
      lockedProfileId: "sub-001",
      lockedAuthMethod: "cli",
      currentProviderId: "azure",
      selectedProfileId: "sub-001",
      selectedAuthMethod: "cli",
      workspaceTabs: [
        {
          tabId: "overview",
          label: "Overview",
          summary: "Summary",
          detail: "Overview panel",
        },
        {
          tabId: "virtualisation",
          label: "Local Runtime",
          summary: "Runtime summary",
          detail: "Runtime panel",
        },
      ],
    };

    render(
      <AppProviders>
        <App />
      </AppProviders>,
    );

    fireEvent.click(await screen.findByText("Local Runtime"));
    expect(await screen.findByRole("button", { name: "Start floci-az" })).toBeInTheDocument();
    fireEvent.click(await screen.findByLabelText("Enable floci-az persistence"));
    fireEvent.change(screen.getByPlaceholderText("FLOCI_AZ_SERVICES_FUNCTIONS_ENABLED=false"), {
      target: { value: "FLOCI_AZ_SERVICES_FUNCTIONS_ENABLED=false\nBAD-NAME=ignored" },
    });
    fireEvent.click(await screen.findByRole("button", { name: "Start floci-az" }));
    await waitFor(() => {
      expect(emulatorStartParams).toEqual({
        emulatorId: "floci-az",
        persistence: true,
        environment: { FLOCI_AZ_SERVICES_FUNCTIONS_ENABLED: "false" },
      });
    });
    await waitFor(() => {
      expect(screen.queryAllByText("floci-az is running at http://localhost:4577.").length).toBeGreaterThan(0);
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Stop floci-az" })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole("button", { name: "Stop floci-az" }));
    await waitFor(() => {
      expect(screen.queryAllByText("floci-az container is present but not running.").length).toBeGreaterThan(0);
    });
  }, 10000);

  it("keeps persistence and environment controls editable while emulators are running", async () => {
    sessionFixture = {
      ...sessionFixture,
      isLocked: true,
      lockedProviderId: "aws",
      lockedProfileId: "sandbox",
      lockedAuthMethod: "cli",
      workspaceTabs: [
        {
          tabId: "overview",
          label: "Overview",
          summary: "Summary",
          detail: "Overview panel",
        },
        {
          tabId: "virtualisation",
          label: "Local Runtime",
          summary: "Runtime summary",
          detail: "Runtime panel",
        },
      ],
    };
    workspaceFixture = {
      ...workspaceFixture,
      emulatorSummaries: workspaceFixture.emulatorSummaries.map((emulator) => ({
        ...emulator,
        status: "running",
        summary: `${emulator.label} is running.`,
      })),
    };

    render(
      <AppProviders>
        <App />
      </AppProviders>,
    );

    fireEvent.click(await screen.findByText("Local Runtime"));
    expect(await screen.findByLabelText("Enable LocalStack persistence")).toBeEnabled();
    expect(screen.getByLabelText("LocalStack auth token")).toBeEnabled();
    expect(screen.getByLabelText("Enable floci-az persistence")).toBeEnabled();
  });

  it("opens S3 object details and supports contains search", async () => {
    sessionFixture = {
      ...sessionFixture,
      isLocked: true,
      lockedProviderId: "aws",
      lockedProfileId: "sandbox",
      lockedAuthMethod: "cli",
      workspaceTabs: [
        {
          tabId: "overview",
          label: "Overview",
          summary: "Summary",
          detail: "Overview panel",
        },
        {
          tabId: "s3",
          label: "S3",
          summary: "S3 summary",
          detail: "S3 panel",
        },
      ],
    };
    workspaceFixture = {
      ...workspaceFixture,
      s3Objects: [
        { key: "reports/", isFolder: true, size: "Folder" },
        { key: "readme.txt", size: "12 B" },
      ],
      selectedS3ObjectKey: undefined,
      s3ObjectMetadata: [],
      s3ExportSnippets: [],
    };

    render(
      <AppProviders>
        <App />
      </AppProviders>,
    );

    fireEvent.click(await screen.findByText("S3"));
    // Folder row should be visible without typing a path prefix.
    expect(await screen.findByText("reports/")).toBeInTheDocument();
    fireEvent.click(await screen.findByText("readme.txt"));

    expect(await screen.findByRole("complementary", { name: "S3 object details" })).toBeInTheDocument();
    expect(
      await screen.findByText(/s3:\/\/cloudsprocket-artifacts\/readme\.txt/i),
    ).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Metadata" }));
    expect(await screen.findByText("Metadata: owner")).toBeInTheDocument();
    expect(await screen.findByText("analytics")).toBeInTheDocument();

    const searchInput = await screen.findByLabelText("Search object keys");
    fireEvent.change(searchInput, { target: { value: "read" } });
    expect((await screen.findAllByText("readme.txt")).length).toBeGreaterThan(0);
    fireEvent.change(searchInput, { target: { value: "nomatch-zzz" } });
    expect(await screen.findByText("No matching names")).toBeInTheDocument();
  }, 15000);

  it("keeps the S3 key search stable when older search responses finish late", async () => {
    sessionFixture = {
      ...sessionFixture,
      isLocked: true,
      lockedProviderId: "aws",
      lockedProfileId: "sandbox",
      lockedAuthMethod: "cli",
      workspaceTabs: [
        {
          tabId: "overview",
          label: "Overview",
          summary: "Summary",
          detail: "Overview panel",
        },
        {
          tabId: "s3",
          label: "S3",
          summary: "S3 summary",
          detail: "S3 panel",
        },
      ],
    };

    render(
      <AppProviders>
        <App />
      </AppProviders>,
    );

    fireEvent.click(await screen.findByText("S3"));
    const searchInput = await screen.findByLabelText("Search object keys");

    fireEvent.change(searchInput, { target: { value: "week" } });
    await act(async () => {
      await new Promise((resolve) => {
        window.setTimeout(resolve, 250);
      });
    });
    fireEvent.change(searchInput, { target: { value: "weekly" } });

    expect(searchInput).toHaveValue("weekly");
    expect((await screen.findAllByText("reports/weekly-summary.json")).length).toBeGreaterThan(0);
  });

  it("does not restore a previous S3 search when a workspace refresh finishes", async () => {
    sessionFixture = {
      ...sessionFixture,
      isLocked: true,
      lockedProviderId: "aws",
      lockedProfileId: "sandbox",
      lockedAuthMethod: "cli",
      workspaceTabs: [
        {
          tabId: "overview",
          label: "Overview",
          summary: "Summary",
          detail: "Overview panel",
        },
        {
          tabId: "s3",
          label: "S3",
          summary: "S3 summary",
          detail: "S3 panel",
        },
      ],
    };

    render(
      <AppProviders>
        <App />
      </AppProviders>,
    );

    fireEvent.click(await screen.findByText("S3"));
    const searchInput = await screen.findByLabelText("Search object keys");
    fireEvent.change(searchInput, { target: { value: "current-term" } });

    await act(async () => {
      backendEventHandlers["job.updated"]?.({
        jobId: "job-upload",
        label: "S3 Upload",
        status: "completed",
        message: "Upload completed.",
        result: {
          destinationUri: "s3://cloudsprocket-artifacts/reports/uploaded.json",
        },
      });
    });

    await waitFor(() => {
      expect(searchInput).toHaveValue("current-term");
    });
  });

  it("renders EC2 inventory and queues lifecycle actions", async () => {
    sessionFixture = {
      ...sessionFixture,
      isLocked: true,
      lockedProviderId: "aws",
      lockedProfileId: "sandbox",
      lockedAuthMethod: "cli",
      awsWriteModeEnabled: true,
      workspaceTabs: [
        {
          tabId: "overview",
          label: "Overview",
          summary: "Summary",
          detail: "Overview panel",
        },
        {
          tabId: "ec2",
          label: "EC2",
          summary: "EC2 summary",
          detail: "EC2 panel",
        },
      ],
    };
    workspaceFixture = {
      ...workspaceFixture,
      awsEndpointUrl: "http://192.168.50.168:4566",
      awsWriteCapable: true,
      awsWriteModeEnabled: true,
      awsWritesEnabled: true,
    };

    render(
      <AppProviders>
        <App />
      </AppProviders>,
    );

    fireEvent.click(await screen.findByText("EC2"));

    expect(await screen.findByText("EC2 Fleet")).toBeInTheDocument();
    expect(await screen.findByText("Instance Inventory")).toBeInTheDocument();
    expect((await screen.findAllByText("sandbox-api-1")).length).toBeGreaterThan(0);
    expect((await screen.findAllByText("i-0123456789abcdef0")).length).toBeGreaterThan(0);
    expect(await screen.findByText("AWS Console URL")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refresh EC2" }));
    expect(await screen.findByText("Loaded 1 EC2 instances from us-east-1.")).toBeInTheDocument();

    const stopButton = screen.getByRole("button", { name: "Stop" });
    expect(stopButton).not.toBeDisabled();
    await act(async () => {
      fireEvent.click(stopButton);
    });
    expect(await screen.findByRole("alertdialog", { name: "Stop EC2 instance" })).toBeInTheDocument();
    expect(await screen.findByText(/send a live EC2 stop request/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirm Stop" }));

    expect((await screen.findAllByText(/Queueing EC2 stop for i-0123456789abcdef0/i)).length).toBeGreaterThan(0);
    expect(await screen.findByText("EC2 operation running")).toBeInTheDocument();

    await act(async () => {
      backendEventHandlers["job.updated"]?.({
        jobId: "job-ec2",
        label: "EC2 Action",
        status: "completed",
        message: "EC2 stop completed for i-0123456789abcdef0 in us-east-1. Desired state reached: stopped.",
        result: {
          ...workspaceFixture,
          ec2Instances: [
            {
              ...workspaceFixture.ec2Instances[0],
              state: "stopped",
            },
          ],
        },
      });
    });

    expect((await screen.findAllByText(/Desired state reached: stopped/i)).length).toBeGreaterThan(0);
    expect(await screen.findByText("EC2 Action History")).toBeInTheDocument();
    expect((await screen.findAllByText("stopped")).length).toBeGreaterThan(0);
  });

  it("badges the bell and lists job notifications in the notification centre", async () => {
    render(
      <AppProviders>
        <App />
      </AppProviders>,
    );

    const bell = await screen.findByRole("button", { name: "Notifications" });
    expect(within(bell).queryByText("1")).not.toBeInTheDocument();

    await act(async () => {
      backendEventHandlers["job.updated"]?.({
        jobId: "job-notify",
        label: "Discovery refresh",
        status: "completed",
        message: "All clouds refreshed.",
      });
    });

    // The unread badge reflects the new notification.
    await waitFor(() => {
      expect(within(bell).getByText("1")).toBeInTheDocument();
    });

    // Opening the centre lists the record and clears the unread badge.
    fireEvent.click(bell);
    const panel = await screen.findByRole("dialog", { name: "Notifications" });
    expect(within(panel).getByText("Discovery refresh")).toBeInTheDocument();
    expect(within(panel).getByText("All clouds refreshed.")).toBeInTheDocument();
    await waitFor(() => {
      expect(within(bell).queryByText("1")).not.toBeInTheDocument();
    });

    // Dismissing the row empties the centre.
    fireEvent.click(within(panel).getByRole("button", { name: "Dismiss notification" }));
    expect(await within(panel).findByText("No notifications yet.")).toBeInTheDocument();
  });

  it("keeps EC2 lifecycle actions disabled for normal AWS profiles", async () => {
    sessionFixture = {
      ...sessionFixture,
      isLocked: true,
      lockedProviderId: "aws",
      lockedProfileId: "sandbox",
      lockedAuthMethod: "cli",
      workspaceTabs: [
        {
          tabId: "overview",
          label: "Overview",
          summary: "Summary",
          detail: "Overview panel",
        },
        {
          tabId: "ec2",
          label: "EC2",
          summary: "EC2 summary",
          detail: "EC2 panel",
        },
      ],
    };
    workspaceFixture = {
      ...workspaceFixture,
      awsEndpointUrl: undefined,
      awsWriteCapable: true,
      awsWriteTargetIsLocal: false,
      awsWriteModeEnabled: false,
      awsWritesEnabled: false,
    };

    render(
      <AppProviders>
        <App />
      </AppProviders>,
    );

    fireEvent.click(await screen.findByText("EC2"));

    expect(await screen.findByRole("button", { name: "Read-only mode" })).toBeInTheDocument();
    expect(await screen.findByText("Instance Inventory")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Stop" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reboot" })).toBeDisabled();
  }, 15000);

  it("renders a safe EC2 empty state", async () => {
    sessionFixture = {
      ...sessionFixture,
      isLocked: true,
      lockedProviderId: "aws",
      lockedProfileId: "sandbox",
      lockedAuthMethod: "cli",
      workspaceTabs: [
        {
          tabId: "overview",
          label: "Overview",
          summary: "Summary",
          detail: "Overview panel",
        },
        {
          tabId: "ec2",
          label: "EC2",
          summary: "EC2 summary",
          detail: "EC2 panel",
        },
      ],
    };
    workspaceFixture = {
      ...workspaceFixture,
      awsEndpointUrl: undefined,
      selectedEc2Region: undefined,
      selectedEc2InstanceId: undefined,
      ec2StatusMessage: "No EC2 region is available for this AWS workspace.",
      ec2Regions: [],
      ec2Instances: [],
    };

    render(
      <AppProviders>
        <App />
      </AppProviders>,
    );

    fireEvent.click(await screen.findByText("EC2"));

    expect(await screen.findByText("Instance Inventory")).toBeInTheDocument();
    expect(await screen.findByText(/No EC2 region is available for this AWS workspace/)).toBeInTheDocument();
    expect(await screen.findByText("No EC2 instances loaded for this region.")).toBeInTheDocument();
    expect(await screen.findByText("No instance selected")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Start" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Stop" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reboot" })).toBeDisabled();
  }, 15000);

  it("renders the activity tab and refresh action", async () => {
    sessionFixture = {
      ...sessionFixture,
      isLocked: true,
      lockedProviderId: "aws",
      lockedProfileId: "sandbox",
      lockedAuthMethod: "cli",
      workspaceTabs: [
        {
          tabId: "overview",
          label: "Overview",
          summary: "Summary",
          detail: "Overview panel",
        },
        {
          tabId: "actions",
          label: "Activity",
          summary: "Activity summary",
          detail: "Activity panel",
        },
      ],
    };

    render(
      <AppProviders>
        <App />
      </AppProviders>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Activity" }));

    expect(await screen.findByRole("heading", { name: "Activity" })).toBeInTheDocument();
    expect(await screen.findByText("Refresh Discovery")).toBeInTheDocument();
    expect((await screen.findAllByText("Provider discovery completed in test mode.")).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Refresh Discovery" }));

    expect(screen.getByRole("heading", { name: "Activity" })).toBeInTheDocument();
  });

  it("shows Azure-specific workspace tabs and hides AWS-only views for locked Azure sessions", async () => {
    sessionFixture = {
      ...sessionFixture,
      currentProviderId: "azure",
      selectedProfileId: "sub-001",
      selectedAuthMethod: "cli",
      isLocked: true,
      lockedProviderId: "azure",
      lockedProfileId: "sub-001",
      lockedAuthMethod: "cli",
      workspaceTabs: [
        {
          tabId: "overview",
          label: "Overview",
          summary: "Summary",
          detail: "Overview panel",
        },
        {
          tabId: "azure-overview",
          label: "Azure",
          summary: "Azure summary",
          detail: "Azure panel",
        },
        {
          tabId: "azure-resource-groups",
          label: "Resource Groups",
          summary: "Azure groups",
          detail: "Resource groups panel",
        },
        {
          tabId: "azure-vms",
          label: "Virtual Machines",
          summary: "Azure virtual machines",
          detail: "Virtual machines panel",
        },
        {
          tabId: "actions",
          label: "Activity",
          summary: "Activity summary",
          detail: "Activity panel",
        },
      ],
    };
    workspaceFixture = {
      ...workspaceFixture,
      provider: providerFixtures[1],
      profile: profileFixtures[1],
      authMethod: "cli",
      awsEndpointUrl: undefined,
      awsWriteCapable: false,
      awsWriteModeEnabled: false,
      awsWritesEnabled: false,
      azureWriteCapable: true,
      azureWriteModeEnabled: false,
      azureWritesEnabled: false,
      azureEndpointUrl: "http://localhost:4577",
      selectedAzureResourceGroup: "rg-marketing-prod",
      selectedAzureVmId: "/subscriptions/sub-001/resourceGroups/rg-marketing-prod/providers/Microsoft.Compute/virtualMachines/mkt-api-01",
      azureStatusMessage: "Loaded 1 Azure virtual machines from rg-marketing-prod.",
      azureResourceGroups: [
        {
          name: "rg-marketing-prod",
          location: "uaenorth",
          provisioningState: "Succeeded",
          tags: [{ label: "Environment", value: "prod" }],
        },
        {
          name: "rg-marketing-dev",
          location: "uaenorth",
          provisioningState: "Succeeded",
          tags: [{ label: "Environment", value: "dev" }],
        },
      ],
      azureVirtualMachines: [
        {
          vmId: "/subscriptions/sub-001/resourceGroups/rg-marketing-prod/providers/Microsoft.Compute/virtualMachines/mkt-api-01",
          name: "mkt-api-01",
          resourceGroup: "rg-marketing-prod",
          location: "uaenorth",
          powerState: "VM running",
          provisioningState: "Succeeded",
          size: "Standard_D2s_v5",
          osType: "Linux",
          privateIp: "10.10.2.14",
          publicIp: "20.74.10.10",
          tags: [{ label: "Tier", value: "api" }],
        },
      ],
      azureStorageAccounts: [
        {
          name: "devstoreaccount1",
          kind: "StorageV2",
          location: "local",
          blobEndpoint: "http://localhost:4577/devstoreaccount1",
        },
      ],
      azureBlobContainers: [{ name: "uploads" }],
      azureBlobs: [{ name: "readme.txt", size: "128 B" }],
      azureBlobMetadata: [],
      azureWebApps: [],
      azureAppServicePlans: [],
      azureWebAppSettings: [],
      azureWebAppDeploymentSlots: [],
      azureLogAnalyticsWorkspaces: [],
      azureWafPolicies: [],
      azureWafRuleFireCounts: [],
      azureFunctionApps: [],
      azureFunctions: [],
      azureKeyVaults: [],
      azureKeyVaultSecrets: [],
      azureCosmosAccounts: [],
      azurePostgresServers: [],
      azureCosmosDatabases: [],
      azureCosmosContainers: [],
      azureCosmosItems: [],
      azureFrontDoorProfiles: [],
      azureFrontDoorEndpoints: [],
      azureFrontDoorOriginGroups: [],
      azureFrontDoorOrigins: [],
      azureStorageQueues: [],
      azureQueueMessages: [],
      azureEntraUsers: [],
      azureEntraGroups: [],
      azureEntraApps: [],
      selectedS3BucketName: undefined,
      selectedS3ObjectKey: undefined,
      s3PrefixFilter: undefined,
      s3StatusMessage: undefined,
      s3Buckets: [],
      s3Objects: [],
      s3ObjectMetadata: [],
      s3ExportSnippets: [],
      selectedEc2Region: undefined,
      selectedEc2InstanceId: undefined,
      ec2StatusMessage: undefined,
      ec2Regions: [],
      ec2Instances: [],
      environmentDiagnostics: [{ label: "Azure Profile", value: "~/.azure/azureProfile.json" }],
    };

    render(
      <AppProviders>
        <App />
      </AppProviders>,
    );

    expect(await screen.findByText("Resource groups")).toBeInTheDocument();
    expect(screen.getByText("Virtual machines")).toBeInTheDocument();
    const azureNav = within(document.querySelector('[data-slot="context-nav"]') as HTMLElement);
    expect(azureNav.getByRole("button", { name: /Azure/ })).toBeInTheDocument();
    expect(screen.queryByText("S3")).not.toBeInTheDocument();
    expect(screen.queryByText("EC2")).not.toBeInTheDocument();

    fireEvent.click(azureNav.getByRole("button", { name: /Azure/ }));

    expect(await screen.findByRole("heading", { name: "Azure Workspace" })).toBeInTheDocument();
    expect((await screen.findAllByText("Marketing Subscription")).length).toBeGreaterThan(0);
    expect((await screen.findAllByText("tenant-marketing")).length).toBeGreaterThan(0);
    expect(screen.getByText("Resource Groups, VMs")).toBeInTheDocument();

    fireEvent.click(azureNav.getByRole("button", { name: /Resource Groups/ }));
    expect(await screen.findByRole("heading", { name: "Azure Resource Groups" })).toBeInTheDocument();
    expect((await screen.findAllByText("rg-marketing-prod")).length).toBeGreaterThan(0);

    fireEvent.click(azureNav.getByRole("button", { name: /Virtual Machines/ }));
    expect(await screen.findByRole("heading", { name: "Azure Virtual Machines" })).toBeInTheDocument();
    expect((await screen.findAllByText("mkt-api-01")).length).toBeGreaterThan(0);
    expect((await screen.findAllByText("Standard_D2s_v5")).length).toBeGreaterThan(0);
  });

  it("loads AWS scoped inventory when activating a deferred service tab", async () => {
    sessionFixture = {
      ...sessionFixture,
      isLocked: true,
      lockedProviderId: "aws",
      lockedProfileId: "sandbox",
      lockedAuthMethod: "cli",
      workspaceTabs: [
        {
          tabId: "overview",
          label: "Overview",
          summary: "Summary",
          detail: "Overview panel",
        },
        {
          tabId: "s3",
          label: "S3",
          summary: "S3 summary",
          detail: "S3 panel",
        },
        {
          tabId: "lambda",
          label: "Lambda",
          summary: "Lambda summary",
          detail: "Lambda panel",
        },
      ],
    };
    workspaceFixture = {
      ...workspaceFixture,
      provider: providerFixtures[0],
      profile: profileFixtures[0],
      authMethod: "cli",
      s3Buckets: [{ name: "cloudsprocket-artifacts" }],
      s3StatusMessage: "Loaded 1 bucket(s). Select cloudsprocket-artifacts to browse objects.",
      ec2Regions: ["us-east-1"],
      ec2Instances: [],
      ec2StatusMessage: "Loaded 1 region(s). Select us-east-1 to browse instances.",
      selectedLambdaRegion: undefined,
      selectedLambdaFunctionName: undefined,
      lambdaRegions: [],
      lambdaFunctions: [],
      lambdaStatusMessage: undefined,
    };

    render(
      <AppProviders>
        <App />
      </AppProviders>,
    );

    expect(await screen.findByText("S3 buckets")).toBeInTheDocument();
    const awsNav = within(document.querySelector('[data-slot="context-nav"]') as HTMLElement);
    await act(async () => {
      fireEvent.click(awsNav.getByRole("button", { name: /Lambda/ }));
    });
    expect(await screen.findByRole("heading", { name: "Lambda" })).toBeInTheDocument();

    await waitFor(() => {
      const inventoryCalls = vi
        .mocked(backendRequest)
        .mock.calls.filter(([method]) => method === "aws.inventory.get");
      expect(inventoryCalls.length).toBeGreaterThan(0);
      expect(inventoryCalls.at(-1)?.[1]).toEqual({ scope: "lambda" });
    });
    expect((await screen.findAllByText("process-order")).length).toBeGreaterThan(0);

    await act(async () => {
      fireEvent.click(awsNav.getByRole("button", { name: /^S3/ }));
    });
    expect((await screen.findAllByText("cloudsprocket-artifacts")).length).toBeGreaterThan(0);
  }, 15000);

  it("reloads Azure scoped inventory after Refresh Discovery completes", async () => {
    sessionFixture = {
      ...sessionFixture,
      currentProviderId: "azure",
      selectedProfileId: "sub-001",
      selectedAuthMethod: "cli",
      isLocked: true,
      lockedProviderId: "azure",
      lockedProfileId: "sub-001",
      lockedAuthMethod: "cli",
      workspaceTabs: [
        {
          tabId: "overview",
          label: "Overview",
          summary: "Summary",
          detail: "Overview panel",
        },
        {
          tabId: "azure-overview",
          label: "Azure",
          summary: "Azure summary",
          detail: "Azure panel",
        },
        {
          tabId: "azure-resource-groups",
          label: "Resource Groups",
          summary: "Azure groups",
          detail: "Resource groups panel",
        },
        {
          tabId: "azure-storage",
          label: "Storage",
          summary: "Azure storage",
          detail: "Storage panel",
        },
        {
          tabId: "actions",
          label: "Activity",
          summary: "Activity summary",
          detail: "Activity panel",
        },
      ],
    };
    workspaceFixture = {
      ...workspaceFixture,
      provider: providerFixtures[1],
      profile: profileFixtures[1],
      authMethod: "cli",
      azureEndpointUrl: "http://localhost:4577",
      azureResourceGroups: [
        {
          name: "rg-marketing-prod",
          location: "uaenorth",
          provisioningState: "Succeeded",
          tags: [{ label: "Environment", value: "prod" }],
        },
      ],
      azureStorageAccounts: [
        {
          name: "devstoreaccount1",
          kind: "StorageV2",
          location: "local",
          blobEndpoint: "http://localhost:4577/devstoreaccount1",
        },
      ],
      azureStorageStatusMessage: "Loaded 1 storage account.",
    };

    render(
      <AppProviders>
        <App />
      </AppProviders>,
    );

    expect(await screen.findByText("Resource groups")).toBeInTheDocument();
    const azureNav = within(document.querySelector('[data-slot="context-nav"]') as HTMLElement);
    await act(async () => {
      fireEvent.click(azureNav.getByRole("button", { name: /Storage/ }));
    });
    expect(await screen.findByRole("heading", { name: "Azure Storage" })).toBeInTheDocument();

    const inventoryCallsBefore = vi
      .mocked(backendRequest)
      .mock.calls.filter(([method]) => method === "azure.inventory.get").length;

    fireEvent.click(await screen.findByRole("button", { name: "Activity" }));
    fireEvent.click(await screen.findByRole("button", { name: "Refresh Discovery" }));

    await act(async () => {
      backendEventHandlers["job.updated"]?.({
        jobId: "job-1",
        label: "Refresh Discovery",
        status: "completed",
        message: "Refresh completed.",
        result: {
          ...workspaceFixture,
          azureStorageAccounts: [],
          azureBlobContainers: [],
          azureBlobs: [],
          azureStorageStatusMessage: undefined,
        },
      });
    });

    await act(async () => {
      fireEvent.click(azureNav.getByRole("button", { name: /Storage/ }));
    });

    await waitFor(() => {
      const inventoryCalls = vi
        .mocked(backendRequest)
        .mock.calls.filter(([method]) => method === "azure.inventory.get");
      expect(inventoryCalls.length).toBeGreaterThan(inventoryCallsBefore);
      expect(inventoryCalls.at(-1)?.[1]).toEqual({ scope: "storage" });
    });
  }, 15000);
});
