// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { describe, expect, it } from "vitest";

import {
  openTabActionToParams,
  overviewNavigateToParams,
  planNavigateToResource,
  resolveOverviewProvider,
} from "./navigate-to-resource";

describe("planNavigateToResource", () => {
  it("maps AWS tab aliases to workspace tab ids and selection RPCs", () => {
    const plan = planNavigateToResource({
      provider: "aws",
      tab: "aws-sqs",
      resourceKey: "https://sqs.us-east-1.amazonaws.com/123/demo-queue",
    });

    expect(plan.tabId).toBe("sqs");
    expect(plan.selections).toEqual([
      {
        method: "aws.sqs.selectQueue",
        params: { queueUrl: "https://sqs.us-east-1.amazonaws.com/123/demo-queue" },
      },
    ]);
  });

  it("maps overview context keys to selection RPCs", () => {
    const plan = planNavigateToResource(
      overviewNavigateToParams("lambda", { lambdaFunctionName: "demo-fn" }, "aws"),
    );

    expect(plan.tabId).toBe("lambda");
    expect(plan.selections).toEqual([
      {
        method: "aws.lambda.selectFunction",
        params: { functionName: "demo-fn" },
      },
    ]);
  });

  it("sets the lambda create flag from overview context", () => {
    const plan = planNavigateToResource(
      overviewNavigateToParams("lambda", { openLambdaCreate: true }, "aws"),
    );

    expect(plan.uiFlags).toEqual({ openLambdaCreate: true });
  });

  it("maps Azure overview context keys to selection RPCs", () => {
    const plan = planNavigateToResource(
      overviewNavigateToParams("azure-vms", { vmId: "/subscriptions/demo/resourceGroups/rg/providers/Microsoft.Compute/virtualMachines/demo-vm" }, "azure"),
    );

    expect(plan.tabId).toBe("azure-vms");
    expect(plan.selections).toEqual([
      {
        method: "azure.virtualMachines.select",
        params: {
          vmId: "/subscriptions/demo/resourceGroups/rg/providers/Microsoft.Compute/virtualMachines/demo-vm",
        },
      },
    ]);
  });

  it("maps Azure app service tab selection RPCs", () => {
    const plan = planNavigateToResource({
      provider: "azure",
      tab: "azure-app-service",
      resourceKey: "lab-webapp",
    });

    expect(plan.tabId).toBe("azure-app-service");
    expect(plan.selections).toEqual([
      {
        method: "azure.webApps.select",
        params: { appName: "lab-webapp" },
      },
    ]);
  });

  it("maps Azure postgres tab selection RPCs", () => {
    const plan = planNavigateToResource({
      provider: "azure",
      tab: "azure-postgres",
      resourceKey: "lab-postgres",
    });

    expect(plan.tabId).toBe("azure-postgres");
    expect(plan.selections).toEqual([
      {
        method: "azure.postgres.selectServer",
        params: { server: "lab-postgres" },
      },
    ]);
  });

  it("applies sub-page navigation for S3", () => {
    const plan = planNavigateToResource({
      provider: "aws",
      tab: "s3",
      resourceKey: "demo-bucket",
      subPage: "objects",
    });

    expect(plan.subPage).toEqual({ tab: "s3", pageId: "objects" });
  });

  it("selects Logs region before log group when logsRegion context is set", () => {
    const plan = planNavigateToResource({
      provider: "aws",
      tab: "logs",
      resourceKey: "/aws/lambda/api",
      context: { logsRegion: "eu-west-1" },
    });

    expect(plan.tabId).toBe("logs");
    expect(plan.selections).toEqual([
      {
        method: "aws.logs.selectRegion",
        params: { region: "eu-west-1" },
      },
      {
        method: "aws.logs.selectLogGroup",
        params: { logGroupName: "/aws/lambda/api" },
      },
    ]);
  });
});

describe("resolveOverviewProvider", () => {
  it("prefers locked provider id when workspace provider is unset", () => {
    expect(
      resolveOverviewProvider("azure-vms", {
        lockedProviderId: "azure",
      }),
    ).toBe("azure");
  });

  it("infers azure from tab id when provider signals are missing", () => {
    expect(resolveOverviewProvider("azure-resource-groups")).toBe("azure");
  });
});

describe("openTabActionToParams", () => {
  it("converts open-tab lab actions into navigation params", () => {
    expect(openTabActionToParams("aws", "aws-dynamodb", "items-table")).toEqual({
      provider: "aws",
      tab: "aws-dynamodb",
      resourceKey: "items-table",
    });
  });
});