// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { ChevronRight, Plus, RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { InlineBanner } from "@/components/inline-banner";
import { StatCard } from "@/components/stat-card";
import { StatusDot, type Status } from "@/components/status-dot";
import awsS3IconUrl from "@/assets/cloud-icons/aws-s3.svg";
import awsEc2IconUrl from "@/assets/cloud-icons/aws-ec2.svg";
import awsDynamodbIconUrl from "@/assets/cloud-icons/aws-dynamodb.svg";
import awsLambdaIconUrl from "@/assets/cloud-icons/aws-lambda.svg";
import awsSqsIconUrl from "@/assets/cloud-icons/aws-sqs.svg";
import awsSnsIconUrl from "@/assets/cloud-icons/aws-sns.svg";
import awsRdsIconUrl from "@/assets/cloud-icons/aws-rds.svg";
import awsCloudwatchIconUrl from "@/assets/cloud-icons/aws-cloudwatch.svg";
import awsIamIconUrl from "@/assets/cloud-icons/aws-iam.svg";
import azureResourceGroupsIconUrl from "@/assets/cloud-icons/azure-resource-groups.svg";
import azureVmIconUrl from "@/assets/cloud-icons/azure-vm.svg";
import { RuntimeHealthStrip } from "@/components/overview/runtime-health-strip";
import {
  buildRuntimeHealthTargets,
  shouldShowRuntimeHealthStrip,
  workspaceUsesLocalEmulator,
  type RuntimeHealthTargetId,
} from "@/lib/runtime-health";
import { HiddenResourcesHint } from "@/components/overview/hidden-resources-hint";
import type { HiddenResourceHit, SessionSnapshot, WorkspaceSnapshot } from "@/types/backend";

export type OverviewNavigateContext = {
  lambdaFunctionName?: string;
  dynamodbTableName?: string;
  sqsQueueUrl?: string;
  snsTopicArn?: string;
  rdsInstanceId?: string;
  logGroupName?: string;
  iamRoleName?: string;
  ec2InstanceId?: string;
  s3BucketName?: string;
  resourceGroup?: string;
  vmId?: string;
  accountName?: string;
  appName?: string;
  server?: string;
  vaultName?: string;
  workspaceName?: string;
  policyName?: string;
  openLambdaCreate?: boolean;
};

export type OverviewViewProps = {
  workspace: WorkspaceSnapshot;
  session: SessionSnapshot;
  providerLabel: string;
  profileLabel?: string;
  onRefresh: () => void;
  onNavigate: (tabId: string, context?: OverviewNavigateContext) => void;
  onOpenRuntime: () => void;
  onEmulatorQuickStart?: (emulatorId: "localstack" | "floci-az") => void;
  runtimeActionInFlight?: Partial<Record<RuntimeHealthTargetId, boolean>>;
  hiddenResourceHits?: HiddenResourceHit[];
  hiddenResourceEnablingServiceId?: string | null;
  onEnableHiddenService?: (hit: HiddenResourceHit) => void;
};

type StatItem = {
  label: string;
  value: number;
  footer?: React.ReactNode;
  tabId?: string;
};

type RecentItem = {
  key: string;
  name: string;
  sub: string;
  iconUrl?: string;
  status?: Status;
  statusLabel?: string;
  tabId: string;
  navigateContext?: OverviewNavigateContext;
};

function isRunning(state?: string): boolean {
  return (state ?? "").toLowerCase().includes("running");
}

function isLambdaActive(state?: string): boolean {
  return (state ?? "").toLowerCase() === "active";
}

function isDynamoDBActive(status?: string): boolean {
  return (status ?? "").toLowerCase() === "active";
}

function isRdsAvailable(status?: string): boolean {
  return (status ?? "").toLowerCase() === "available";
}

export default function OverviewView({
  workspace,
  session,
  providerLabel,
  profileLabel,
  onRefresh,
  onNavigate,
  onOpenRuntime,
  onEmulatorQuickStart,
  runtimeActionInFlight,
  hiddenResourceHits = [],
  hiddenResourceEnablingServiceId = null,
  onEnableHiddenService,
}: OverviewViewProps) {
  const runtimeTargets = buildRuntimeHealthTargets(workspace);
  const providerId = session.lockedProviderId ?? workspace.provider?.providerId ?? "";
  const isAws = providerId === "aws";
  const isAzure = providerId === "azure";

  const ec2Running = workspace.ec2Instances.filter((instance) => isRunning(instance.state)).length;
  const lambdaActive = workspace.lambdaFunctions.filter((fn) => isLambdaActive(fn.state)).length;
  const dynamodbActive = workspace.dynamodbTables.filter((table) =>
    isDynamoDBActive(table.status),
  ).length;
  const rdsAvailable = workspace.rdsInstances.filter((instance) =>
    isRdsAvailable(instance.status),
  ).length;
  const vmsRunning = workspace.azureVirtualMachines.filter((vm) => isRunning(vm.powerState)).length;
  const statusFooter = (count: number, total: number, label: string): React.ReactNode =>
    total === 0 ? (
      "None yet"
    ) : (
      <span className="flex items-center gap-1.5">
        <StatusDot status={count > 0 ? "on" : "off"} />
        {count} {label}
      </span>
    );

  const runningFooter = (count: number, total: number): React.ReactNode =>
    statusFooter(count, total, "running");

  const stats: StatItem[] = [];
  if (isAws) {
    stats.push({ label: "S3 buckets", value: workspace.s3Buckets.length, tabId: "s3" });
    stats.push({
      label: "EC2 instances",
      value: workspace.ec2Instances.length,
      footer: runningFooter(ec2Running, workspace.ec2Instances.length),
      tabId: "ec2",
    });
    stats.push({
      label: "Lambda functions",
      value: workspace.lambdaFunctions.length,
      footer: statusFooter(lambdaActive, workspace.lambdaFunctions.length, "active"),
      tabId: "lambda",
    });
    stats.push({
      label: "DynamoDB tables",
      value: workspace.dynamodbTables.length,
      footer: statusFooter(dynamodbActive, workspace.dynamodbTables.length, "active"),
      tabId: "dynamodb",
    });
    stats.push({
      label: "SQS queues",
      value: workspace.sqsQueues.length,
      tabId: "sqs",
    });
    stats.push({
      label: "SNS topics",
      value: workspace.snsTopics.length,
      tabId: "sns",
    });
    stats.push({
      label: "RDS instances",
      value: workspace.rdsInstances.length,
      footer: statusFooter(rdsAvailable, workspace.rdsInstances.length, "available"),
      tabId: "rds",
    });
    stats.push({
      label: "Log groups",
      value: workspace.logGroups.length,
      tabId: "logs",
    });
    stats.push({
      label: "IAM roles",
      value: workspace.iamRoles.length,
      tabId: "iam",
    });
  }
  if (isAzure) {
    stats.push({
      label: "Resource groups",
      value: workspace.azureResourceGroups.length,
      tabId: "azure-overview",
    });
    stats.push({
      label: "Virtual machines",
      value: workspace.azureVirtualMachines.length,
      footer: runningFooter(vmsRunning, workspace.azureVirtualMachines.length),
      tabId: "azure-vms",
    });
  }
  // Real cloud overviews should not advertise local emulators. Management stays
  // under the Local Runtime nav when the user wants it.
  if (workspaceUsesLocalEmulator(workspace)) {
    const relevantEmulators = workspace.emulatorSummaries.filter((emulator) => {
      if (isAws) return emulator.emulatorId === "localstack";
      if (isAzure) return emulator.emulatorId === "floci-az";
      return false;
    });
    const relevantRunning = relevantEmulators.filter((emulator) => emulator.status === "running").length;
    stats.push({
      label: isAzure ? "floci-az" : "LocalStack",
      value: relevantEmulators.length,
      footer: runningFooter(relevantRunning, relevantEmulators.length),
      tabId: "virtualisation",
    });
  }

  const recents: RecentItem[] = [];
  if (isAws) {
    workspace.s3Buckets.slice(0, 3).forEach((bucket) =>
      recents.push({
        key: `s3-${bucket.name}`,
        name: bucket.name,
        sub: bucket.summary || "S3 bucket",
        iconUrl: awsS3IconUrl,
        tabId: "s3",
        navigateContext: { s3BucketName: bucket.name },
      }),
    );
    workspace.ec2Instances.slice(0, 3).forEach((instance) =>
      recents.push({
        key: `ec2-${instance.instanceId}`,
        name: instance.name || instance.instanceId,
        sub:
          [instance.instanceType, instance.privateIp || instance.availabilityZone]
            .filter(Boolean)
            .join(" · ") || "EC2 instance",
        iconUrl: awsEc2IconUrl,
        status: isRunning(instance.state) ? "on" : "off",
        statusLabel: instance.state || "unknown",
        tabId: "ec2",
        navigateContext: { ec2InstanceId: instance.instanceId },
      }),
    );
    workspace.lambdaFunctions.slice(0, 3).forEach((fn) =>
      recents.push({
        key: `lambda-${fn.functionName}`,
        name: fn.functionName,
        sub: [fn.runtime, fn.memorySize ? `${fn.memorySize} MB` : undefined]
          .filter(Boolean)
          .join(" · ") || "Lambda function",
        iconUrl: awsLambdaIconUrl,
        status: isLambdaActive(fn.state) ? "on" : "off",
        statusLabel: fn.state || "unknown",
        tabId: "lambda",
        navigateContext: { lambdaFunctionName: fn.functionName },
      }),
    );
    workspace.dynamodbTables.slice(0, 3).forEach((table) =>
      recents.push({
        key: `dynamodb-${table.tableName}`,
        name: table.tableName,
        sub: [table.hashKey, table.rangeKey].filter(Boolean).join(" · ") || "DynamoDB table",
        iconUrl: awsDynamodbIconUrl,
        status: isDynamoDBActive(table.status) ? "on" : "off",
        statusLabel: table.status || "unknown",
        tabId: "dynamodb",
        navigateContext: { dynamodbTableName: table.tableName },
      }),
    );
    workspace.sqsQueues.slice(0, 3).forEach((queue) =>
      recents.push({
        key: `sqs-${queue.queueUrl}`,
        name: queue.queueName,
        sub:
          [
            queue.approximateNumberOfMessages != null
              ? `${queue.approximateNumberOfMessages} visible`
              : undefined,
            queue.approximateNumberOfMessagesNotVisible != null
              ? `${queue.approximateNumberOfMessagesNotVisible} in flight`
              : undefined,
          ]
            .filter(Boolean)
            .join(" · ") || "SQS queue",
        iconUrl: awsSqsIconUrl,
        tabId: "sqs",
        navigateContext: { sqsQueueUrl: queue.queueUrl },
      }),
    );
    workspace.snsTopics.slice(0, 3).forEach((topic) =>
      recents.push({
        key: `sns-${topic.topicArn}`,
        name: topic.topicName,
        sub:
          [
            topic.subscriptionsConfirmed != null
              ? `${topic.subscriptionsConfirmed} subscriptions`
              : undefined,
            topic.displayName,
          ]
            .filter(Boolean)
            .join(" · ") || "SNS topic",
        iconUrl: awsSnsIconUrl,
        tabId: "sns",
        navigateContext: { snsTopicArn: topic.topicArn },
      }),
    );
    workspace.rdsInstances.slice(0, 3).forEach((instance) =>
      recents.push({
        key: `rds-${instance.dbInstanceIdentifier}`,
        name: instance.dbInstanceIdentifier,
        sub:
          [instance.engine, instance.instanceClass].filter(Boolean).join(" · ") ||
          "RDS instance",
        iconUrl: awsRdsIconUrl,
        status: isRdsAvailable(instance.status) ? "on" : "off",
        statusLabel: instance.status || "unknown",
        tabId: "rds",
        navigateContext: { rdsInstanceId: instance.dbInstanceIdentifier },
      }),
    );
    workspace.logGroups.slice(0, 3).forEach((group) =>
      recents.push({
        key: `logs-${group.logGroupName}`,
        name: group.logGroupName,
        sub:
          group.retentionInDays != null
            ? `${group.retentionInDays} day retention`
            : "CloudWatch log group",
        iconUrl: awsCloudwatchIconUrl,
        tabId: "logs",
        navigateContext: { logGroupName: group.logGroupName },
      }),
    );
    workspace.iamRoles.slice(0, 3).forEach((role) =>
      recents.push({
        key: `iam-${role.roleName}`,
        name: role.roleName,
        sub:
          [
            role.attachedPolicies?.length
              ? `${role.attachedPolicies.length} policies`
              : undefined,
            role.description,
          ]
            .filter(Boolean)
            .join(" · ") || "IAM role",
        iconUrl: awsIamIconUrl,
        tabId: "iam",
        navigateContext: { iamRoleName: role.roleName },
      }),
    );
  }
  if (isAzure) {
    workspace.azureResourceGroups.slice(0, 3).forEach((group) =>
      recents.push({
        key: `rg-${group.name}`,
        name: group.name,
        sub:
          [group.location, group.provisioningState].filter(Boolean).join(" · ") ||
          "Resource group",
        iconUrl: azureResourceGroupsIconUrl,
        tabId: "azure-resource-groups",
        navigateContext: { resourceGroup: group.name },
      }),
    );
    workspace.azureVirtualMachines.slice(0, 3).forEach((vm) =>
      recents.push({
        key: `vm-${vm.vmId}`,
        name: vm.name,
        sub: [vm.size, vm.location].filter(Boolean).join(" · ") || "Virtual machine",
        iconUrl: azureVmIconUrl,
        status: isRunning(vm.powerState) ? "on" : "off",
        statusLabel: vm.powerState || "unknown",
        tabId: "azure-vms",
        navigateContext: { vmId: vm.vmId },
      }),
    );
  }

  const writesEnabled = workspace.awsWritesEnabled;
  const writeCapable = workspace.awsWriteCapable;
  const showLambdaCreateCta =
    isAws && workspace.lambdaFunctions.length === 0 && writesEnabled && Boolean(workspace.selectedLambdaRegion);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex items-start gap-4">
        <div>
          <h1 className="text-[1.375rem] font-[750] tracking-[-0.015em]">
            {providerLabel}
            {profileLabel ? (
              <span className="font-semibold text-muted-foreground"> · {profileLabel}</span>
            ) : null}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Local-first, read-only access to your workspace. No console, no context-switching.
          </p>
        </div>
        <Button variant="outline" size="sm" className="ml-auto" onClick={onRefresh}>
          <RefreshCw />
          Refresh
        </Button>
      </header>

      {writesEnabled ? (
        <InlineBanner
          tone="warning"
          icon={ShieldAlert}
          title={
            workspace.awsWriteTargetIsLocal === true
              ? `Write mode is on. Mutating actions target ${workspace.awsEndpointUrl || "the local endpoint"}.`
              : `Write mode is on. Mutating actions target the live AWS account${workspace.awsEndpointUrl ? ` (${workspace.awsEndpointUrl})` : ""}.`
          }
        />
      ) : (
        <InlineBanner
          tone="info"
          icon={ShieldCheck}
          title={
            writeCapable
              ? workspace.awsWriteTargetIsLocal
                ? "Write mode is off. Enable it from the top bar when you need mutating actions against the local endpoint."
                : "Write mode is off. Enable it from the top bar when you need mutating actions; live AWS accounts require an extra confirmation."
              : "Read-only mode keeps you safe until you open a locked workspace."
          }
        />
      )}

      {hiddenResourceHits.length > 0 && onEnableHiddenService ? (
        <HiddenResourcesHint
          hits={hiddenResourceHits}
          enablingServiceId={hiddenResourceEnablingServiceId}
          onEnableService={onEnableHiddenService}
        />
      ) : null}

      {shouldShowRuntimeHealthStrip(workspace) ? (
        <RuntimeHealthStrip
          targets={runtimeTargets}
          actionInFlight={runtimeActionInFlight}
          onOpenRuntime={onOpenRuntime}
          onQuickStart={onEmulatorQuickStart}
        />
      ) : null}

      <section className="grid grid-cols-2 gap-[14px] sm:grid-cols-4">
        {stats.map((stat) => {
          const card = (
            <StatCard
              className="h-full w-full"
              label={stat.label}
              value={stat.value}
              footer={stat.footer}
            />
          );
          if (!stat.tabId) {
            return (
              <div key={stat.label} className="flex">
                {card}
              </div>
            );
          }
          return (
            <button
              key={stat.label}
              type="button"
              onClick={() => onNavigate(stat.tabId as string)}
              className="flex rounded-lg text-left outline-none transition-transform hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {card}
            </button>
          );
        })}
      </section>

      {showLambdaCreateCta ? (
        <section className="rounded-lg border border-dashed border-border bg-card p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">No Lambda functions yet</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Deploy a starter function to your local endpoint and start testing invokes in-app.
              </p>
            </div>
            <Button
              onClick={() => {
                onNavigate("lambda", { openLambdaCreate: true });
              }}
            >
              <Plus />
              Create your first function
            </Button>
          </div>
        </section>
      ) : null}

      {recents.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold tracking-tight">Jump back in</h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
            {recents.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => onNavigate(item.tabId, item.navigateContext)}
                className="group flex items-center gap-3 rounded-lg border border-border bg-card p-4 text-left shadow-sm transition-all hover:border-border-strong hover:shadow-md"
              >
                <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted">
                  {item.iconUrl ? (
                    <img src={item.iconUrl} alt="" className="size-6 object-contain" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{item.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{item.sub}</div>
                </div>
                {item.status ? (
                  <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                    <StatusDot status={item.status} />
                    {item.statusLabel}
                  </span>
                ) : (
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                )}
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
