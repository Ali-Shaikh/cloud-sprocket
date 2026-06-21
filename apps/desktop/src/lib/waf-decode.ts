import type { AzureWafLogColumnMap } from "@/types/backend";
import { formatCellValue, rowToRecord } from "@/components/log-analytics/log-query-utils";

export type WafMatchRow = {
  matchVariableName: string;
  matchVariableValue: string;
};

export type DecodedWafRow = {
  timeGenerated?: string;
  host?: string;
  requestUri?: string;
  clientIP?: string;
  policyMode?: string;
  ruleName?: string;
  policyName?: string;
  action?: string;
  trackingReference?: string;
  detailsMessage?: string;
  matches: WafMatchRow[];
};

function parseMatchesPayload(raw: string): WafMatchRow[] {
  const trimmed = raw.trim();
  if (!trimmed) {
    return [];
  }
  try {
    const parsed = JSON.parse(trimmed) as {
      matches?: Array<{ matchVariableName?: string; matchVariableValue?: string }>;
    };
    if (Array.isArray(parsed.matches)) {
      return parsed.matches
        .map((match) => ({
          matchVariableName: match.matchVariableName ?? "",
          matchVariableValue: match.matchVariableValue ?? "",
        }))
        .filter((match) => match.matchVariableName || match.matchVariableValue);
    }
    if (Array.isArray(parsed)) {
      return parsed
        .map((match) => ({
          matchVariableName: String((match as { matchVariableName?: string }).matchVariableName ?? ""),
          matchVariableValue: String((match as { matchVariableValue?: string }).matchVariableValue ?? ""),
        }))
        .filter((match) => match.matchVariableName || match.matchVariableValue);
    }
  } catch {
    return [];
  }
  return [];
}

export function decodeWafRow(
  columns: string[],
  row: string[],
  columnMap: AzureWafLogColumnMap,
): DecodedWafRow {
  const record = rowToRecord(columns, row);
  const matchesColumn = columnMap.detailsMatches;
  const rawMatches = record[matchesColumn] ?? "";
  const formatted = formatCellValue(rawMatches);
  const matches =
    formatted.kind === "json" ? parseMatchesPayload(formatted.display) : parseMatchesPayload(rawMatches);

  return {
    timeGenerated: record[columnMap.timeGenerated],
    host: record[columnMap.host],
    requestUri: record[columnMap.requestUri],
    clientIP: record[columnMap.clientIP],
    policyMode: record[columnMap.policyMode],
    ruleName: record[columnMap.ruleName],
    policyName: record[columnMap.policyName],
    action: record[columnMap.action],
    trackingReference: record[columnMap.trackingReference],
    detailsMessage: record[columnMap.detailsMessage],
    matches,
  };
}

export function isTuningCandidate(action?: string): boolean {
  const normalised = (action ?? "").toLowerCase();
  return normalised === "log" || normalised === "anomalyscoring" || normalised === "logandscore";
}