// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

import type { Deployment, DeploymentOutput } from "../types/backend";

export type LogCommand = {
  label: string;
  command: string;
  detail: string;
};

export type DeploymentOutputLink = {
  url: string;
  label: string;
  title: string;
  note?: string;
};

const LOCALSTACK_GATEWAY_PORT = "4566";
const LOCALSTACK_CLOUD_SUFFIX = ".localhost.localstack.cloud";
const LOCALSTACK_LEGACY_HOST =
  /\.(elb|s3-website|s3|execute-api|cloudfront|rds)\.localhost(?::\d+)?(?:\/|$)/i;

const RUNTIME_LABELS: Record<string, string> = {
  localstack: "LocalStack",
  "floci-az": "floci-az",
  "docker-compose": "Docker Compose",
};

export function runtimeDisplayName(runtimeId?: string): string {
  const id = (runtimeId ?? "localstack").trim() || "localstack";
  return RUNTIME_LABELS[id] ?? id;
}

export function deploymentRuntimeId(deployment: Pick<Deployment, "local" | "runtimeId">): string {
  if (!deployment.local) return "aws-cloud";
  return (deployment.runtimeId ?? "localstack").trim() || "localstack";
}

function stringVariable(value: unknown, fallback: string): string {
  const text = String(value ?? "").trim();
  return text === "" ? fallback : text;
}

function quoteArg(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

function recipeDefaultAppName(recipeId: string): string {
  switch (recipeId) {
    case "scheduled-job-aws":
      return "myjob";
    case "static-site-aws":
      return "mysite";
    case "api-postgres-serverless-aws":
    case "python-api-postgres-serverless-aws":
    case "api-dynamodb-serverless-aws":
      return "myapi";
    default:
      return "myapp";
  }
}

function localStackLogEndpoint(deployment: Deployment): string | null {
  if (!deployment.local || deploymentRuntimeId(deployment) !== "localstack") return null;
  return "http://localhost:4566";
}

export function logCommandsForDeployment(deployment: Deployment): LogCommand[] {
  const appName = stringVariable(deployment.variables.app_name, recipeDefaultAppName(deployment.recipeId));
  const environment = stringVariable(deployment.variables.environment, "dev");
  const region = stringVariable(deployment.variables.aws_region, "us-east-1");
  const stackName = `${appName}-${environment}`;

  switch (deployment.recipeId) {
    case "serverless-fullstack-aws":
    case "api-dynamodb-serverless-aws":
      return [
        cloudWatchTailCommand(deployment, region, `/aws/lambda/${stackName}-api`, "API Lambda", "Lambda invocation logs for the HTTP API."),
      ];
    case "scheduled-job-aws":
      return [
        cloudWatchTailCommand(
          deployment,
          region,
          `/aws/lambda/${stackName}-job`,
          "Scheduled job Lambda",
          "Lambda invocation logs for each scheduled run.",
        ),
      ];
    case "container-fullstack-aws":
    case "api-postgres-containers-aws":
      return [
        cloudWatchTailCommand(
          deployment,
          region,
          `/ecs/${stackName}`,
          "ECS container service",
          "Container STDOUT and STDERR from the awslogs log driver.",
        ),
      ];
    case "api-postgres-serverless-aws":
    case "python-api-postgres-serverless-aws":
    case "fullstack-postgres-serverless-aws":
    case "lab-rest-api-aws":
      return [
        cloudWatchTailCommand(deployment, region, `/aws/lambda/${stackName}-api`, "API Lambda", "Lambda invocation logs for the HTTP API."),
      ];
    case "lab-queue-worker-aws":
    case "async-app-aws":
      return [
        cloudWatchTailCommand(deployment, region, `/aws/lambda/${stackName}-api`, "API Lambda", "HTTP API invocation logs."),
        cloudWatchTailCommand(
          deployment,
          region,
          `/aws/lambda/${stackName}-worker`,
          "Worker Lambda",
          "Lambda invocation logs for SQS-triggered runs.",
        ),
      ];
    case "lab-event-fanout-aws":
      return [
        cloudWatchTailCommand(
          deployment,
          region,
          `/aws/lambda/${stackName}-worker`,
          "Fan-out worker Lambda",
          "Lambda invocation logs for SNS → SQS → Lambda deliveries.",
        ),
      ];
    case "webhook-platform-aws":
      return [
        cloudWatchTailCommand(deployment, region, `/aws/lambda/${stackName}-ingest`, "Webhook ingest Lambda", "Inbound webhook request logs."),
        cloudWatchTailCommand(
          deployment,
          region,
          `/aws/lambda/${stackName}-processor`,
          "Webhook processor Lambda",
          "Lambda invocation logs for queued webhook payloads.",
        ),
      ];
    default:
      return [];
  }
}

function cloudWatchTailCommand(
  deployment: Deployment,
  region: string,
  logGroup: string,
  label: string,
  detail: string,
): LogCommand {
  const localEndpoint = localStackLogEndpoint(deployment);
  const command = localEndpoint
    ? [
        "aws",
        "--endpoint-url",
        quoteArg(localEndpoint),
        "--no-sign-request",
        "logs",
        "tail",
        quoteArg(logGroup),
        "--follow",
        "--region",
        quoteArg(region),
      ].join(" ")
    : [
        "aws",
        "logs",
        "tail",
        quoteArg(logGroup),
        "--follow",
        "--region",
        quoteArg(region),
        ...(deployment.profileId ? ["--profile", quoteArg(deployment.profileId)] : []),
      ].join(" ");

  return { label, command, detail };
}

function isLocalStackHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return lower.endsWith(LOCALSTACK_CLOUD_SUFFIX) || LOCALSTACK_LEGACY_HOST.test(`${lower}/`);
}

function toLocalStackCloudHostname(hostname: string): string {
  const lower = hostname.toLowerCase();
  if (lower.endsWith(LOCALSTACK_CLOUD_SUFFIX)) {
    return hostname;
  }
  const match = hostname.match(/^(.+)\.(elb|s3-website|s3|execute-api|cloudfront|rds)\.localhost$/i);
  if (match) {
    return `${match[1]}.${match[2]}${LOCALSTACK_CLOUD_SUFFIX}`;
  }
  return hostname;
}

function formatLocalStackReachableUrl(url: URL): string {
  const hostname = toLocalStackCloudHostname(url.hostname);
  const path = url.pathname === "/" ? "" : url.pathname;
  return `http://${hostname}:${LOCALSTACK_GATEWAY_PORT}${path}${url.search}${url.hash}`;
}

function normaliseLocalStackUrl(candidate: string): string | null {
  const withProtocol = /^https?:\/\//i.test(candidate) ? candidate : `http://${candidate}`;
  try {
    const url = new URL(withProtocol);
    if (!isLocalStackHostname(url.hostname)) return null;
    return formatLocalStackReachableUrl(url);
  } catch {
    return null;
  }
}

// toLocalStackUrl rewrites an AWS-format endpoint into the URL reachable on LocalStack.
export function toLocalStackUrl(value: string): string | null {
  const original = value.trim();
  if (!original) return null;

  let rewritten = original
    .replace(/\.s3-website[.-][a-z0-9-]+\.amazonaws\.com/i, `.s3-website${LOCALSTACK_CLOUD_SUFFIX}`)
    .replace(/\.s3[.-][a-z0-9-]+\.amazonaws\.com/i, `.s3${LOCALSTACK_CLOUD_SUFFIX}`)
    .replace(/\.execute-api\.[a-z0-9-]+\.amazonaws\.com/i, `.execute-api${LOCALSTACK_CLOUD_SUFFIX}`)
    .replace(/\.cloudfront\.net/i, `.cloudfront${LOCALSTACK_CLOUD_SUFFIX}`)
    .replace(/\.[a-z0-9-]+\.elb\.amazonaws\.com/i, `.elb${LOCALSTACK_CLOUD_SUFFIX}`);

  const mentionsLocalStack =
    rewritten.includes(LOCALSTACK_CLOUD_SUFFIX) || LOCALSTACK_LEGACY_HOST.test(rewritten);
  if (mentionsLocalStack) {
    const normalised = normaliseLocalStackUrl(rewritten);
    if (normalised) return normalised;
  }

  if (rewritten === original) return null;
  if (!/^https?:\/\//i.test(rewritten)) {
    rewritten = "http://" + rewritten;
  } else {
    rewritten = rewritten.replace(/^https:\/\//i, "http://");
  }
  return normaliseLocalStackUrl(rewritten) ?? rewritten;
}

function databaseEndpointLink(
  deployment: Pick<Deployment, "local" | "runtimeId">,
  output: Pick<DeploymentOutput, "value">,
): DeploymentOutputLink | null {
  const port = String(output.value ?? "").match(/:(\d+)\s*$/)?.[1] ?? "4510";
  if (deployment.local && deploymentRuntimeId(deployment) === "localstack") {
    return {
      url: "",
      label: "Connect from your machine",
      title: "Use 127.0.0.1 as the host when connecting from psql or a desktop SQL client.",
      note: `Connect from your machine with host 127.0.0.1 and port ${port}. If the port is refused, restart LocalStack from Local Runtime so RDS ports are published.`,
    };
  }
  return {
    url: "",
    label: "Database endpoint",
    title: "Use this host and port from your application or SQL client inside the same VPC.",
    note: `Endpoint: ${String(output.value ?? "")}`,
  };
}

function localStackDeploymentOutputLink(
  deployment: Pick<Deployment, "local" | "runtimeId" | "recipeId" | "variables">,
  output: Pick<DeploymentOutput, "name" | "value">,
): DeploymentOutputLink | null {
  if (output.name === "database_endpoint") {
    return databaseEndpointLink(deployment, output);
  }

  if (deployment.recipeId === "container-fullstack-aws" && output.name === "frontend_url") {
    const appName = stringVariable(deployment.variables.app_name, recipeDefaultAppName(deployment.recipeId));
    const environment = stringVariable(deployment.variables.environment, "dev");
    const bucket = `${appName}-${environment}-frontend`;
    return {
      url: `http://${bucket}.s3-website.localhost.localstack.cloud:4566`,
      label: "Open S3 website on LocalStack",
      title: "LocalStack CloudFront can fail to route S3 website origins; this opens the direct S3 website endpoint.",
      note: "This CloudFront URL is for real AWS. CloudFront isn't reliably reachable on LocalStack, so locally use the S3 website endpoint below.",
    };
  }

  const url = toLocalStackUrl(String(output.value ?? ""));
  if (!url) return null;
  return {
    url,
    label: "Open on LocalStack",
    title: "The value above is the AWS-format endpoint Terraform reports; this opens the URL actually reachable on LocalStack.",
  };
}

function cloudDeploymentOutputLink(
  output: Pick<DeploymentOutput, "name" | "value">,
): DeploymentOutputLink | null {
  const value = String(output.value ?? "").trim();
  if (!value) return null;

  if (output.name === "database_endpoint") {
    return {
      url: "",
      label: "Database endpoint",
      title: "Use this host and port from your application or SQL client inside the same VPC.",
      note: `Endpoint: ${value}`,
    };
  }

  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withProtocol);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase();
    if (host.includes("localstack.cloud") || host.endsWith(".localhost")) {
      return null;
    }
    return {
      url: url.toString(),
      label: "Open endpoint",
      title: "Open this deployed endpoint in your browser.",
    };
  } catch {
    return null;
  }
}

/** Resolves an open/copy link for a deployment output based on target runtime. */
export function deploymentOutputLink(
  deployment: Pick<Deployment, "local" | "runtimeId" | "recipeId" | "variables">,
  output: Pick<DeploymentOutput, "name" | "value" | "sensitive">,
): DeploymentOutputLink | null {
  if (output.sensitive) return null;

  if (deployment.local) {
    const runtimeId = deploymentRuntimeId(deployment);
    if (runtimeId === "localstack") {
      return localStackDeploymentOutputLink(deployment, output);
    }
    return null;
  }

  return cloudDeploymentOutputLink(output);
}

/** @deprecated Use deploymentOutputLink */
export function localDeploymentOutputLink(
  deployment: Pick<Deployment, "local" | "runtimeId" | "recipeId" | "variables">,
  output: Pick<DeploymentOutput, "name" | "value" | "sensitive">,
): DeploymentOutputLink | null {
  return deploymentOutputLink(deployment, output);
}