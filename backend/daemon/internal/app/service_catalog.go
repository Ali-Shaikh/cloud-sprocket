// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import "cloudsprocket/backend/daemon/internal/models"

// Service domains group service tabs by type in the sidebar, the Services
// settings page, and the command palette. The vocabulary is provider-agnostic
// and closed; the frontend orders groups with the same ids.
const (
	serviceDomainCompute       = "compute"
	serviceDomainStorage       = "storage"
	serviceDomainDatabase      = "database"
	serviceDomainIntegration   = "integration"
	serviceDomainNetwork       = "network"
	serviceDomainSecurity      = "security"
	serviceDomainGovernance    = "governance"
	serviceDomainObservability = "observability"
)

func knownServiceDomains() map[string]struct{} {
	return map[string]struct{}{
		serviceDomainCompute:       {},
		serviceDomainStorage:       {},
		serviceDomainDatabase:      {},
		serviceDomainIntegration:   {},
		serviceDomainNetwork:       {},
		serviceDomainSecurity:      {},
		serviceDomainGovernance:    {},
		serviceDomainObservability: {},
	}
}

// serviceCatalogEntry is the single source of truth for toggleable workspace
// services and tools. Shell tabs (overview, local runtime, activity) are not
// catalogue entries. Domain is set for service-category entries only;
// operational tools stay in the Tools navigation group.
type serviceCatalogEntry struct {
	ProviderID     string
	ServiceID      string
	Label          string
	Summary        string
	Detail         string
	Category       string
	Domain         string
	InventoryScope string
}

func workspaceOverviewTab() models.WorkspaceTab {
	return models.WorkspaceTab{
		TabID:    "overview",
		Label:    "Overview",
		Summary:  "Session-wide provider context and health.",
		Detail:   "Shows the open workspace's cloud context and recent operator activity.",
		Category: workspaceTabCategoryWorkspace,
	}
}

func workspaceVirtualisationTab() models.WorkspaceTab {
	return models.WorkspaceTab{
		TabID:    "virtualisation",
		Label:    "Local Runtime",
		Summary:  "Docker and local cloud runtime controls.",
		Detail:   "Manage Docker diagnostics, LocalStack, local config artefacts, and app-owned emulator state.",
		Category: workspaceTabCategoryWorkspace,
	}
}

func workspaceActivityTab() models.WorkspaceTab {
	return models.WorkspaceTab{
		TabID:    "actions",
		Label:    "Activity",
		Summary:  "Recent job, log, and refresh history.",
		Detail:   "Shows the latest backend activity while the workspace shell continues to expand.",
		Category: workspaceTabCategoryWorkspace,
	}
}

func awsServiceCatalog() []serviceCatalogEntry {
	return []serviceCatalogEntry{
		{
			ProviderID: "aws", ServiceID: "logs", Label: "Logs",
			Summary: "CloudWatch Logs group inventory and recent events.",
			Detail:  "Browse log groups by region and tail recent events read-only.",
			Category: workspaceTabCategoryService, Domain: serviceDomainObservability,
			InventoryScope: "logs",
		},
		{
			ProviderID: "aws", ServiceID: "s3", Label: "S3",
			Summary: "Bucket and object workbench.",
			Detail:  "Presigned URLs, uploads, validation, and bucket browsing.",
			Category: workspaceTabCategoryService, Domain: serviceDomainStorage,
			InventoryScope: "s3",
		},
		{
			ProviderID: "aws", ServiceID: "ec2", Label: "EC2",
			Summary: "Fleet and instance operations.",
			Detail:  "Instance inventory and lifecycle actions.",
			Category: workspaceTabCategoryService, Domain: serviceDomainCompute,
			InventoryScope: "ec2",
		},
		{
			ProviderID: "aws", ServiceID: "lambda", Label: "Lambda",
			Summary: "Function inventory, configuration, logs and safe test invoke.",
			Detail:  "List functions by region, view config and recent CloudWatch logs, perform test invokes.",
			Category: workspaceTabCategoryService, Domain: serviceDomainCompute,
			InventoryScope: "lambda",
		},
		{
			ProviderID: "aws", ServiceID: "dynamodb", Label: "DynamoDB",
			Summary: "Table inventory and read-only item preview.",
			Detail:  "List tables by region, inspect keys and GSIs, and scan the first items read-only.",
			Category: workspaceTabCategoryService, Domain: serviceDomainDatabase,
			InventoryScope: "dynamodb",
		},
		{
			ProviderID: "aws", ServiceID: "sqs", Label: "SQS",
			Summary: "Queue inventory, depth metrics, and safe message peek.",
			Detail:  "List queues by region, inspect depth and in-flight counts, and peek messages without deleting them.",
			Category: workspaceTabCategoryService, Domain: serviceDomainIntegration,
			InventoryScope: "sqs",
		},
		{
			ProviderID: "aws", ServiceID: "sns", Label: "SNS",
			Summary: "Topic inventory and subscription preview.",
			Detail:  "List topics by region and inspect subscriptions read-only.",
			Category: workspaceTabCategoryService, Domain: serviceDomainIntegration,
			InventoryScope: "sns",
		},
		{
			ProviderID: "aws", ServiceID: "rds", Label: "RDS",
			Summary: "Database instance inventory.",
			Detail:  "List RDS instances by region with engine, status, and endpoint details.",
			Category: workspaceTabCategoryService, Domain: serviceDomainDatabase,
			InventoryScope: "rds",
		},
		{
			ProviderID: "aws", ServiceID: "ecs", Label: "ECS",
			Summary: "Container fleet inventory.",
			Detail:  "List ECS clusters, services, and tasks by region with Fargate and EC2 launch details.",
			Category: workspaceTabCategoryService, Domain: serviceDomainCompute,
			InventoryScope: "ecs",
		},
		{
			ProviderID: "aws", ServiceID: "eks", Label: "EKS",
			Summary: "Kubernetes cluster inventory.",
			Detail:  "List EKS clusters by region with version, endpoint, and managed node group summaries.",
			Category: workspaceTabCategoryService, Domain: serviceDomainCompute,
			InventoryScope: "eks",
		},
		{
			ProviderID: "aws", ServiceID: "cloudformation", Label: "CloudFormation",
			Summary: "Stack inventory and events.",
			Detail:  "List CloudFormation stacks by region with recent stack events.",
			Category: workspaceTabCategoryService, Domain: serviceDomainGovernance,
			InventoryScope: "cloudformation",
		},
		{
			ProviderID: "aws", ServiceID: "eventbridge", Label: "EventBridge",
			Summary: "Event bus and rule inventory.",
			Detail:  "List EventBridge buses by region with rules for the selected bus.",
			Category: workspaceTabCategoryService, Domain: serviceDomainIntegration,
			InventoryScope: "eventbridge",
		},
		{
			ProviderID: "aws", ServiceID: "route53", Label: "Route 53",
			Summary: "Hosted zone and record inventory.",
			Detail:  "List Route 53 hosted zones with record previews for the selected zone.",
			Category: workspaceTabCategoryService, Domain: serviceDomainNetwork,
			InventoryScope: "route53",
		},
		{
			ProviderID: "aws", ServiceID: "elb", Label: "Load Balancers",
			Summary: "Application and network load balancer inventory.",
			Detail:  "List ELBv2 load balancers by region with target group previews for the selected load balancer.",
			Category: workspaceTabCategoryService, Domain: serviceDomainNetwork,
			InventoryScope: "elb",
		},
		{
			ProviderID: "aws", ServiceID: "kms", Label: "KMS",
			Summary: "Encryption key and alias inventory.",
			Detail:  "List KMS keys by region with alias previews and metadata for the selected key.",
			Category: workspaceTabCategoryService, Domain: serviceDomainSecurity,
			InventoryScope: "kms",
		},
		{
			ProviderID: "aws", ServiceID: "apigateway", Label: "API Gateway",
			Summary: "REST and HTTP API inventory.",
			Detail:  "List REST and HTTP/WebSocket APIs by region with stage invoke URLs.",
			Category: workspaceTabCategoryService, Domain: serviceDomainNetwork,
			InventoryScope: "apigateway",
		},
		{
			ProviderID: "aws", ServiceID: "secrets", Label: "Secrets",
			Summary: "Secrets Manager inventory.",
			Detail:  "List secrets by region and reveal values when write mode is enabled.",
			Category: workspaceTabCategoryService, Domain: serviceDomainSecurity,
			InventoryScope: "secrets",
		},
		{
			ProviderID: "aws", ServiceID: "iam", Label: "IAM",
			Summary: "Role and policy inventory.",
			Detail:  "Inspect IAM roles and customer-managed policies created in this account.",
			Category: workspaceTabCategoryService, Domain: serviceDomainSecurity,
			InventoryScope: "iam",
		},
	}
}

func azureServiceCatalog() []serviceCatalogEntry {
	return []serviceCatalogEntry{
		{
			ProviderID: "azure", ServiceID: "azure-tools", Label: "Tools",
			Summary: "Operational workflows for Azure investigation and triage.",
			Detail:  "Launch WAF Security, Log Analytics, and Front Door tools from one place.",
			Category: workspaceTabCategoryTool,
		},
		{
			ProviderID: "azure", ServiceID: "azure-waf", Label: "WAF Security",
			Summary: "Front Door WAF investigation and policy workbench.",
			Detail:  "Overview dashboard, tracking-ref lookup, schema-aware KQL, and policy tuning.",
			Category: workspaceTabCategoryTool, InventoryScope: "waf",
		},
		{
			ProviderID: "azure", ServiceID: "azure-log-analytics", Label: "Log Analytics",
			Summary: "Run KQL queries against Log Analytics workspaces.",
			Detail:  "Query Azure Monitor logs with KQL, locally against floci-az or on a real Azure workspace.",
			Category: workspaceTabCategoryTool, InventoryScope: "loganalytics",
		},
		{
			ProviderID: "azure", ServiceID: "azure-front-door", Label: "Front Door",
			Summary: "Azure Front Door profile topology and access logs.",
			Detail:  "Browse profiles, endpoints, and origins read-only, jump to linked WAF policies, and run access-log KQL presets.",
			Category: workspaceTabCategoryTool, InventoryScope: "frontdoor",
		},
		{
			ProviderID: "azure", ServiceID: "azure-overview", Label: "Azure",
			Summary: "Subscription context and readiness.",
			Detail:  "Surfaces the open Azure subscription details and the next read-only inventory slices.",
			Category: workspaceTabCategoryService, Domain: serviceDomainGovernance,
		},
		{
			ProviderID: "azure", ServiceID: "azure-resource-groups", Label: "Resource Groups",
			Summary: "Read-only Azure resource group inventory.",
			Detail:  "Browse resource groups discovered for the open Azure subscription.",
			Category: workspaceTabCategoryService, Domain: serviceDomainGovernance,
		},
		{
			ProviderID: "azure", ServiceID: "azure-vms", Label: "Virtual Machines",
			Summary: "Read-only Azure virtual machine inventory.",
			Detail:  "Browse virtual machines for the selected Azure resource group.",
			Category: workspaceTabCategoryService, Domain: serviceDomainCompute,
		},
		{
			ProviderID: "azure", ServiceID: "azure-storage", Label: "Storage",
			Summary: "Blob storage accounts, containers, and objects.",
			Detail:  "Browse storage accounts and blob containers, upload and delete blobs when write mode is on.",
			Category: workspaceTabCategoryService, Domain: serviceDomainStorage,
			InventoryScope: "storage",
		},
		{
			ProviderID: "azure", ServiceID: "azure-app-service", Label: "App Service",
			Summary: "Cloud App Service web apps.",
			Detail:  "Browse and create App Service web apps on cloud Azure profiles. Not available on floci-az local.",
			Category: workspaceTabCategoryService, Domain: serviceDomainCompute,
			InventoryScope: "webapps",
		},
		{
			ProviderID: "azure", ServiceID: "azure-functions", Label: "Functions",
			Summary: "Browse and invoke Azure Functions.",
			Detail:  "List Function Apps and their functions, and invoke HTTP-triggered functions when write mode is on.",
			Category: workspaceTabCategoryService, Domain: serviceDomainCompute,
			InventoryScope: "functions",
		},
		{
			ProviderID: "azure", ServiceID: "azure-key-vault", Label: "Key Vault",
			Summary: "Browse and manage Key Vault secrets.",
			Detail:  "List vaults and secrets, reveal a secret value, and set secrets when write mode is on.",
			Category: workspaceTabCategoryService, Domain: serviceDomainSecurity,
			InventoryScope: "keyvault",
		},
		{
			ProviderID: "azure", ServiceID: "azure-cosmos", Label: "Cosmos DB",
			Summary: "Browse Cosmos DB databases, containers, and items.",
			Detail:  "Read-only browse of Cosmos SQL databases, containers, and a sample of documents.",
			Category: workspaceTabCategoryService, Domain: serviceDomainDatabase,
			InventoryScope: "cosmos",
		},
		{
			ProviderID: "azure", ServiceID: "azure-postgres", Label: "PostgreSQL",
			Summary: "Azure Database for PostgreSQL Flexible Servers.",
			Detail:  "List flexible servers and reveal connection strings. Backed by floci-az containers on local; read-only on cloud.",
			Category: workspaceTabCategoryService, Domain: serviceDomainDatabase,
			InventoryScope: "postgres",
		},
		{
			ProviderID: "azure", ServiceID: "azure-queues", Label: "Queues",
			Summary: "Browse storage queues and peek messages.",
			Detail:  "List storage account queues and peek messages without consuming them.",
			Category: workspaceTabCategoryService, Domain: serviceDomainStorage,
			InventoryScope: "queues",
		},
		{
			ProviderID: "azure", ServiceID: "azure-entra", Label: "Entra ID",
			Summary: "Browse directory users, groups, and app registrations.",
			Detail:  "Read-only directory browse on a cloud Azure profile. Not available on floci-az local.",
			Category: workspaceTabCategoryService, Domain: serviceDomainSecurity,
			InventoryScope: "entra",
		},
	}
}

func gcpServiceCatalog() []serviceCatalogEntry {
	return []serviceCatalogEntry{
		{
			ProviderID: "gcp", ServiceID: "gcp-overview", Label: "GCP",
			Summary: "Project context and readiness.",
			Detail:  "Surfaces the open GCP configuration details while provider-specific inventory is ported.",
			Category: workspaceTabCategoryWorkspace,
		},
		{
			ProviderID: "gcp", ServiceID: "gcp-storage", Label: "Cloud Storage",
			Summary: "GCS bucket and object inventory.",
			Detail:  "Planned for a future release once floci-gcp inventory is wired.",
			Category: workspaceTabCategoryComingSoon, Domain: serviceDomainStorage,
		},
		{
			ProviderID: "gcp", ServiceID: "gcp-compute", Label: "Compute Engine",
			Summary: "VM instance inventory.",
			Detail:  "Planned for a future release once floci-gcp inventory is wired.",
			Category: workspaceTabCategoryComingSoon, Domain: serviceDomainCompute,
		},
		{
			ProviderID: "gcp", ServiceID: "gcp-functions", Label: "Cloud Functions",
			Summary: "Function inventory and invoke.",
			Detail:  "Planned for a future release once floci-gcp inventory is wired.",
			Category: workspaceTabCategoryComingSoon, Domain: serviceDomainCompute,
		},
		{
			ProviderID: "gcp", ServiceID: "gcp-gke", Label: "GKE",
			Summary: "Kubernetes cluster inventory.",
			Detail:  "Planned for a future release once floci-gcp inventory is wired.",
			Category: workspaceTabCategoryComingSoon, Domain: serviceDomainCompute,
		},
	}
}

func serviceCatalogForProvider(providerID string) []serviceCatalogEntry {
	switch providerID {
	case "aws":
		return awsServiceCatalog()
	case "azure":
		return azureServiceCatalog()
	case "gcp":
		return gcpServiceCatalog()
	default:
		return nil
	}
}

func allServiceCatalogEntries() []serviceCatalogEntry {
	out := make([]serviceCatalogEntry, 0, 32)
	for _, providerID := range []string{"aws", "azure", "gcp"} {
		out = append(out, serviceCatalogForProvider(providerID)...)
	}
	return out
}

func catalogEntryToTab(entry serviceCatalogEntry) models.WorkspaceTab {
	return models.WorkspaceTab{
		TabID:    entry.ServiceID,
		Label:    entry.Label,
		Summary:  entry.Summary,
		Detail:   entry.Detail,
		Category: entry.Category,
		Domain:   entry.Domain,
	}
}

func catalogEntryToModel(entry serviceCatalogEntry, enabled bool) models.ServiceCatalogEntry {
	return models.ServiceCatalogEntry{
		ProviderID:     entry.ProviderID,
		ServiceID:      entry.ServiceID,
		Label:          entry.Label,
		Summary:        entry.Summary,
		Detail:         entry.Detail,
		Category:       entry.Category,
		Domain:         entry.Domain,
		InventoryScope: entry.InventoryScope,
		Enabled:        enabled,
	}
}

func knownCatalogServiceIDs() map[string]map[string]struct{} {
	known := map[string]map[string]struct{}{}
	for _, entry := range allServiceCatalogEntries() {
		if known[entry.ProviderID] == nil {
			known[entry.ProviderID] = map[string]struct{}{}
		}
		known[entry.ProviderID][entry.ServiceID] = struct{}{}
	}
	return known
}

func knownCatalogProviderIDs() map[string]struct{} {
	return map[string]struct{}{
		"aws":   {},
		"azure": {},
		"gcp":   {},
	}
}

func awsServiceIDForInventoryScope(scope string) string {
	for _, entry := range awsServiceCatalog() {
		if entry.InventoryScope == scope {
			return entry.ServiceID
		}
	}
	return scope
}

func azureServiceIDForInventoryScope(scope string) string {
	for _, entry := range azureServiceCatalog() {
		if entry.InventoryScope == scope {
			return entry.ServiceID
		}
	}
	return ""
}

func azureEnricherServiceIDs(enricherName string) []string {
	switch enricherName {
	case "inventory":
		return []string{"azure-overview", "azure-resource-groups", "azure-vms"}
	case "storage":
		return []string{"azure-storage"}
	case "log-analytics":
		return []string{"azure-log-analytics"}
	case "functions":
		return []string{"azure-functions"}
	case "keyvault":
		return []string{"azure-key-vault"}
	case "cosmos":
		return []string{"azure-cosmos"}
	case "postgres":
		return []string{"azure-postgres"}
	case "entra":
		return []string{"azure-entra"}
	case "app-service":
		return []string{"azure-app-service"}
	case "queues":
		return []string{"azure-queues"}
	case "waf":
		return []string{"azure-waf"}
	case "frontdoor":
		return []string{"azure-front-door"}
	default:
		return nil
	}
}

func awsInventoryScopesFromCatalog() map[string]struct{} {
	scopes := map[string]struct{}{}
	for _, entry := range awsServiceCatalog() {
		if entry.InventoryScope != "" {
			scopes[entry.InventoryScope] = struct{}{}
		}
	}
	return scopes
}
