// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/lib/theme";
import GcpStorageView from "./GcpStorageView";
import type { WorkspaceSnapshot } from "@/types/backend";

const workspace = {
  profile: {
    displayName: "platform",
    attributes: [{ label: "Project", value: "platform-prod" }],
  },
  selectedGcpStorageBucket: "alpha",
  gcpStorageBuckets: [{ name: "alpha", location: "US" }],
  gcpStorageObjects: [
    { key: "docs/", isFolder: true, size: "Folder" },
    { key: "docs/readme.txt", size: "12 B", updated: "2026-08-01T10:00:00Z" },
  ],
  gcpStorageStatusMessage: "1 folder and 1 object in alpha.",
} as unknown as WorkspaceSnapshot;

describe("GcpStorageView signed link", () => {
  it("selects an object and requests a one-hour signed link", () => {
    const onSignUrl = vi.fn();
    render(
      <ThemeProvider>
        <GcpStorageView
          workspace={workspace}
          onRefresh={() => {}}
          onSelectBucket={() => {}}
          onSetPrefixFilter={() => {}}
          onSignUrl={onSignUrl}
          signedUrlResult={{
            bucketName: "alpha",
            objectKey: "docs/readme.txt",
            url: "https://storage.googleapis.com/alpha/docs/readme.txt?X-Goog-Signature=mock",
            durationSeconds: 3600,
            expiresAt: "2026-08-05T12:00:00Z",
          }}
          signedUrlStatus="Signed link ready."
        />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByText("docs/readme.txt"));
    fireEvent.click(screen.getByRole("button", { name: /signed link \(1h\)/i }));
    expect(onSignUrl).toHaveBeenCalledWith("docs/readme.txt", 3600);
    expect(screen.getByText(/X-Goog-Signature=mock/i)).toBeTruthy();
    expect(screen.getByText(/signed link ready/i)).toBeTruthy();
  });
});
