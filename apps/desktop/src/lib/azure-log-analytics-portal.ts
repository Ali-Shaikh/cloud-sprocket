// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import type { AzureLogAnalyticsWorkspace } from "@/types/backend";

/** Build an Azure Portal Logs blade link for a workspace KQL query. */
export function buildAzureLogAnalyticsPortalUrl(
  subscriptionId: string | undefined,
  workspace: AzureLogAnalyticsWorkspace | undefined,
  query: string,
  timespan: string,
): string | null {
  const sub = subscriptionId?.trim();
  const name = workspace?.name?.trim();
  const resourceGroup = workspace?.resourceGroup?.trim();
  if (!sub || !name || !resourceGroup) {
    return null;
  }

  const resourceId = `/subscriptions/${sub}/resourceGroups/${resourceGroup}/providers/Microsoft.OperationalInsights/workspaces/${name}`;
  const encodedResourceId = encodeURIComponent(resourceId);
  const encodedQuery = encodeURIComponent(query.trim());
  const encodedTimespan = encodeURIComponent(timespan.trim() || "P1D");

  return `https://portal.azure.com/#blade/Microsoft_Azure_Monitoring_Logs/LogsBlade/source/LogsBlade.AnalyticsShareLinkToQuery/q/${encodedQuery}/scope/${encodedResourceId}/timespan/${encodedTimespan}`;
}