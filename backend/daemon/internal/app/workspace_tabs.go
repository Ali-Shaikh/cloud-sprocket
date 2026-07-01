// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import "cloudsprocket/backend/daemon/internal/models"

const (
	workspaceTabCategoryWorkspace = "workspace"
	workspaceTabCategoryService   = "service"
	workspaceTabCategoryTool        = "tool"
)

func workspaceTabs(providerID string) []models.WorkspaceTab {
	overviewTab := models.WorkspaceTab{
		TabID:    "overview",
		Label:    "Overview",
		Summary:  "Session-wide provider context and health.",
		Detail:   "Shows the open workspace's cloud context and recent operator activity.",
		Category: workspaceTabCategoryWorkspace,
	}
	activityTab := models.WorkspaceTab{
		TabID:    "actions",
		Label:    "Activity",
		Summary:  "Recent job, log, and refresh history.",
		Detail:   "Shows the latest backend activity while the workspace shell continues to expand.",
		Category: workspaceTabCategoryWorkspace,
	}
	virtualisationTab := models.WorkspaceTab{
		TabID:    "virtualisation",
		Label:    "Local Runtime",
		Summary:  "Docker and local cloud runtime controls.",
		Detail:   "Manage Docker diagnostics, LocalStack, local config artefacts, and app-owned emulator state.",
		Category: workspaceTabCategoryWorkspace,
	}

	if providerID == "azure" {
		return []models.WorkspaceTab{
			overviewTab,
			virtualisationTab,
			{
				TabID:    "azure-tools",
				Label:    "Tools",
				Summary:  "Operational workflows for Azure investigation and triage.",
				Detail:   "Launch WAF Security, Log Analytics, and Front Door tools from one place.",
				Category: workspaceTabCategoryTool,
			},
			{
				TabID:    "azure-waf",
				Label:    "WAF Security",
				Summary:  "Front Door WAF investigation and policy workbench.",
				Detail:   "Overview dashboard, tracking-ref lookup, schema-aware KQL, and policy tuning.",
				Category: workspaceTabCategoryTool,
			},
			{
				TabID:    "azure-log-analytics",
				Label:    "Log Analytics",
				Summary:  "Run KQL queries against Log Analytics workspaces.",
				Detail:   "Query Azure Monitor logs with KQL, locally against floci-az or on a real Azure workspace.",
				Category: workspaceTabCategoryTool,
			},
			{
				TabID:    "azure-front-door",
				Label:    "Front Door",
				Summary:  "Azure Front Door profile topology and access logs.",
				Detail:   "Browse profiles, endpoints, and origins read-only, jump to linked WAF policies, and run access-log KQL presets.",
				Category: workspaceTabCategoryTool,
			},
			{
				TabID:    "azure-overview",
				Label:    "Azure",
				Summary:  "Subscription context and readiness.",
				Detail:   "Surfaces the open Azure subscription details and the next read-only inventory slices.",
				Category: workspaceTabCategoryService,
			},
			{
				TabID:    "azure-resource-groups",
				Label:    "Resource Groups",
				Summary:  "Read-only Azure resource group inventory.",
				Detail:   "Browse resource groups discovered for the open Azure subscription.",
				Category: workspaceTabCategoryService,
			},
			{
				TabID:    "azure-vms",
				Label:    "Virtual Machines",
				Summary:  "Read-only Azure virtual machine inventory.",
				Detail:   "Browse virtual machines for the selected Azure resource group.",
				Category: workspaceTabCategoryService,
			},
			{
				TabID:    "azure-storage",
				Label:    "Storage",
				Summary:  "Blob storage accounts, containers, and objects.",
				Detail:   "Browse storage accounts and blob containers, upload and delete blobs when write mode is on.",
				Category: workspaceTabCategoryService,
			},
			{
				TabID:    "azure-app-service",
				Label:    "App Service",
				Summary:  "Cloud App Service web apps.",
				Detail:   "Browse and create App Service web apps on cloud Azure profiles. Not available on floci-az local.",
				Category: workspaceTabCategoryService,
			},
			{
				TabID:    "azure-functions",
				Label:    "Functions",
				Summary:  "Browse and invoke Azure Functions.",
				Detail:   "List Function Apps and their functions, and invoke HTTP-triggered functions when write mode is on.",
				Category: workspaceTabCategoryService,
			},
			{
				TabID:    "azure-key-vault",
				Label:    "Key Vault",
				Summary:  "Browse and manage Key Vault secrets.",
				Detail:   "List vaults and secrets, reveal a secret value, and set secrets when write mode is on.",
				Category: workspaceTabCategoryService,
			},
			{
				TabID:    "azure-cosmos",
				Label:    "Cosmos DB",
				Summary:  "Browse Cosmos DB databases, containers, and items.",
				Detail:   "Read-only browse of Cosmos SQL databases, containers, and a sample of documents.",
				Category: workspaceTabCategoryService,
			},
			{
				TabID:    "azure-postgres",
				Label:    "PostgreSQL",
				Summary:  "Azure Database for PostgreSQL Flexible Servers.",
				Detail:   "List flexible servers and reveal connection strings. Backed by floci-az containers on local; read-only on cloud.",
				Category: workspaceTabCategoryService,
			},
			{
				TabID:    "azure-queues",
				Label:    "Queues",
				Summary:  "Browse storage queues and peek messages.",
				Detail:   "List storage account queues and peek messages without consuming them.",
				Category: workspaceTabCategoryService,
			},
			{
				TabID:    "azure-entra",
				Label:    "Entra ID",
				Summary:  "Browse directory users, groups, and app registrations.",
				Detail:   "Read-only directory browse on a cloud Azure profile. Not available on floci-az local.",
				Category: workspaceTabCategoryService,
			},
			activityTab,
		}
	}

	if providerID == "gcp" {
		return []models.WorkspaceTab{
			overviewTab,
			virtualisationTab,
			{
				TabID:   "gcp-overview",
				Label:   "GCP",
				Summary: "Project context and readiness.",
				Detail:  "Surfaces the open GCP configuration details while provider-specific inventory is ported.",
			},
			activityTab,
		}
	}

	return []models.WorkspaceTab{
		overviewTab,
		virtualisationTab,
		{
			TabID:    "logs",
			Label:    "Logs",
			Summary:  "CloudWatch Logs group inventory and recent events.",
			Detail:   "Browse log groups by region and tail recent events read-only.",
			Category: workspaceTabCategoryTool,
		},
		{
			TabID:    "s3",
			Label:    "S3",
			Summary:  "Bucket and object workbench.",
			Detail:   "Presigned URLs, uploads, validation, and bucket browsing.",
			Category: workspaceTabCategoryService,
		},
		{
			TabID:    "ec2",
			Label:    "EC2",
			Summary:  "Fleet and instance operations.",
			Detail:   "Instance inventory and lifecycle actions.",
			Category: workspaceTabCategoryService,
		},
		{
			TabID:    "lambda",
			Label:    "Lambda",
			Summary:  "Function inventory, configuration, logs and safe test invoke.",
			Detail:   "List functions by region, view config and recent CloudWatch logs, perform test invokes.",
			Category: workspaceTabCategoryService,
		},
		{
			TabID:    "dynamodb",
			Label:    "DynamoDB",
			Summary:  "Table inventory and read-only item preview.",
			Detail:   "List tables by region, inspect keys and GSIs, and scan the first items read-only.",
			Category: workspaceTabCategoryService,
		},
		{
			TabID:    "sqs",
			Label:    "SQS",
			Summary:  "Queue inventory, depth metrics, and safe message peek.",
			Detail:   "List queues by region, inspect depth and in-flight counts, and peek messages without deleting them.",
			Category: workspaceTabCategoryService,
		},
		{
			TabID:    "sns",
			Label:    "SNS",
			Summary:  "Topic inventory and subscription preview.",
			Detail:   "List topics by region and inspect subscriptions read-only.",
			Category: workspaceTabCategoryService,
		},
		{
			TabID:    "rds",
			Label:    "RDS",
			Summary:  "Database instance inventory.",
			Detail:   "List RDS instances by region with engine, status, and endpoint details.",
			Category: workspaceTabCategoryService,
		},
		{
			TabID:    "iam",
			Label:    "IAM",
			Summary:  "Role and policy inventory.",
			Detail:   "Inspect IAM roles and customer-managed policies created in this account.",
			Category: workspaceTabCategoryService,
		},
		activityTab,
	}
}
