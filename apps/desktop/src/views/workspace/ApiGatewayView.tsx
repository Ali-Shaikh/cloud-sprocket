// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { useMemo, useState } from "react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
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

  const regions =
    workspace.apiGatewayRegions.length > 0
      ? workspace.apiGatewayRegions
      : workspace.ecsRegions.length > 0
        ? workspace.ecsRegions
        : workspace.rdsRegions.length > 0
          ? workspace.rdsRegions
          : workspace.ec2Regions;

  const selectedApi =
    workspace.apiGatewayApis.find((api) => api.apiKey === workspace.selectedApiGatewayApiKey) ??
    workspace.apiGatewayApis[0];

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
          <h2 className="text-base font-bold">API Inventory</h2>
          <p className="text-sm text-muted-foreground">
            REST and HTTP/WebSocket APIs with stage invoke URLs for the selected region.
          </p>
        </div>
        <p className="text-sm text-muted-foreground">{statusMessage}</p>

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
        </div>

        <div className="overflow-hidden rounded-lg border border-border">
          {workspace.apiGatewayApis.length === 0 ? (
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>API ID</TableHead>
                  <TableHead>Endpoint</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredApis.map((api) => (
                  <TableRow
                    key={api.apiKey}
                    className={cn(
                      "cursor-pointer",
                      api.apiKey === workspace.selectedApiGatewayApiKey && "bg-muted/50",
                    )}
                    onClick={() => {
                      onSelectApi(api.apiKey);
                    }}
                  >
                    <TableCell className="font-medium">{api.apiName || api.apiId}</TableCell>
                    <TableCell>{api.apiType}</TableCell>
                    <TableCell className="font-mono text-xs">{api.apiId}</TableCell>
                    <TableCell className="max-w-xs truncate text-xs">{api.endpoint || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </section>

      {selectedApi ? (
        <section className={sectionCard}>
          <h2 className="text-base font-bold">Stages</h2>
          <DetailFieldList
            fields={[
              { label: "API", value: selectedApi.apiName || selectedApi.apiId },
              { label: "Type", value: selectedApi.apiType },
              { label: "Endpoint", value: selectedApi.endpoint || "Unknown" },
            ]}
            emptyText="No API details are available."
          />
          <div className="overflow-hidden rounded-lg border border-border">
            {workspace.apiGatewayStages.length === 0 ? (
              <EmptyState
                icon={<Globe />}
                title="No stages"
                description={`No stages were returned for ${selectedApi.apiName || selectedApi.apiId}.`}
                className="border-0"
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Stage</TableHead>
                    <TableHead>Invoke URL</TableHead>
                    <TableHead>Deployment</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {workspace.apiGatewayStages.map((stage) => (
                    <TableRow key={`${stage.apiKey}:${stage.stageName}`}>
                      <TableCell className="font-medium">{stage.stageName}</TableCell>
                      <TableCell className="max-w-md truncate font-mono text-xs">
                        {stage.invokeUrl || "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{stage.deploymentId || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
          {workspace.apiGatewayStages.length > 0 ? (
            <div className="space-y-2">
              <div className={fieldLabel}>Copy invoke URL</div>
              {workspace.apiGatewayStages.map((stage) =>
                stage.invokeUrl ? (
                  <div key={stage.stageName} className={snippetCard}>
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
          ) : null}
        </section>
      ) : null}
    </div>
  );
}