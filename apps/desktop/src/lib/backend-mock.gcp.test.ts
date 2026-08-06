// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { beforeEach, describe, expect, it } from "vitest";

import { backendRequest } from "@/lib/backend";
import type {
  SessionSnapshot,
  WorkspaceSnapshot,
  WorkspaceTab,
} from "@/types/backend";

async function lockGcpWorkspace(): Promise<SessionSnapshot> {
  await backendRequest("session.selectProvider", { providerId: "gcp" });
  await backendRequest("session.selectProfile", {
    providerId: "gcp",
    profileId: "default",
  });
  await backendRequest("session.selectAuthMethod", { authMethod: "cli" });
  return backendRequest<SessionSnapshot>("session.lock");
}

describe("backend mock GCP multi-cloud smoke", () => {
  beforeEach(async () => {
    // Reset to unlocked AWS baseline so each test starts clean.
    try {
      await backendRequest("session.unlock");
    } catch {
      // already unlocked
    }
    await backendRequest("session.selectProvider", { providerId: "aws" });
  });

  it("exposes live GCP service tabs without Soon categories when locked", async () => {
    const session = await lockGcpWorkspace();
    expect(session.isLocked).toBe(true);
    expect(session.lockedProviderId).toBe("gcp");

    const liveServiceIds = [
      "gcp-storage",
      "gcp-compute",
      "gcp-functions",
      "gcp-gke",
    ];
    for (const tabId of liveServiceIds) {
      const tab = session.workspaceTabs.find((entry: WorkspaceTab) => entry.tabId === tabId);
      expect(tab, `expected tab ${tabId}`).toBeTruthy();
      expect(tab?.category).toBe("service");
      expect(tab?.category).not.toBe("coming_soon");
    }
  });

  it("populates GCP inventory fixtures and operator capabilities", async () => {
    await lockGcpWorkspace();
    const workspace = await backendRequest<WorkspaceSnapshot>("workspace.get");

    expect(workspace.gcpStorageBuckets?.length).toBeGreaterThan(0);
    expect(workspace.gcpComputeInstances?.length).toBeGreaterThan(0);
    expect(workspace.gcpFunctions?.length).toBeGreaterThan(0);
    expect(workspace.gcpGkeClusters?.length).toBeGreaterThan(0);
    expect(workspace.gcpWriteCapable).toBe(true);
    expect(workspace.gcpWritesEnabled).toBe(false);
    expect(workspace.actionCapabilities?.storage?.some((c) => c.actionId === "uploadObject")).toBe(
      true,
    );
    expect(workspace.actionCapabilities?.compute?.some((c) => c.actionId === "startInstance")).toBe(
      true,
    );
    expect(workspace.actionCapabilities?.functions?.some((c) => c.actionId === "invoke")).toBe(
      true,
    );
  });

  it("signs a GCS URL without write mode and invokes functions when write mode is on", async () => {
    await lockGcpWorkspace();

    const signed = await backendRequest<{
      result: { url: string; objectKey: string; bucketName: string };
    }>("gcp.storage.signUrl", {
      objectKey: "docs/readme.txt",
      durationSeconds: 3600,
    });
    expect(signed.result.url).toMatch(/X-Goog-Signature=mock/);
    expect(signed.result.objectKey).toBe("docs/readme.txt");

    await expect(
      backendRequest("gcp.functions.call", {
        name: "hello-http",
        region: "us-central1",
        generation: "2nd gen",
        data: '{"name":"world"}',
      }),
    ).rejects.toThrow(/write mode/i);

    await backendRequest("session.setWriteMode", { enabled: true });
    const invoked = await backendRequest<{
      result: { name: string; body: string };
    }>("gcp.functions.call", {
      name: "hello-http",
      region: "us-central1",
      generation: "2nd gen",
      data: '{"name":"world"}',
    });
    expect(invoked.result.name).toBe("hello-http");
    expect(invoked.result.body).toMatch(/"ok":true/);
  });

  it("starts and stops compute instances when write mode is on", async () => {
    await lockGcpWorkspace();
    await backendRequest("session.setWriteMode", { enabled: true });

    const started = await backendRequest<WorkspaceSnapshot>("gcp.compute.startInstance", {
      name: "batch-1",
      zone: "europe-west1-b",
    });
    expect(
      started.gcpComputeInstances?.find((instance) => instance.name === "batch-1")?.status,
    ).toBe("RUNNING");

    const stopped = await backendRequest<WorkspaceSnapshot>("gcp.compute.stopInstance", {
      name: "web-1",
      zone: "us-central1-a",
    });
    expect(
      stopped.gcpComputeInstances?.find((instance) => instance.name === "web-1")?.status,
    ).toBe("TERMINATED");
  });

  it("loads more DynamoDB sample items and reboots RDS when write mode is on", async () => {
    await backendRequest("session.selectProvider", { providerId: "aws" });
    await backendRequest("session.selectProfile", {
      providerId: "aws",
      profileId: "sandbox",
    });
    await backendRequest("session.selectAuthMethod", { authMethod: "cli" });
    await backendRequest("session.lock");
    await backendRequest("session.setWriteMode", { enabled: true });

    const page = await backendRequest<WorkspaceSnapshot>("aws.dynamodb.loadMoreItems", {
      tableName: "cloudsprocket-orders",
      continuationToken: "mock-ddb-page-2",
    });
    const orders = page.dynamodbTables.find((table) => table.tableName === "cloudsprocket-orders");
    expect(orders?.sampleItems?.some((item) => item.includes("ord-003"))).toBe(true);
    expect(orders?.sampleItemsHasMore).toBe(false);

    const job = await backendRequest<{ status: string; message: string }>(
      "aws.rds.rebootInstance",
      { instanceId: "cloudsprocket-db" },
    );
    expect(job.status).toBe("queued");
    expect(job.message).toMatch(/reboot/i);
  });
});
