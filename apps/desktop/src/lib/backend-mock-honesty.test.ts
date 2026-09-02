// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { describe, expect, it } from "vitest";

import { handleMockRequest } from "./backend-mock";
import type { Deployment, DeploymentJob, WorkspaceSnapshot } from "@/types/backend";

describe("browser mock RPC honesty", () => {
  it("implements S3 load-more and Log Analytics table schema", async () => {
    await expect(
      handleMockRequest<WorkspaceSnapshot>("aws.s3.loadMoreObjects", {
        continuationToken: "page-2",
      }),
    ).resolves.toEqual(expect.objectContaining({ s3ObjectsHasMore: false }));

    await expect(
      handleMockRequest<{ name: string; columns: string[] }>(
        "azure.logAnalytics.table.schema",
        { tableName: "AzureDiagnostics" },
      ),
    ).resolves.toEqual({
      name: "AzureDiagnostics",
      columns: ["TimeGenerated", "Category", "action_s"],
    });
  });

  it("runs a Cosmos SQL query without write mode", async () => {
    await expect(
      handleMockRequest("azure.cosmos.query", {
        account: "devstoreaccount1",
        database: "appdb",
        container: "orders",
        query: "SELECT * FROM c",
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        account: "devstoreaccount1",
        database: "appdb",
        container: "orders",
        items: expect.arrayContaining([expect.objectContaining({ id: expect.any(String) })]),
      }),
    );
  });

  it("refuses AWS writes when write mode is off", async () => {
    await expect(
      handleMockRequest("aws.s3.deleteObject", { objectKey: "reports/weekly-summary.json" }),
    ).rejects.toThrow(/write mode/);
  });

  it("reuses updateDeploymentId on a cancelled record", async () => {
    const planned = await handleMockRequest<DeploymentJob>("deployments.plan", {
      recipeId: "lab-dynamodb-aws",
      name: "honesty",
      providerId: "aws",
      local: true,
    });
    planned.deployment.status = "cancelled";
    planned.deployment.outputs = [{ name: "table_name", value: "leftover" }];

    const updated = await handleMockRequest<DeploymentJob>("deployments.plan", {
      recipeId: "lab-dynamodb-aws",
      name: "honesty",
      providerId: "aws",
      local: true,
      updateDeploymentId: planned.deployment.id,
    });
    expect(updated.deployment.id).toBe(planned.deployment.id);
  });

  it("rejects update of a destroying record", async () => {
    const planned = await handleMockRequest<DeploymentJob>("deployments.plan", {
      recipeId: "lab-dynamodb-aws",
      name: "destroying-update",
      providerId: "aws",
      local: true,
    });
    planned.deployment.status = "destroying";

    await expect(
      handleMockRequest("deployments.plan", {
        recipeId: "lab-dynamodb-aws",
        name: "destroying-update",
        providerId: "aws",
        local: true,
        updateDeploymentId: planned.deployment.id,
      }),
    ).rejects.toThrow(/applied, planned, failed, or cancelled/);
  });

  it("refuses to delete a cancelled record that still has outputs", async () => {
    const planned = await handleMockRequest<DeploymentJob>("deployments.plan", {
      recipeId: "lab-dynamodb-aws",
      name: "leftover",
      providerId: "aws",
      local: true,
    });
    planned.deployment.status = "cancelled";
    planned.deployment.outputs = [{ name: "table_name", value: "leftover" }];

    await expect(
      handleMockRequest("deployments.delete", { deploymentId: planned.deployment.id }),
    ).rejects.toThrow(/destroy it before removing/);
  });

  it("refuses apply unless the record is planned", async () => {
    const pending = await handleMockRequest<DeploymentJob>("deployments.plan", {
      recipeId: "lab-dynamodb-aws",
      name: "pending-apply",
      providerId: "aws",
      local: true,
    });
    await expect(
      handleMockRequest("deployments.apply", { deploymentId: pending.deployment.id }),
    ).rejects.toThrow(/planned/);
  });

  it("reuses the same id when update is allowed", async () => {
    const created = await handleMockRequest<DeploymentJob>("deployments.plan", {
      recipeId: "lab-dynamodb-aws",
      name: "replan",
      providerId: "aws",
      local: true,
    });
    created.deployment.status = "failed";

    const updated = await handleMockRequest<DeploymentJob>("deployments.plan", {
      recipeId: "lab-dynamodb-aws",
      name: "replan",
      providerId: "aws",
      local: true,
      updateDeploymentId: created.deployment.id,
      variables: { app_name: "again" },
    });
    expect(updated.deployment.id).toBe(created.deployment.id);
    expect(updated.deployment.variables).toEqual({ app_name: "again" });
  });

  it("returns the stored deployment from get after plan", async () => {
    const created = await handleMockRequest<DeploymentJob>("deployments.plan", {
      recipeId: "static-site-aws",
      name: "get-me",
      providerId: "aws",
      local: true,
    });
    const got = await handleMockRequest<Deployment>("deployments.get", {
      deploymentId: created.deployment.id,
    });
    expect(got.id).toBe(created.deployment.id);
  });
});
