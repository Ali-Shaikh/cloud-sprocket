// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/lib/theme";
import AzureStorageView from "./AzureStorageView";
import type { WorkspaceSnapshot } from "@/types/backend";

const workspace = {
  profile: { displayName: "sub-1" },
  azureStorageAccounts: [{ name: "devstoreaccount1" }],
  azureBlobContainers: [{ name: "data" }],
  azureBlobs: [{ name: "report.csv", size: "12 B", modifiedAt: "2026-06-21T10:00:00Z" }],
  azureBlobMetadata: [],
  selectedAzureStorageAccount: "devstoreaccount1",
  selectedAzureBlobContainer: "data",
  selectedAzureBlobName: "report.csv",
  azureResourceGroups: [],
  actionCapabilities: {
    azure: {
      storage: {
        uploadBlob: { enabled: false, reason: "Read-only" },
        copyBlob: { enabled: false, reason: "Read-only" },
        createFolderPrefix: { enabled: false, reason: "Read-only" },
      },
    },
  },
} as unknown as WorkspaceSnapshot;

describe("AzureStorageView presign", () => {
  it("offers a signed link for the selected blob and shows the result", () => {
    const onPresignBlob = vi.fn();
    render(
      <ThemeProvider>
        <AzureStorageView
          workspace={workspace}
          actionStatus=""
          signedUrlResult={{
            accountName: "devstoreaccount1",
            containerName: "data",
            blobName: "report.csv",
            url: "https://devstoreaccount1.blob.core.windows.net/data/report.csv?sig=mock",
            durationSeconds: 3600,
            expiresAt: "2026-08-05T12:00:00Z",
          }}
          signedUrlStatus="Signed link ready."
          onSelectAccount={() => {}}
          onSelectContainer={() => {}}
          onSelectBlob={() => {}}
          onSetPrefixFilter={() => {}}
          onCreateAccount={() => {}}
          onCreateContainer={() => {}}
          onUploadBlob={() => {}}
          onDeleteBlob={() => {}}
          onPresignBlob={onPresignBlob}
        />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /signed link \(1h\)/i }));
    expect(onPresignBlob).toHaveBeenCalledWith("report.csv", 3600);
    expect(screen.getByText(/sig=mock/i)).toBeTruthy();
    expect(screen.getByText(/signed link ready/i)).toBeTruthy();
  });
});
