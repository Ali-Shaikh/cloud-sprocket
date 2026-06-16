package app

import "cloudsprocket/backend/daemon/internal/models"

func workspaceTabs(providerID string) []models.WorkspaceTab {
	overviewTab := models.WorkspaceTab{
		TabID:   "overview",
		Label:   "Overview",
		Summary: "Session-wide provider context and health.",
		Detail:  "Shows the open workspace's cloud context and recent operator activity.",
	}
	activityTab := models.WorkspaceTab{
		TabID:   "actions",
		Label:   "Activity",
		Summary: "Recent job, log, and refresh history.",
		Detail:  "Shows the latest backend activity while the workspace shell continues to expand.",
	}
	virtualisationTab := models.WorkspaceTab{
		TabID:   "virtualisation",
		Label:   "Local Runtime",
		Summary: "Docker and local cloud runtime controls.",
		Detail:  "Manage Docker diagnostics, LocalStack, local config artefacts, and app-owned emulator state.",
	}

	if providerID == "azure" {
		return []models.WorkspaceTab{
			overviewTab,
			virtualisationTab,
			{
				TabID:   "azure-overview",
				Label:   "Azure",
				Summary: "Subscription context and readiness.",
				Detail:  "Surfaces the open Azure subscription details and the next read-only inventory slices.",
			},
			{
				TabID:   "azure-resource-groups",
				Label:   "Resource Groups",
				Summary: "Read-only Azure resource group inventory.",
				Detail:  "Browse resource groups discovered for the open Azure subscription.",
			},
			{
				TabID:   "azure-vms",
				Label:   "Virtual Machines",
				Summary: "Read-only Azure virtual machine inventory.",
				Detail:  "Browse virtual machines for the selected Azure resource group.",
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
			TabID:   "s3",
			Label:   "S3",
			Summary: "Bucket and object workbench.",
			Detail:  "Presigned URLs, uploads, validation, and bucket browsing are being ported.",
		},
		{
			TabID:   "ec2",
			Label:   "EC2",
			Summary: "Fleet and instance operations.",
			Detail:  "Instance inventory and lifecycle actions are being ported.",
		},
		{
			TabID:   "lambda",
			Label:   "Lambda",
			Summary: "Function inventory, configuration, logs and safe test invoke.",
			Detail:  "List functions by region, view config and recent CloudWatch logs, perform test invokes.",
		},
		{
			TabID:   "dynamodb",
			Label:   "DynamoDB",
			Summary: "Table inventory and read-only item preview.",
			Detail:  "List tables by region, inspect keys and GSIs, and scan the first items read-only.",
		},
		{
			TabID:   "sqs",
			Label:   "SQS",
			Summary: "Queue inventory, depth metrics, and safe message peek.",
			Detail:  "List queues by region, inspect depth and in-flight counts, and peek messages without deleting them.",
		},
		{
			TabID:   "sns",
			Label:   "SNS",
			Summary: "Topic inventory and subscription preview.",
			Detail:  "List topics by region and inspect subscriptions read-only.",
		},
		{
			TabID:   "rds",
			Label:   "RDS",
			Summary: "Database instance inventory.",
			Detail:  "List RDS instances by region with engine, status, and endpoint details.",
		},
		{
			TabID:   "logs",
			Label:   "Logs",
			Summary: "CloudWatch Logs group inventory and recent events.",
			Detail:  "Browse log groups by region and tail recent events read-only.",
		},
		{
			TabID:   "iam",
			Label:   "IAM",
			Summary: "Role and policy inventory.",
			Detail:  "Inspect IAM roles and customer-managed policies created in this account.",
		},
		activityTab,
	}
}
