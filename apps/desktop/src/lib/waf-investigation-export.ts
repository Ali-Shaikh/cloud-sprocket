// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { downloadTextFile, resultToCsv, resultToJson } from "@/components/log-analytics/log-query-utils";
import { APP_VERSION } from "@/lib/app-version";
import type { DecodedWafRow } from "@/lib/waf-decode";
import type { AzureLogQueryResult, AzureWafLogSchemaProfile } from "@/types/backend";

export type WafInvestigationExportInput = {
  subscription?: string;
  workspace: string;
  query: string;
  timespan: string;
  timeRangeLabel?: string;
  policyName?: string;
  schemaProfile?: AzureWafLogSchemaProfile;
  result: AzureLogQueryResult;
  decodedRows?: DecodedWafRow[];
  page?: number;
  pageSize?: number;
  grouped?: boolean;
};

export type WafInvestigationBundle = {
  exportedAt: string;
  appVersion: string;
  tool: "waf-security";
  subscription?: string;
  workspace: string;
  timespan: string;
  timeRangeLabel?: string;
  policyName?: string;
  query: string;
  schemaProfile?: AzureWafLogSchemaProfile;
  grouped?: boolean;
  pagination?: {
    page: number;
    pageSize: number;
  };
  results: {
    columns: string[];
    rows: string[][];
    durationMs?: number;
    truncated?: boolean;
  };
  decodedRows?: DecodedWafRow[];
  attachments: {
    resultsJson: string;
    resultsCsv: string;
  };
  summaryMarkdown: string;
  handlingNotes: string[];
};

const HANDLING_NOTES = [
  "WAF diagnostic logs may include request payloads and match data in plaintext.",
  "Redact or restrict distribution before sharing outside your security team.",
  "Log Analytics ingestion is delayed; timestamps reflect ingest time, not live traffic.",
];

export function buildWafInvestigationBundle(input: WafInvestigationExportInput): WafInvestigationBundle {
  const { result } = input;
  const resultsJson = resultToJson(result.columns, result.rows);
  const resultsCsv = resultToCsv(result.columns, result.rows);

  const summaryLines = [
    "# WAF investigation export",
    "",
    `Exported: ${new Date().toISOString()}`,
    `App: CloudSprocket ${APP_VERSION}`,
    input.subscription ? `Subscription: ${input.subscription}` : undefined,
    `Workspace: ${input.workspace}`,
    input.timeRangeLabel ? `Time range: ${input.timeRangeLabel}` : `Timespan: ${input.timespan || "all"}`,
    input.policyName ? `Policy: ${input.policyName}` : undefined,
    input.grouped ? "View: aggregated (summarise by)" : "View: row detail",
    input.page && input.pageSize ? `Page: ${input.page} (${input.pageSize} rows per page)` : undefined,
    "",
    "## Query",
    "```kql",
    input.query.trim(),
    "```",
    "",
    `## Results (${result.rows.length} row${result.rows.length === 1 ? "" : "s"})`,
    typeof result.durationMs === "number" ? `Duration: ${result.durationMs} ms` : undefined,
    result.truncated ? "Note: results were capped at the configured row limit." : undefined,
  ].filter((line): line is string => line != null);

  if (input.schemaProfile?.detected) {
    summaryLines.push(
      "",
      "## Schema",
      `Mode: ${input.schemaProfile.mode}`,
      `Table: ${input.schemaProfile.tableName}`,
    );
  }

  if (input.decodedRows && input.decodedRows.length > 0) {
    summaryLines.push("", "## Decoded rows");
    input.decodedRows.forEach((row, index) => {
      const rowLines = [
        "",
        `### Row ${index + 1}`,
        row.trackingReference ? `- Tracking ref: ${row.trackingReference}` : undefined,
        row.action ? `- Action: ${row.action}` : undefined,
        row.ruleName ? `- Rule: ${row.ruleName}` : undefined,
        row.clientIP ? `- Client IP: ${row.clientIP}` : undefined,
        row.host ? `- Host: ${row.host}` : undefined,
        row.requestUri ? `- URI: ${row.requestUri}` : undefined,
        row.matches.length > 0
          ? `- Matches: ${row.matches.map((match) => `${match.matchVariableName}=${match.matchVariableValue}`).join("; ")}`
          : undefined,
      ].filter((line): line is string => line != null);
      summaryLines.push(...rowLines);
    });
    summaryLines.push("");
  }

  return {
    exportedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    tool: "waf-security",
    subscription: input.subscription,
    workspace: input.workspace,
    timespan: input.timespan,
    timeRangeLabel: input.timeRangeLabel,
    policyName: input.policyName,
    query: input.query,
    schemaProfile: input.schemaProfile,
    grouped: input.grouped,
    pagination:
      input.page && input.pageSize
        ? {
            page: input.page,
            pageSize: input.pageSize,
          }
        : undefined,
    results: {
      columns: result.columns,
      rows: result.rows,
      durationMs: result.durationMs,
      truncated: result.truncated,
    },
    decodedRows: input.decodedRows,
    attachments: {
      resultsJson,
      resultsCsv,
    },
    summaryMarkdown: summaryLines.filter((line): line is string => line != null).join("\n"),
    handlingNotes: HANDLING_NOTES,
  };
}

export function wafInvestigationBundleFilename(workspace: string): string {
  const safeWorkspace = workspace.replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "") || "workspace";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `waf-investigation-${safeWorkspace}-${stamp}.json`;
}

export function downloadWafInvestigationBundle(bundle: WafInvestigationBundle): void {
  downloadTextFile(
    wafInvestigationBundleFilename(bundle.workspace),
    JSON.stringify(bundle, null, 2),
    "application/json",
  );
}