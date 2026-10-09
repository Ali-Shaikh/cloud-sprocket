// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "@/lib/theme";
import type { WorkspaceSnapshot } from "@/types/backend";
import StorageView from "./StorageView";

function renderStorage(workspace: WorkspaceSnapshot) {
  return render(
    <ThemeProvider>
      <StorageView
        workspace={workspace}
        showSensitiveValues={false}
        onSelectBucket={vi.fn()}
        onSelectObject={vi.fn()}
        onSetPrefixFilter={vi.fn()}
        uploadStatus=""
        signedUrlStatus=""
        onUploadObject={vi.fn()}
        onPresignObject={vi.fn()}
        onAnalyseUrl={vi.fn()}
        onValidateUrl={vi.fn()}
      />
    </ThemeProvider>,
  );
}

describe("StorageView empty states", () => {
  it("says the bucket list failed instead of saying no buckets were discovered", () => {
    renderStorage({
      s3Buckets: [],
      s3Objects: [],
      s3ObjectMetadata: [],
      s3ExportSnippets: [],
      s3StatusMessage: "Could not list S3 buckets.\nDetail: access denied",
    } as unknown as WorkspaceSnapshot);

    expect(screen.getByText("Could not list buckets")).toBeTruthy();
    expect(screen.queryByText("No buckets discovered")).toBeNull();
  });

  it("says the object list failed instead of saying the folder is empty", () => {
    renderStorage({
      s3Buckets: [{ name: "alpha" }],
      selectedS3BucketName: "alpha",
      s3Objects: [],
      s3ObjectMetadata: [],
      s3ExportSnippets: [],
      s3StatusMessage:
        "Could not refresh the live list. Showing 1 cached bucket(s).\nCould not list objects in alpha.",
    } as unknown as WorkspaceSnapshot);

    expect(screen.getByText("Could not list objects")).toBeTruthy();
    expect(screen.queryByText("Empty folder")).toBeNull();
  });
});
