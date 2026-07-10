// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

/**
 * Client-side key filter for the S3 object browser.
 * S3 ListObjects only supports start-with path prefixes; contains-search is applied
 * to the already-loaded window so users can find keys without re-listing the bucket.
 */
export function filterObjectsByKeyQuery<T extends { key: string }>(
  objects: readonly T[],
  query: string,
): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return objects.slice();
  }
  return objects.filter((object) => object.key.toLowerCase().includes(needle));
}

export function s3ObjectListSummary(loaded: number, visible: number, searchActive: boolean): string {
  if (loaded === 0) {
    return "0 objects";
  }
  if (searchActive && visible !== loaded) {
    return `${visible} of ${loaded} loaded`;
  }
  return `${loaded} object${loaded === 1 ? "" : "s"}`;
}
