// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, Copy, RefreshCw } from "lucide-react";

import { cn } from "@/lib/utils";
import { notify } from "@/lib/notify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EmptyState } from "@/components/empty-state";
import {
  ResourceInspectorHeader,
  ResourceInspectorPanel,
  ResourceInventoryShell,
} from "@/components/inventory/resource-inspector";
import { ResourceTable } from "@/components/inventory/resource-table";
import { actionCapabilityState, actionDisabledReason } from "@/lib/action-capabilities";
import { DetailFieldList } from "./detail-fields";
import type { WorkspaceSnapshot } from "@/types/backend";

export interface AwsSnsSubscription {
  subscriptionArn: string;
  protocol?: string;
  endpoint?: string;
  owner?: string;
}

export interface AwsSnsTopic {
  topicArn: string;
  topicName: string;
  displayName?: string;
  owner?: string;
  subscriptionsConfirmed?: string;
  subscriptionsPending?: string;
  subscriptions?: AwsSnsSubscription[];
}

export type SnsWorkspaceSnapshot = WorkspaceSnapshot & {
  selectedSnsRegion?: string;
  selectedSnsTopicArn?: string;
  snsStatusMessage?: string;
  snsRegions: string[];
  snsTopics: AwsSnsTopic[];
};

export type SNSViewProps = {
  workspace: SnsWorkspaceSnapshot;
  actionStatus: string;
  onRefresh: () => void;
  onSelectRegion: (region: string) => void;
  onSelectEntity: (topicArn: string) => void;
  onPublish: (topicArn: string, message: string) => void;
  onCreateTopic: (topicName: string) => void;
  onCreateSubscription: (topicArn: string, protocol: string, endpoint: string) => void;
};

const SNS_SUBSCRIBE_PROTOCOLS = [
  "sqs",
  "email",
  "email-json",
  "http",
  "https",
  "lambda",
  "sms",
] as const;

const fieldLabel =
  "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

const sectionCard = "space-y-4 rounded-lg border border-border bg-card p-[18px] shadow-sm";

const snippetCard = "rounded-lg border border-border bg-muted/40 p-3";

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function copyToClipboard(value: string, label = "Copied to clipboard"): void {
  if (navigator.clipboard) {
    void navigator.clipboard.writeText(value).then(() => {
      notify("success", label);
    });
  }
}

/**
 * v0.6 SNS panel: regional topic inventory, subscription detail, read-only.
 */
export default function SNSView({
  workspace,
  actionStatus,
  onRefresh,
  onSelectRegion,
  onSelectEntity,
  onPublish,
  onCreateTopic,
  onCreateSubscription,
}: SNSViewProps) {
  const [filterText, setFilterText] = useState("");
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [publishBody, setPublishBody] = useState('{"event":"test"}');
  const [newTopicName, setNewTopicName] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [subscribeDialogOpen, setSubscribeDialogOpen] = useState(false);
  const [subscribeProtocol, setSubscribeProtocol] = useState<string>("sqs");
  const [subscribeEndpoint, setSubscribeEndpoint] = useState("");
  const [inspectorOpen, setInspectorOpen] = useState(Boolean(workspace.selectedSnsTopicArn));
  const lastSelectedTopicRef = useRef(workspace.selectedSnsTopicArn || "");

  const regions =
    workspace.snsRegions.length > 0
      ? workspace.snsRegions
      : workspace.dynamodbRegions.length > 0
        ? workspace.dynamodbRegions
        : workspace.lambdaRegions.length > 0
          ? workspace.lambdaRegions
          : workspace.ec2Regions;

  const selectedTopic = workspace.snsTopics.find(
    (topic) => topic.topicArn === workspace.selectedSnsTopicArn,
  );

  const filteredTopics = useMemo(() => {
    const query = filterText.trim().toLowerCase();
    if (!query) {
      return workspace.snsTopics;
    }
    return workspace.snsTopics.filter((topic) =>
      [topic.topicName, topic.topicArn, topic.displayName]
        .some((value) => value?.toLowerCase().includes(query)),
    );
  }, [filterText, workspace.snsTopics]);

  const publishCapability = actionCapabilityState(workspace, "sns", "publish");
  const createTopicCapability = actionCapabilityState(workspace, "sns", "createTopic");
  const createSubscriptionCapability = actionCapabilityState(
    workspace,
    "sns",
    "createSubscription",
  );
  const canPublish = publishCapability.enabled && Boolean(selectedTopic?.topicArn);
  const canCreateTopic = createTopicCapability.enabled && Boolean(workspace.selectedSnsRegion);
  const canCreateSubscription =
    createSubscriptionCapability.enabled && Boolean(selectedTopic?.topicArn);
  const publishDisabledReason = canPublish
    ? undefined
    : actionDisabledReason(
        workspace,
        "sns",
        "publish",
        !selectedTopic?.topicArn ? "Select a topic first." : undefined,
      );
  const createTopicDisabledReason = canCreateTopic
    ? undefined
    : actionDisabledReason(
        workspace,
        "sns",
        "createTopic",
        !workspace.selectedSnsRegion ? "Select a region first." : undefined,
      );
  const createSubscriptionDisabledReason = canCreateSubscription
    ? undefined
    : actionDisabledReason(
        workspace,
        "sns",
        "createSubscription",
        !selectedTopic?.topicArn ? "Select a topic first." : undefined,
      );

  const statusMessage =
    actionStatus ||
    workspace.snsStatusMessage ||
    "SNS inventory is waiting for an open AWS workspace.";

  const copySnippets = selectedTopic
    ? [
        { label: "Topic name", value: selectedTopic.topicName },
        { label: "Topic ARN", value: selectedTopic.topicArn },
        {
          label: "AWS CLI list subscriptions command",
          value: `aws sns list-subscriptions-by-topic --topic-arn ${selectedTopic.topicArn}${
            workspace.selectedSnsRegion ? ` --region ${workspace.selectedSnsRegion}` : ""
          }`,
        },
        {
          label: "Topic detail JSON",
          value: JSON.stringify(
            {
              region: workspace.selectedSnsRegion,
              topic: selectedTopic,
            },
            null,
            2,
          ),
        },
      ]
    : [];

  useEffect(() => {
    const nextTopicArn = workspace.selectedSnsTopicArn || "";
    if (nextTopicArn !== lastSelectedTopicRef.current) {
      lastSelectedTopicRef.current = nextTopicArn;
      setInspectorOpen(Boolean(nextTopicArn));
    }
  }, [workspace.selectedSnsTopicArn]);

  if (workspace.provider?.providerId && workspace.provider.providerId !== "aws") {
    return (
      <div className="p-6">
        <EmptyState
          icon={<Bell />}
          title="SNS requires an AWS workspace"
          description="Open an AWS profile from Connect to list topics and subscriptions (works on LocalStack and real AWS)."
        />
      </div>
    );
  }

  const tableEmptyState =
    workspace.snsTopics.length === 0 ? (
      <EmptyState
        icon={<Bell />}
        title="No topics"
        description={
          workspace.selectedSnsRegion
            ? `No SNS topics were returned for ${workspace.selectedSnsRegion}.`
            : "Select a region to list SNS topics."
        }
        className="border-0"
      />
    ) : (
      <EmptyState
        icon={<Bell />}
        title="No matches"
        description="No SNS topics match the current filter."
        className="border-0"
      />
    );

  const inspectorContent = selectedTopic ? (
    <ResourceInspectorPanel>
      <ResourceInspectorHeader
        icon={Bell}
        eyebrow="Topic"
        title={selectedTopic.topicName}
        subtitle={selectedTopic.topicArn}
        onClose={() => setInspectorOpen(false)}
      />

      <DetailFieldList
        fields={[
          { label: "Display name", value: selectedTopic.displayName || "None" },
          { label: "Owner", value: selectedTopic.owner || "Unknown" },
          {
            label: "Confirmed subscriptions",
            value: selectedTopic.subscriptionsConfirmed ?? "Unknown",
          },
          {
            label: "Pending subscriptions",
            value: selectedTopic.subscriptionsPending ?? "Unknown",
          },
          { label: "Topic ARN", value: selectedTopic.topicArn },
        ]}
        emptyText="No topic details are available."
      />

      {selectedTopic.subscriptions && selectedTopic.subscriptions.length > 0 ? (
        <div>
          <div className={fieldLabel}>Subscriptions</div>
          <div className="space-y-2">
            {selectedTopic.subscriptions.map((subscription) => (
              <div key={subscription.subscriptionArn} className={snippetCard}>
                <div className="text-sm font-semibold">
                  {subscription.protocol || "Unknown protocol"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {subscription.endpoint || "No endpoint"}
                  {subscription.owner ? ` · ${subscription.owner}` : ""}
                </div>
                <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                  {subscription.subscriptionArn}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No subscriptions were returned for this topic.</p>
      )}

      <div>
        <div className={fieldLabel}>Write actions</div>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={!canPublish}
            title={publishDisabledReason}
            onClick={() => {
              setPublishDialogOpen(true);
            }}
          >
            Publish message
          </Button>
          <Button
            variant="outline"
            disabled={!canCreateSubscription}
            title={createSubscriptionDisabledReason}
            onClick={() => {
              setSubscribeDialogOpen(true);
            }}
          >
            Create subscription
          </Button>
        </div>
        {publishDisabledReason || createSubscriptionDisabledReason ? (
          <p className="mt-2 text-xs text-muted-foreground">
            {publishDisabledReason || createSubscriptionDisabledReason}
          </p>
        ) : null}
      </div>

      <div>
        <div className={fieldLabel}>Copy actions</div>
        {copySnippets.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Select a topic to generate copy actions.
          </p>
        ) : (
          <div className="mt-2 space-y-3">
            {copySnippets.map((snippet) => (
              <div key={snippet.label} className={snippetCard}>
                <div className="flex items-center justify-between gap-2">
                  <span className={fieldLabel}>{snippet.label}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      copyToClipboard(snippet.value, `${snippet.label} copied`);
                    }}
                  >
                    <Copy />
                    Copy
                  </Button>
                </div>
                <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-xs">
                  {snippet.value}
                </pre>
              </div>
            ))}
          </div>
        )}
      </div>
    </ResourceInspectorPanel>
  ) : null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-[1.375rem] font-[750] tracking-[-0.015em]">SNS</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {countLabel(workspace.snsTopics.length, "topic", "topics")} ·{" "}
          {workspace.selectedSnsRegion || "no region selected"}
        </p>
      </header>

      <section className={sectionCard}>
        <div>
          <h2 className="text-base font-bold">Topic Fleet</h2>
          <p className="text-sm text-muted-foreground">
            Regional topic inventory with subscription counts and read-only detail.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
            <div className={fieldLabel}>Selected Region</div>
            <p className="truncate text-sm">
              {workspace.selectedSnsRegion || "No region selected"}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
            <div className={fieldLabel}>Selected Topic</div>
            <p className="truncate text-sm font-mono">
              {selectedTopic?.topicName || "No topic selected"}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
            <div className={fieldLabel}>Topics</div>
            <p className="truncate text-sm">
              {countLabel(workspace.snsTopics.length, "topic", "topics")}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
            <div className={fieldLabel}>Endpoint</div>
            <p className="truncate text-sm">
              {workspace.awsEndpointUrl || "Default AWS endpoint"}
            </p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{statusMessage}</p>
      </section>

      <section className={sectionCard}>
        <div>
          <h2 className="text-base font-bold">Topic Inventory</h2>
          <p className="text-sm text-muted-foreground">
            Select a region, filter topics, then choose one for subscription detail.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="w-56">
            <div className={cn(fieldLabel, "mb-1")}>Region</div>
            <Select
              value={workspace.selectedSnsRegion ?? ""}
              onValueChange={(value) => {
                if (value) {
                  onSelectRegion(value);
                }
              }}
            >
              <SelectTrigger aria-label="Select region">
                <SelectValue placeholder="Select region" />
              </SelectTrigger>
              <SelectContent>
                {regions.map((region) => (
                  <SelectItem key={region} value={region}>
                    {region}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="outline"
            disabled={!workspace.selectedSnsRegion}
            onClick={onRefresh}
          >
            <RefreshCw />
            Refresh topics
          </Button>
          <Button
            variant="outline"
            disabled={!canCreateTopic}
            title={createTopicDisabledReason}
            onClick={() => {
              setCreateDialogOpen(true);
            }}
          >
            Create topic
          </Button>
          <div className="min-w-56 flex-1">
            <div className={cn(fieldLabel, "mb-1")}>Filter</div>
            <Input
              value={filterText}
              placeholder="Filter topics"
              onChange={(event) => {
                setFilterText(event.target.value);
              }}
            />
          </div>
          <div className="pb-2 text-xs text-muted-foreground">
            {filteredTopics.length}/{workspace.snsTopics.length} shown
          </div>
        </div>

        <ResourceInventoryShell
          table={
            <ResourceTable
              columns={[
                { id: "name", label: "Name" },
                { id: "confirmed", label: "Confirmed" },
                { id: "pending", label: "Pending" },
              ]}
              rows={filteredTopics}
              selectedKey={workspace.selectedSnsTopicArn}
              getRowKey={(topic) => topic.topicArn}
              onRowClick={(topic) => {
                onSelectEntity(topic.topicArn);
                setInspectorOpen(true);
              }}
              renderCell={(topic, columnId) => {
                if (columnId === "name") {
                  return <span className="font-mono text-sm">{topic.topicName}</span>;
                }
                if (columnId === "confirmed") {
                  return topic.subscriptionsConfirmed ?? "Unknown";
                }
                if (columnId === "pending") {
                  return topic.subscriptionsPending ?? "Unknown";
                }
                return null;
              }}
              emptyState={tableEmptyState}
            />
          }
          inspectorContent={inspectorContent}
          inspectorOpen={inspectorOpen}
          onInspectorOpenChange={setInspectorOpen}
          inspectorAriaLabel="SNS topic details"
        />
      </section>

      <AlertDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Create SNS topic?</AlertDialogTitle>
            <AlertDialogDescription>
              Creates a new topic in {workspace.selectedSnsRegion || "the selected region"} on your
              local endpoint.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={newTopicName}
            placeholder="topic-name"
            onChange={(event) => {
              setNewTopicName(event.target.value);
            }}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const name = newTopicName.trim();
                if (name) {
                  onCreateTopic(name);
                  setNewTopicName("");
                }
                setCreateDialogOpen(false);
              }}
            >
              Create topic
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={publishDialogOpen} onOpenChange={setPublishDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Publish message?</AlertDialogTitle>
            <AlertDialogDescription>
              Publishes to <span className="font-mono">{selectedTopic?.topicName}</span>. All
              subscribers will receive the message.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            value={publishBody}
            rows={5}
            className="font-mono text-xs"
            onChange={(event) => {
              setPublishBody(event.target.value);
            }}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (selectedTopic?.topicArn && publishBody.trim()) {
                  onPublish(selectedTopic.topicArn, publishBody);
                }
                setPublishDialogOpen(false);
              }}
            >
              Publish
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={subscribeDialogOpen} onOpenChange={setSubscribeDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Create SNS subscription?</AlertDialogTitle>
            <AlertDialogDescription>
              Subscribes an endpoint to{" "}
              <span className="font-mono">{selectedTopic?.topicName}</span>. Some protocols need
              confirmation before they become active.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <div>
              <div className={cn(fieldLabel, "mb-1")}>Protocol</div>
              <Select value={subscribeProtocol} onValueChange={(value) => value && setSubscribeProtocol(value)}>
                <SelectTrigger aria-label="Select subscription protocol">
                  <SelectValue placeholder="Select protocol" />
                </SelectTrigger>
                <SelectContent>
                  {SNS_SUBSCRIBE_PROTOCOLS.map((protocol) => (
                    <SelectItem key={protocol} value={protocol}>
                      {protocol}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <div className={cn(fieldLabel, "mb-1")}>Endpoint</div>
              <Input
                value={subscribeEndpoint}
                placeholder="Queue ARN, email, HTTPS URL, or Lambda ARN"
                onChange={(event) => {
                  setSubscribeEndpoint(event.target.value);
                }}
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const endpoint = subscribeEndpoint.trim();
                if (selectedTopic?.topicArn && endpoint) {
                  onCreateSubscription(selectedTopic.topicArn, subscribeProtocol, endpoint);
                  setSubscribeEndpoint("");
                }
                setSubscribeDialogOpen(false);
              }}
            >
              Create subscription
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}