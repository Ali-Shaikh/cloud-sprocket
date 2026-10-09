// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

export type S3EmptyCopy = {
  title: string;
  description: string;
};

/** Bucket pane copy. A failed list must not look like an empty account. */
export function s3BucketEmptyCopy(bucketCount: number, status: string): S3EmptyCopy {
  if (bucketCount === 0 && status.includes("Could not list S3 buckets")) {
    return {
      title: "Could not list buckets",
      description: "Refresh to try the list again.",
    };
  }
  if (bucketCount === 0) {
    return {
      title: "No buckets discovered",
      description: status.trim() || "S3 inventory is waiting for an open AWS workspace.",
    };
  }
  return {
    title: "Select a bucket",
    description: "Choose a bucket above. Objects stay on this page.",
  };
}

/** Object table copy. A failed list must not look like an empty folder. */
export function s3ObjectEmptyCopy(input: {
  loadedCount: number;
  searchActive: boolean;
  status: string;
  searchDescription: string;
}): S3EmptyCopy {
  if (input.loadedCount === 0 && input.status.includes("Could not list objects")) {
    return {
      title: "Could not list objects",
      description: "Refresh to try the list again.",
    };
  }
  if (input.searchActive) {
    return {
      title: "No matching names",
      description: input.searchDescription,
    };
  }
  return {
    title: "Empty folder",
    description: "This folder has no subfolders or objects. Use the breadcrumb to go up.",
  };
}
