// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

/**
 * Official long names for AWS region codes, from
 * https://docs.aws.amazon.com/global-infrastructure/latest/regions/aws-regions.html
 * (retrieved 2026-09-18). Unknown codes keep the id so new regions still render.
 */
export const AWS_REGION_NAMES: Readonly<Record<string, string>> = {
  "af-south-1": "Africa (Cape Town)",
  "ap-east-1": "Asia Pacific (Hong Kong)",
  "ap-east-2": "Asia Pacific (Taipei)",
  "ap-northeast-1": "Asia Pacific (Tokyo)",
  "ap-northeast-2": "Asia Pacific (Seoul)",
  "ap-northeast-3": "Asia Pacific (Osaka)",
  "ap-south-1": "Asia Pacific (Mumbai)",
  "ap-south-2": "Asia Pacific (Hyderabad)",
  "ap-southeast-1": "Asia Pacific (Singapore)",
  "ap-southeast-2": "Asia Pacific (Sydney)",
  "ap-southeast-3": "Asia Pacific (Jakarta)",
  "ap-southeast-4": "Asia Pacific (Melbourne)",
  "ap-southeast-5": "Asia Pacific (Malaysia)",
  "ap-southeast-6": "Asia Pacific (New Zealand)",
  "ap-southeast-7": "Asia Pacific (Thailand)",
  "ca-central-1": "Canada (Central)",
  "ca-west-1": "Canada West (Calgary)",
  "cn-north-1": "China (Beijing)",
  "cn-northwest-1": "China (Ningxia)",
  "eu-central-1": "Europe (Frankfurt)",
  "eu-central-2": "Europe (Zurich)",
  "eu-north-1": "Europe (Stockholm)",
  "eu-south-1": "Europe (Milan)",
  "eu-south-2": "Europe (Spain)",
  "eu-west-1": "Europe (Ireland)",
  "eu-west-2": "Europe (London)",
  "eu-west-3": "Europe (Paris)",
  "il-central-1": "Israel (Tel Aviv)",
  "me-central-1": "Middle East (UAE)",
  "me-south-1": "Middle East (Bahrain)",
  "mx-central-1": "Mexico (Central)",
  "sa-east-1": "South America (São Paulo)",
  "us-east-1": "US East (N. Virginia)",
  "us-east-2": "US East (Ohio)",
  "us-gov-east-1": "AWS GovCloud (US-East)",
  "us-gov-west-1": "AWS GovCloud (US-West)",
  "us-west-1": "US West (N. California)",
  "us-west-2": "US West (Oregon)",
};

/** Long name for a region code, or undefined when the code is not in the map. */
export function awsRegionName(regionId: string): string | undefined {
  const id = regionId.trim();
  if (!id) return undefined;
  return AWS_REGION_NAMES[id];
}

/**
 * Label for region dropdowns: "Europe (Ireland) · eu-west-1".
 * Unknown or blank codes fall back to the trimmed id.
 */
export function formatAwsRegionLabel(regionId: string): string {
  const id = regionId.trim();
  if (!id) return "";
  const name = AWS_REGION_NAMES[id];
  return name ? `${name} · ${id}` : id;
}
