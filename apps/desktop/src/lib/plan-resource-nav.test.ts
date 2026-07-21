// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import { describe, expect, it } from "vitest";

import {
  isDestructivePlanChange,
  looksLikeInventoryKey,
  planActionTone,
  planResourceNavigateParams,
} from "./plan-resource-nav";

describe("planResourceNavigateParams", () => {
  it("maps aws_s3_bucket to S3 tab only when name is an OpenTofu block label", () => {
    expect(
      planResourceNavigateParams("aws", {
        type: "aws_s3_bucket",
        name: "site",
        actions: ["create"],
      }),
    ).toEqual({ provider: "aws", tab: "s3" });
  });

  it("maps aws_lambda_function to lambda tab only for block labels", () => {
    expect(
      planResourceNavigateParams("aws", {
        type: "aws_lambda_function",
        name: "api",
        actions: ["update"],
      }),
    ).toEqual({ provider: "aws", tab: "lambda" });
  });

  it("maps aws_dynamodb_table to dynamodb tab only for block labels", () => {
    expect(
      planResourceNavigateParams("aws", {
        type: "aws_dynamodb_table",
        name: "items",
        actions: ["create"],
      }),
    ).toEqual({ provider: "aws", tab: "dynamodb" });
  });

  it("maps SQS to tab only when name is not a URL", () => {
    expect(
      planResourceNavigateParams("aws", {
        type: "aws_sqs_queue",
        name: "orders",
        actions: ["create"],
      }),
    ).toEqual({ provider: "aws", tab: "sqs" });
  });

  it("includes SQS resourceKey when name looks like a queue URL", () => {
    const url = "https://sqs.us-east-1.amazonaws.com/123/orders";
    expect(
      planResourceNavigateParams("aws", {
        type: "aws_sqs_queue",
        name: url,
        actions: ["create"],
      }),
    ).toEqual({ provider: "aws", tab: "sqs", resourceKey: url });
  });

  it("maps SNS topic to tab only (inventory key is ARN)", () => {
    expect(
      planResourceNavigateParams("aws", {
        type: "aws_sns_topic",
        name: "alerts",
        actions: ["create"],
      }),
    ).toEqual({ provider: "aws", tab: "sns" });
  });

  it("uses path-shaped log group names as inventory keys", () => {
    expect(
      planResourceNavigateParams("aws", {
        type: "aws_cloudwatch_log_group",
        name: "/aws/lambda/api",
        actions: ["create"],
      }),
    ).toEqual({ provider: "aws", tab: "logs", resourceKey: "/aws/lambda/api" });
  });

  it("does not select secrets/IAM/RDS by OpenTofu block label alone", () => {
    expect(
      planResourceNavigateParams("aws", {
        type: "aws_secretsmanager_secret",
        name: "db-password",
        actions: ["create"],
      }),
    ).toEqual({ provider: "aws", tab: "secrets" });

    expect(
      planResourceNavigateParams("aws", {
        type: "aws_iam_role",
        name: "lambda_exec",
        actions: ["create"],
      }),
    ).toEqual({ provider: "aws", tab: "iam" });

    expect(
      planResourceNavigateParams("aws", {
        type: "aws_db_instance",
        name: "main",
        actions: ["create"],
      }),
    ).toEqual({ provider: "aws", tab: "rds" });
  });

  it("prefers deployment output hints over logical names for resourceKey", () => {
    expect(
      planResourceNavigateParams(
        "aws",
        {
          type: "aws_s3_bucket",
          name: "site",
          actions: ["create"],
        },
        {
          outputHints: [{ tab: "s3", resourceKey: "prod-assets" }],
        },
      ),
    ).toEqual({ provider: "aws", tab: "s3", resourceKey: "prod-assets" });
  });

  it("ignores output hints for a different tab", () => {
    expect(
      planResourceNavigateParams(
        "aws",
        {
          type: "aws_s3_bucket",
          name: "site",
          actions: ["create"],
        },
        {
          outputHints: [{ tab: "lambda", resourceKey: "my-fn" }],
        },
      ),
    ).toEqual({ provider: "aws", tab: "s3" });
  });

  it("still maps destroy-only changes to the inventory tab", () => {
    expect(
      planResourceNavigateParams("aws", {
        type: "aws_s3_bucket",
        name: "old-site",
        actions: ["delete"],
      }),
    ).toEqual({ provider: "aws", tab: "s3" });
  });

  it("maps Azure types to tabs without treating block labels as resource keys", () => {
    expect(
      planResourceNavigateParams("azure", {
        type: "azurerm_storage_account",
        name: "stlab",
        actions: ["create"],
      }),
    ).toEqual({ provider: "azure", tab: "azure-storage" });

    expect(
      planResourceNavigateParams("azure", {
        type: "azurerm_linux_function_app",
        name: "fn-lab",
        actions: ["create"],
      }),
    ).toEqual({ provider: "azure", tab: "azure-functions" });

    expect(
      planResourceNavigateParams("azure", {
        type: "azurerm_postgresql_flexible_server",
        name: "pg-lab",
        actions: ["create"],
      }),
    ).toEqual({ provider: "azure", tab: "azure-postgres" });

    expect(
      planResourceNavigateParams("azure", {
        type: "azurerm_key_vault",
        name: "kv-lab",
        actions: ["create"],
      }),
    ).toEqual({ provider: "azure", tab: "azure-key-vault" });

    expect(
      planResourceNavigateParams("azure", {
        type: "azurerm_linux_web_app",
        name: "web-lab",
        actions: ["create"],
      }),
    ).toEqual({ provider: "azure", tab: "azure-app-service" });

    expect(
      planResourceNavigateParams("azure", {
        type: "azurerm_resource_group",
        name: "rg-lab",
        actions: ["create"],
      }),
    ).toEqual({ provider: "azure", tab: "azure-resource-groups" });
  });

  it("returns null for types without a matching inventory surface", () => {
    expect(
      planResourceNavigateParams("aws", {
        type: "aws_cloudwatch_metric_alarm",
        name: "cpu-high",
        actions: ["create"],
      }),
    ).toBeNull();
    expect(
      planResourceNavigateParams("aws", {
        type: "aws_iam_user",
        name: "deployer",
        actions: ["create"],
      }),
    ).toBeNull();
  });

  it("returns null for unknown resource types", () => {
    expect(
      planResourceNavigateParams("aws", {
        type: "aws_vpc",
        name: "main",
        actions: ["create"],
      }),
    ).toBeNull();

    expect(
      planResourceNavigateParams("azure", {
        type: "azurerm_virtual_network",
        name: "vnet",
        actions: ["create"],
      }),
    ).toBeNull();
  });

  it("does not false-positive Azure types under an AWS provider id", () => {
    expect(
      planResourceNavigateParams("aws", {
        type: "azurerm_storage_account",
        name: "stlab",
        actions: ["create"],
      }),
    ).toBeNull();
  });

  it("treats non-azure provider ids as AWS for mapping", () => {
    expect(
      planResourceNavigateParams("localstack", {
        type: "aws_s3_bucket",
        name: "demo",
        actions: ["create"],
      }),
    ).toEqual({ provider: "aws", tab: "s3" });
  });

  it("is case-insensitive on resource type", () => {
    expect(
      planResourceNavigateParams("aws", {
        type: "AWS_S3_BUCKET",
        name: "demo",
        actions: ["create"],
      }),
    ).toEqual({ provider: "aws", tab: "s3" });
  });
});

describe("looksLikeInventoryKey", () => {
  it("accepts ARNs, URLs, log paths, and id shapes", () => {
    expect(looksLikeInventoryKey("arn:aws:s3:::bucket", "s3")).toBe(true);
    expect(looksLikeInventoryKey("https://sqs.us-east-1.amazonaws.com/1/q", "sqs")).toBe(true);
    expect(looksLikeInventoryKey("/aws/lambda/api", "logs")).toBe(true);
    expect(looksLikeInventoryKey("i-0abc", "ec2")).toBe(true);
    expect(looksLikeInventoryKey("site", "s3")).toBe(false);
  });
});

describe("planActionTone and isDestructivePlanChange", () => {
  it("classifies create, update, delete, and replace", () => {
    expect(planActionTone(["create"])).toBe("create");
    expect(planActionTone(["update"])).toBe("update");
    expect(planActionTone(["delete"])).toBe("delete");
    expect(planActionTone(["create", "delete"])).toBe("replace");
    expect(planActionTone(["read"])).toBe("other");
  });

  it("flags any delete action as destructive", () => {
    expect(isDestructivePlanChange(["delete"])).toBe(true);
    expect(isDestructivePlanChange(["create", "delete"])).toBe(true);
    expect(isDestructivePlanChange(["create"])).toBe(false);
    expect(isDestructivePlanChange(["update"])).toBe(false);
  });
});
