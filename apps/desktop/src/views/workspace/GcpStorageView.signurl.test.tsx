// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WRITE_MODE_REQUIRED_REASON } from "@/lib/action-capabilities";
import { ThemeProvider } from "@/lib/theme";
import GcpStorageView from "./GcpStorageView";
import type { WorkspaceSnapshot } from "@/types/backend";

const baseWorkspace = {
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
  gcpWritesEnabled: false,
  actionCapabilities: {
    storage: [
      {
        actionId: "uploadObject",
        label: "Upload object",
        enabled: false,
        reason: WRITE_MODE_REQUIRED_REASON,
      },
      {
        actionId: "deleteObject",
        label: "Delete object",
        enabled: false,
        reason: WRITE_MODE_REQUIRED_REASON,
      },
      {
        actionId: "createBucket",
        label: "Create bucket",
        enabled: false,
        reason: WRITE_MODE_REQUIRED_REASON,
      },
      {
        actionId: "copyObject",
        label: "Copy object",
        enabled: false,
        reason: WRITE_MODE_REQUIRED_REASON,
      },
    ],
  },
} as unknown as WorkspaceSnapshot;

function renderStorage(overrides: {
  workspace?: WorkspaceSnapshot;
  onUploadObject?: (sourcePath: string, objectKey: string) => void;
  onDeleteObject?: (objectKey: string) => void;
  onCreateBucket?: (bucketName: string, location: string) => void;
  onCopyObject?: (sourceObjectKey: string, destinationObjectKey: string) => void;
  onSignUrl?: (objectKey: string, durationSeconds: number) => void;
  onSelectBucket?: (bucketName: string) => void;
  onSetPrefixFilter?: (prefix: string) => void;
  signedUrlResult?: WorkspaceSnapshot extends never ? never : {
    bucketName: string;
    objectKey: string;
    url: string;
    durationSeconds: number;
    expiresAt: string;
  };
  signedUrlStatus?: string;
} = {}) {
  const onRefresh = vi.fn();
  const onSelectBucket = overrides.onSelectBucket ?? vi.fn();
  const onSetPrefixFilter = overrides.onSetPrefixFilter ?? vi.fn();
  render(
    <ThemeProvider>
      <GcpStorageView
        workspace={overrides.workspace ?? baseWorkspace}
        onRefresh={onRefresh}
        onSelectBucket={onSelectBucket}
        onSetPrefixFilter={onSetPrefixFilter}
        onUploadObject={overrides.onUploadObject}
        onDeleteObject={overrides.onDeleteObject}
        onCreateBucket={overrides.onCreateBucket}
        onCopyObject={overrides.onCopyObject}
        onSignUrl={overrides.onSignUrl}
        signedUrlResult={overrides.signedUrlResult}
        signedUrlStatus={overrides.signedUrlStatus}
      />
    </ThemeProvider>,
  );
  return { onRefresh, onSelectBucket, onSetPrefixFilter };
}

describe("GcpStorageView", () => {
  it("selects an object and requests a one-hour signed link", () => {
    const onSignUrl = vi.fn();
    renderStorage({
      onSignUrl,
      signedUrlResult: {
        bucketName: "alpha",
        objectKey: "docs/readme.txt",
        url: "https://storage.googleapis.com/alpha/docs/readme.txt?X-Goog-Signature=mock",
        durationSeconds: 3600,
        expiresAt: "2026-08-05T12:00:00Z",
      },
      signedUrlStatus: "Signed link ready.",
    });

    fireEvent.click(screen.getByText("docs/readme.txt"));
    fireEvent.click(screen.getByRole("button", { name: /signed link \(1h\)/i }));
    expect(onSignUrl).toHaveBeenCalledWith("docs/readme.txt", 3600);
    expect(screen.getByText(/X-Goog-Signature=mock/i)).toBeTruthy();
    expect(screen.getByText(/signed link ready/i)).toBeTruthy();
  });

  it("disables upload and delete when write mode is off", () => {
    const onUploadObject = vi.fn();
    const onDeleteObject = vi.fn();
    renderStorage({ onUploadObject, onDeleteObject });

    const upload = screen.getByRole("button", { name: /^upload$/i });
    expect(upload).toBeDisabled();
    expect(upload.getAttribute("title") ?? "").toMatch(/write mode/i);

    const deleteButton = screen.getByRole("button", { name: /^delete$/i });
    expect(deleteButton).toBeDisabled();
    expect(deleteButton.getAttribute("title") ?? "").toMatch(/write mode/i);
  });

  it("uploads and deletes when write mode is enabled", () => {
    const onUploadObject = vi.fn();
    const onDeleteObject = vi.fn();
    const writable = {
      ...baseWorkspace,
      gcpWritesEnabled: true,
      actionCapabilities: {
        storage: [
          { actionId: "uploadObject", label: "Upload object", enabled: true },
          { actionId: "deleteObject", label: "Delete object", enabled: true },
          { actionId: "createBucket", label: "Create bucket", enabled: true },
          { actionId: "copyObject", label: "Copy object", enabled: true },
        ],
      },
    } as unknown as WorkspaceSnapshot;

    renderStorage({
      workspace: writable,
      onUploadObject,
      onDeleteObject,
    });

    fireEvent.click(screen.getByRole("button", { name: /^upload$/i }));
    const dialog = screen.getByRole("alertdialog");
    const source = within(dialog).getByPlaceholderText("Local file path");
    const key = within(dialog).getByPlaceholderText("folder/file.txt");
    fireEvent.change(source, { target: { value: "C:\\tmp\\note.txt" } });
    fireEvent.change(key, { target: { value: "docs/note.txt" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /^upload$/i }));
    expect(onUploadObject).toHaveBeenCalledWith("C:\\tmp\\note.txt", "docs/note.txt");

    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    const confirm = screen.getByRole("alertdialog");
    fireEvent.click(within(confirm).getByRole("button", { name: /^delete$/i }));
    expect(onDeleteObject).toHaveBeenCalledWith("docs/readme.txt");
  });

  it("creates a bucket and copies an object when write mode is enabled", () => {
    const onCreateBucket = vi.fn();
    const onCopyObject = vi.fn();
    const writable = {
      ...baseWorkspace,
      gcpWritesEnabled: true,
      actionCapabilities: {
        storage: [
          { actionId: "uploadObject", label: "Upload object", enabled: true },
          { actionId: "deleteObject", label: "Delete object", enabled: true },
          { actionId: "createBucket", label: "Create bucket", enabled: true },
          { actionId: "copyObject", label: "Copy object", enabled: true },
        ],
      },
    } as unknown as WorkspaceSnapshot;
    renderStorage({
      workspace: writable,
      onCreateBucket,
      onCopyObject,
      onSignUrl: vi.fn(),
    });

    fireEvent.click(screen.getByRole("button", { name: /new bucket/i }));
    const createDialog = screen.getByRole("alertdialog");
    fireEvent.change(within(createDialog).getByLabelText("New Cloud Storage bucket name"), {
      target: { value: "new-artifacts" },
    });
    fireEvent.change(within(createDialog).getByLabelText("Cloud Storage bucket location"), {
      target: { value: "europe-west2" },
    });
    fireEvent.click(within(createDialog).getByRole("button", { name: /^create bucket$/i }));
    expect(onCreateBucket).toHaveBeenCalledWith("new-artifacts", "europe-west2");

    fireEvent.click(screen.getByText("docs/readme.txt"));
    fireEvent.click(screen.getByRole("button", { name: /^copy object$/i }));
    const copyDialog = screen.getByRole("alertdialog");
    const confirm = within(copyDialog).getByRole("button", { name: /^copy object$/i });
    expect(confirm).toBeDisabled();
    fireEvent.change(within(copyDialog).getByLabelText("Destination Cloud Storage object key"), {
      target: { value: "docs/copy.txt" },
    });
    fireEvent.click(within(copyDialog).getByRole("button", { name: /^copy object$/i }));
    expect(onCopyObject).toHaveBeenCalledWith("docs/readme.txt", "docs/copy.txt");
  });

  it("navigates into a folder prefix from the objects table", () => {
    const onSetPrefixFilter = vi.fn();
    renderStorage({ onSetPrefixFilter });

    fireEvent.click(screen.getByText("docs/"));
    expect(onSetPrefixFilter).toHaveBeenCalledWith("docs/");
  });

  it("shows an empty-state when no buckets are loaded", () => {
    const empty = {
      profile: baseWorkspace.profile,
      gcpStorageBuckets: [],
      gcpStorageObjects: [],
      gcpWritesEnabled: false,
    } as unknown as WorkspaceSnapshot;

    renderStorage({ workspace: empty });

    expect(screen.getByText("No buckets in this project")).toBeTruthy();
    expect(screen.getByText(/Google Cloud console or with gcloud/i)).toBeTruthy();
  });

  it("says the object list failed when the bucket warning is listed first", () => {
    const failed = {
      ...baseWorkspace,
      gcpStorageObjects: [],
      gcpStorageStatusMessage:
        "Could not refresh the live list. Showing 1 cached Cloud Storage bucket(s).\nCould not list objects in alpha.",
    } as unknown as WorkspaceSnapshot;

    renderStorage({ workspace: failed });

    expect(screen.getByText("Could not list objects")).toBeTruthy();
    expect(screen.queryByText("This folder is empty")).toBeNull();
  });

  it("says the bucket list failed instead of saying the project is empty", () => {
    const failed = {
      profile: baseWorkspace.profile,
      gcpStorageBuckets: [],
      gcpStorageObjects: [],
      gcpStorageStatusMessage: "Could not list Cloud Storage buckets.",
      gcpInventory: { gcs: { loaded: true, emptyReason: "error" } },
    } as unknown as WorkspaceSnapshot;

    renderStorage({ workspace: failed });

    expect(screen.getByText("Could not list buckets")).toBeTruthy();
    expect(screen.queryByText("No buckets in this project")).toBeNull();
  });

  it("shows the write mode reason in the page", () => {
    renderStorage({ onCreateBucket: vi.fn() });
    expect(screen.getByText(WRITE_MODE_REQUIRED_REASON)).toBeTruthy();
  });

  it("loads more objects when a continuation token is present", () => {
    const onLoadMoreObjects = vi.fn();
    const paged = {
      ...baseWorkspace,
      gcpStorageObjectsHasMore: true,
      gcpStorageObjectsNextToken: "page-2",
    } as unknown as WorkspaceSnapshot;

    render(
      <ThemeProvider>
        <GcpStorageView
          workspace={paged}
          onRefresh={() => {}}
          onSelectBucket={() => {}}
          onSetPrefixFilter={() => {}}
          onLoadMoreObjects={onLoadMoreObjects}
        />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /load more/i }));
    expect(onLoadMoreObjects).toHaveBeenCalled();
  });
});
