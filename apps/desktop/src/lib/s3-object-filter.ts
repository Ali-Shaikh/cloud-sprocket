// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

/**
 * Client-side key filter for the S3 object browser.
 * Server listing uses delimiter folders; contains-search filters the loaded page
 * (folders and files) so users can find names without knowing the full path.
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

/** Display name for a folder or object key relative to the current path prefix. */
export function s3EntryDisplayName(key: string, currentPrefix: string): string {
  const relative = key.startsWith(currentPrefix) ? key.slice(currentPrefix.length) : key;
  return relative.replace(/\/$/, "") || key;
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
