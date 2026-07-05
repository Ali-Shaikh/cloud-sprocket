// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, Globe, RefreshCw } from "lucide-react";

import { cn } from "@/lib/utils";
import { notify } from "@/lib/notify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/empty-state";
import {
  ResourceInspectorHeader,
  ResourceInspectorPanel,
  ResourceInventoryShell,
} from "@/components/inventory/resource-inspector";
import { ResourceTable } from "@/components/inventory/resource-table";
import { DetailFieldList } from "./detail-fields";
import type { AwsApiGatewayApi, AwsApiGatewayStage, WorkspaceSnapshot } from "@/types/backend";

export type ApiGatewayWorkspaceSnapshot = WorkspaceSnapshot & {
  selectedApiGatewayRegion?: string;
  selectedApiGatewayApiKey?: string;
  apiGatewayStatusMessage?: string;
  apiGatewayRegions: string[];
  apiGatewayApis: AwsApiGatewayApi[];
  apiGatewayStages: AwsApiGatewayStage[];
};

export type ApiGatewayViewProps = {
  workspace: ApiGatewayWorkspaceSnapshot;
  actionStatus: string;
  onRefresh: () => void;
  onSelectRegion: (region: string) => void;
  onSelectApi: (apiKey: string) => void;
};

const fieldLabel =
  "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

const sectionCard = "space-y-4 rounded-lg border border-border bg-card p-[18px] shadow-sm";

const snippetCard = "rounded-lg border border-border bg-muted/40 p-3";

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function copyToClipboard(value: string): void {
  if (navigator.clipboard) {
    void navigator.clipboard.writeText(value).then(() => {
      notify("success", "Copied to clipboard");
    });
  }
}

export default function ApiGatewayView({
  workspace,
  actionStatus,
  onRefresh,
  onSelectRegion,
  onSelectApi,
}: ApiGatewayViewProps) {
  const [filterText, setFilterText] = useState("");
  const [inspectorOpen, setInspectorOpen] = useState(Boolean(workspace.selectedApiGatewayApiKey));
  const lastSelectedApiRef = useRef(workspace.selectedApiGatewayApiKey || "");

  const regions =
    workspace.apiGatewayRegions.length > 0
      ? workspace.apiGatewayRegions
      : workspace.ecsRegions.length > 0
        ? workspace.ecsRegions
        : workspace.rdsRegions.length > 0
          ? workspace.rdsRegions
          : workspace.ec2Regions;

  const selectedApi = workspace.apiGatewayApis.find(
    (api) => api.apiKey === workspace.selectedApiGatewayApiKey,
  );

  const selectedStages = useMemo(() => {
    if (!selectedApi) {
      return [];
    }
    return workspace.apiGatewayStages.filter((stage) => stage.apiKey === selectedApi.apiKey);
  }, [selectedApi, workspace.apiGatewayStages]);

  const filteredApis = useMemo(() => {
    const query = filterText.trim().toLowerCase();
    if (!query) {
      return workspace.apiGatewayApis;
    }
    return workspace.apiGatewayApis.filter((api) =>
      [api.apiName, api.apiType, api.apiId, api.description, api.endpoint].some((value) =>
        value?.toLowerCase().includes(query),
      ),
    );
  }, [filterText, workspace.apiGatewayApis]);

  const statusMessage =
    actionStatus ||
    workspace.apiGatewayStatusMessage ||
    "API Gateway inventory is waiting for an open AWS workspace.";

  useEffect(() => {
    const nextApiKey = workspace.selectedApiGatewayApiKey || "";
    if (nextApiKey !== lastSelectedApiRef.current) {
      lastSelectedApiRef.current = nextApiKey;
      setInspectorOpen(Boolean(nextApiKey));
    }
  }, [workspace.selectedApiGatewayApiKey]);

  if (workspace.provider?.providerId && workspace.provider.providerId !== "aws") {
    return (
      <div className="p-6">
        <EmptyState
          icon={<Globe />}
          title="API Gateway requires an AWS workspace"
          description="Open an AWS profile from Connect to list REST and HTTP APIs with stage invoke URLs."
        />
      </div>
    );
  }

  const tableEmptyState =
    workspace.apiGatewayApis.length === 0 ? (
      <EmptyState
        icon={<Globe />}
        title="No APIs"
        description={
          workspace.selectedApiGatewayRegion
            ? `No API Gateway APIs were returned for ${workspace.selectedApiGatewayRegion}.`
            : "Select a region to list APIs."
        }
        className="border-0"
      />
    ) : (
      <EmptyState
        icon={<Globe />}
        title="No matches"
        description="No API Gateway APIs match the current filter."
        className="border-0"
      />
    );

  const stagesEmptyState = (
    <EmptyState
      icon={<Globe />}
      title="No stages"
      description={
        selectedApi
          ? `No stages were returned for ${selectedApi.apiName || selectedApi.apiId}.`
          : "Select an API to list stages."
      }
      className="border-0"
    />
  );

  const inspectorContent = selectedApi ? (
    <ResourceInspectorPanel>
      <ResourceInspectorHeader
        icon={Globe}
        eyebrow="API"
        title={selectedApi.apiName || selectedApi.apiId}
        subtitle={selectedApi.apiId}
        onClose={() => setInspectorOpen(false)}
      />

      <DetailFieldList
        fields={[
          { label: "API", value: selectedApi.apiName || selectedApi.apiId },
          { label: "Type", value: selectedApi.apiType || "Unknown" },
          { label: "Endpoint", value: selectedApi.endpoint || "Unknown" },
        ]}
        emptyText="No API details are available."
      />

      <div>
        <div className={fieldLabel}>Stages</div>
        <div className="mt-2">
          <ResourceTable
            columns={[
              { id: "stage", label: "Stage" },
              { id: "invokeUrl", label: "Invoke URL", cellClassName: "max-w-md truncate font-mono text-xs" },
              { id: "deployment", label: "Deployment", cellClassName: "font-mono text-xs" },
            ]}
            rows={selectedStages}
            getRowKey={(stage) => `${stage.apiKey}:${stage.stageName}`}
            renderCell={(stage, columnId) => {
              if (columnId === "stage") {
                return <span className="font-medium">{stage.stageName}</span>;
              }
              if (columnId === "invokeUrl") {
                return stage.invokeUrl || "—";
              }
              if (columnId === "deployment") {
                return stage.deploymentId || "—";
              }
              return null;
            }}
            emptyState={stagesEmptyState}
          />
        </div>
      </div>

      {selectedStages.some((stage) => stage.invokeUrl) ? (
        <div>
          <div className={fieldLabel}>Copy invoke URL</div>
          <div className="mt-2 space-y-2">
            {selectedStages.map((stage) =>
              stage.invokeUrl ? (
                <div key={`${stage.apiKey}:${stage.stageName}`} className={snippetCard}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {stage.stageName}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Copy ${stage.stageName} invoke URL`}
                      onClick={() => {
                        copyToClipboard(stage.invokeUrl ?? "");
                      }}
                    >
                      <Copy />
                    </Button>
                  </div>
                  <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all text-xs">
                    {stage.invokeUrl}
                  </pre>
                </div>
              ) : null,
            )}
          </div>
        </div>
      ) : null}
    </ResourceInspectorPanel>
  ) : null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-[1.375rem] font-[750] tracking-[-0.015em]">API Gateway</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {countLabel(workspace.apiGatewayApis.length, "API", "APIs")} ·{" "}
          {workspace.selectedApiGatewayRegion || "no region selected"}
        </p>
      </header>

      <section className={sectionCard}>
        <div>
          <h2 className="text-base font-bold">API Fleet</h2>
          <p className="text-sm text-muted-foreground">
            REST and HTTP/WebSocket APIs with stage invoke URLs for the selected region.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
            <div className={fieldLabel}>Selected Region</div>
            <p className="truncate text-sm">
              {workspace.selectedApiGatewayRegion || "No region selected"}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
            <div className={fieldLabel}>Selected API</div>
            <p className="truncate text-sm">
              {selectedApi?.apiName || selectedApi?.apiId || "No API selected"}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
            <div className={fieldLabel}>APIs</div>
            <p className="truncate text-sm">
              {countLabel(workspace.apiGatewayApis.length, "API", "APIs")}
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
          <h2 className="text-base font-bold">API Inventory</h2>
          <p className="text-sm text-muted-foreground">
            Select a region, filter APIs, then choose one for stage invoke URLs.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="w-56">
            <div className={cn(fieldLabel, "mb-1")}>Region</div>
            <Select
              value={workspace.selectedApiGatewayRegion ?? ""}
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
            disabled={!workspace.selectedApiGatewayRegion}
            onClick={onRefresh}
          >
            <RefreshCw />
            Refresh APIs
          </Button>
          <div className="min-w-56 flex-1">
            <div className={cn(fieldLabel, "mb-1")}>Filter</div>
            <Input
              value={filterText}
              placeholder="Filter APIs"
              onChange={(event) => {
                setFilterText(event.target.value);
              }}
            />
          </div>
          <div className="pb-2 text-xs text-muted-foreground">
            {filteredApis.length}/{workspace.apiGatewayApis.length} shown
          </div>
        </div>

        <ResourceInventoryShell
          table={
            <ResourceTable
              columns={[
                { id: "name", label: "Name" },
                { id: "type", label: "Type" },
                { id: "apiId", label: "API ID", cellClassName: "font-mono text-xs" },
                { id: "endpoint", label: "Endpoint", cellClassName: "max-w-xs truncate text-xs" },
              ]}
              rows={filteredApis}
              selectedKey={workspace.selectedApiGatewayApiKey}
              getRowKey={(api) => api.apiKey}
              onRowClick={(api) => {
                onSelectApi(api.apiKey);
                setInspectorOpen(true);
              }}
              renderCell={(api, columnId) => {
                if (columnId === "name") {
                  return <span className="font-medium">{api.apiName || api.apiId}</span>;
                }
                if (columnId === "type") {
                  return api.apiType || "Unknown";
                }
                if (columnId === "apiId") {
                  return api.apiId;
                }
                if (columnId === "endpoint") {
                  return api.endpoint || "—";
                }
                return null;
              }}
              emptyState={tableEmptyState}
            />
          }
          inspectorContent={inspectorContent}
          inspectorOpen={inspectorOpen}
          onInspectorOpenChange={setInspectorOpen}
          inspectorAriaLabel="API Gateway details"
        />
      </section>
    </div>
  );
}