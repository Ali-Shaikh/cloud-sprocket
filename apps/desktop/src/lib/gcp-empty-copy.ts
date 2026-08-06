// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

/**
 * Shared empty-state copy for GCP inventory tabs (Storage, Compute, Functions, GKE).
 * Keep wording British English and consistent across panels.
 */

export type GcpEmptyCopy = {
  title: string;
  description: string;
};

/** When the inventory list is empty for the open project. */
export function gcpProjectEmpty(resourceLabel: string, createHint: string): GcpEmptyCopy {
  return {
    title: `No ${resourceLabel} in this project`,
    description: createHint,
  };
}

/** When a local filter hides every loaded row. */
export function gcpFilterEmpty(resourceLabel: string): GcpEmptyCopy {
  return {
    title: `No ${resourceLabel} match the filter`,
    description: "Clear the filter to see the full inventory.",
  };
}

export const GCP_CREATE_HINTS = {
  buckets: "Create a bucket in the Google Cloud console or with gcloud, then refresh.",
  instances: "Create a VM in the Google Cloud console or with gcloud, then refresh.",
  functions: "Deploy a Cloud Function with gcloud or the console, then refresh.",
  clusters: "Create a GKE cluster in the console or with gcloud, then refresh.",
  objects:
    "Open another folder from the breadcrumb, upload an object, or select a different bucket.",
  objectFilter: "Clear the name filter to see the full page.",
} as const;
