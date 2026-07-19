// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import type { NavigateToResourceParams } from "@/lib/navigate-to-resource";
import type { Deployment, DeploymentOutput } from "@/types/backend";

/**
 * Map a known deployment output name to an inventory deep-link when the value
 * is a resource identifier (not a URL). URL outputs keep using open-external.
 */
export function deploymentOutputNavigateParams(
  deployment: Pick<Deployment, "providerId">,
  output: Pick<DeploymentOutput, "name" | "value" | "sensitive">,
): NavigateToResourceParams | null {
  if (output.sensitive) return null;
  const value = String(output.value ?? "").trim();
  if (!value) return null;
  // Prefer external URL open for URL-shaped values.
  if (/^https?:\/\//i.test(value) || value.includes("://")) {
    return null;
  }

  const provider: "aws" | "azure" = deployment.providerId === "azure" ? "azure" : "aws";
  const name = output.name.toLowerCase();

  if (provider === "aws") {
    if (name.includes("bucket") || name === "website_bucket" || name === "s3_bucket") {
      return { provider: "aws", tab: "s3", resourceKey: value };
    }
    if (name.includes("function") || name.includes("lambda")) {
      return { provider: "aws", tab: "lambda", resourceKey: value };
    }
    if (name.includes("table") || name.includes("dynamodb")) {
      return { provider: "aws", tab: "dynamodb", resourceKey: value };
    }
    if (name.includes("queue") && !name.includes("url")) {
      return { provider: "aws", tab: "sqs", resourceKey: value };
    }
    if (name.includes("queue_url") || name.endsWith("queueurl")) {
      return { provider: "aws", tab: "sqs", resourceKey: value };
    }
    if (name.includes("topic") || name.includes("sns")) {
      return { provider: "aws", tab: "sns", resourceKey: value };
    }
    if (name.includes("log_group") || name.includes("loggroup")) {
      return { provider: "aws", tab: "logs", resourceKey: value };
    }
    if (name.includes("secret")) {
      return { provider: "aws", tab: "secrets", resourceKey: value };
    }
    if (name.includes("role") && name.includes("arn") === false) {
      return { provider: "aws", tab: "iam", resourceKey: value };
    }
  } else {
    if (name.includes("storage") || name.includes("account")) {
      return { provider: "azure", tab: "azure-storage", resourceKey: value };
    }
    if (name.includes("webapp") || name.includes("app_name") || name.includes("function_app")) {
      return { provider: "azure", tab: "azure-app-service", resourceKey: value };
    }
    if (
      name.includes("postgres") ||
      name === "server_name" ||
      name === "db_server" ||
      name === "flexible_server_name"
    ) {
      return { provider: "azure", tab: "azure-postgres", resourceKey: value };
    }
    if (name.includes("vault")) {
      return { provider: "azure", tab: "azure-key-vault", resourceKey: value };
    }
    if (name.includes("resource_group") || name === "resourcegroup") {
      return { provider: "azure", tab: "azure-resource-groups", resourceKey: value };
    }
  }

  return null;
}
