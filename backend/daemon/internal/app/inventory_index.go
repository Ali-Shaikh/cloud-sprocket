// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"sync/atomic"
	"time"

	"cloudsprocket/backend/daemon/internal/models"
)

var inventoryRunSequence atomic.Uint64

func (s *Service) indexWorkspaceSnapshot(ctx context.Context, workspace models.WorkspaceSnapshot) (models.InventoryRun, error) {
	run, resources, edges, ok := normaliseWorkspaceInventory(workspace, s.now().UTC())
	if !ok {
		return models.InventoryRun{}, nil
	}
	if err := s.store.ReplaceInventory(ctx, run, resources, edges); err != nil {
		return models.InventoryRun{}, err
	}
	return run, nil
}

func normaliseWorkspaceInventory(
	workspace models.WorkspaceSnapshot,
	now time.Time,
) (models.InventoryRun, []models.ResourceRecord, []models.ResourceEdge, bool) {
	if workspace.Provider == nil || workspace.Profile == nil {
		return models.InventoryRun{}, nil, nil, false
	}
	provider := strings.TrimSpace(workspace.Provider.ProviderID)
	profileID := strings.TrimSpace(workspace.Profile.ProfileID)
	if provider == "" || profileID == "" {
		return models.InventoryRun{}, nil, nil, false
	}

	timestamp := now.UTC().Format(time.RFC3339Nano)
	scopeID := provider + ":" + profileID
	run := models.InventoryRun{
		RunID:       fmt.Sprintf("%s:%d:%d", scopeID, now.UnixNano(), inventoryRunSequence.Add(1)),
		ScopeID:     scopeID,
		Provider:    provider,
		ProfileID:   profileID,
		StartedAt:   timestamp,
		CompletedAt: timestamp,
		Status:      "completed",
	}

	resources := []models.ResourceRecord{}
	edges := []models.ResourceEdge{}
	add := func(
		service string,
		resourceType string,
		identity string,
		name string,
		status string,
		region string,
		sourceRef string,
		tags map[string]string,
		attributes map[string]string,
	) string {
		if strings.TrimSpace(identity) == "" {
			return ""
		}
		id := canonicalResourceID(provider, scopeID, region, service, resourceType, identity)
		resources = append(resources, models.ResourceRecord{
			ID:          id,
			ScopeID:     scopeID,
			Provider:    provider,
			AccountID:   profileAccountID(*workspace.Profile),
			Region:      region,
			Service:     service,
			Type:        resourceType,
			Name:        firstNonEmptyValue(name, identity),
			Status:      status,
			Tags:        nonEmptyMap(tags),
			Attributes:  nonEmptyMap(attributes),
			SourceRef:   sourceRef,
			LastSeenAt:  timestamp,
			InventoryID: run.RunID,
		})
		return id
	}

	switch provider {
	case "aws":
		normaliseAWSResources(workspace, add)
	case "azure":
		edges = normaliseAzureResources(workspace, run, add)
	}

	run.ResourceCount = len(resources)
	run.EdgeCount = len(edges)
	return run, resources, edges, true
}

type addResourceFunc func(
	service string,
	resourceType string,
	identity string,
	name string,
	status string,
	region string,
	sourceRef string,
	tags map[string]string,
	attributes map[string]string,
) string

func normaliseAWSResources(workspace models.WorkspaceSnapshot, add addResourceFunc) {
	for _, bucket := range workspace.S3Buckets {
		add("s3", "bucket", bucket.Name, bucket.Name, "", "", "arn:aws:s3:::"+bucket.Name, nil, map[string]string{
			"createdAt": bucket.CreatedAt,
			"summary":   bucket.Summary,
		})
	}
	for _, instance := range workspace.EC2Instances {
		add("ec2", "instance", instance.InstanceID, firstNonEmptyValue(instance.Name, instance.InstanceID), instance.State, workspace.SelectedEC2Region, instance.InstanceID, detailFieldsMap(instance.Tags), map[string]string{
			"instanceType":     instance.InstanceType,
			"availabilityZone": instance.AvailabilityZone,
			"publicIp":         instance.PublicIP,
			"privateIp":        instance.PrivateIP,
			"vpcId":            instance.VpcID,
			"subnetId":         instance.SubnetID,
			"architecture":     instance.Architecture,
		})
	}
	for _, function := range workspace.LambdaFunctions {
		add("lambda", "function", function.FunctionName, function.FunctionName, function.State, workspace.SelectedLambdaRegion, "", nil, map[string]string{
			"runtime":      function.Runtime,
			"handler":      function.Handler,
			"logGroup":     function.LogGroup,
			"lastModified": function.LastModified,
			"memorySize":   int32String(function.MemorySize),
			"timeout":      int32String(function.Timeout),
		})
	}
	for _, table := range workspace.DynamoDBTables {
		add("dynamodb", "table", table.TableName, table.TableName, table.Status, workspace.SelectedDynamoDBRegion, "", nil, map[string]string{
			"billingMode":    table.BillingMode,
			"hashKey":        table.HashKey,
			"rangeKey":       table.RangeKey,
			"itemCount":      strconv.FormatInt(table.ItemCount, 10),
			"tableSizeBytes": strconv.FormatInt(table.TableSizeBytes, 10),
		})
	}
	for _, queue := range workspace.SQSQueues {
		add("sqs", "queue", queue.QueueURL, queue.QueueName, "", workspace.SelectedSQSRegion, firstNonEmptyValue(queue.QueueArn, queue.QueueURL), nil, map[string]string{
			"visibleMessages":  strconv.FormatInt(queue.ApproximateNumberOfMessages, 10),
			"inFlightMessages": strconv.FormatInt(queue.ApproximateNumberOfMessagesNotVisible, 10),
		})
	}
	for _, topic := range workspace.SNSTopics {
		add("sns", "topic", topic.TopicArn, topic.TopicName, "", workspace.SelectedSNSRegion, topic.TopicArn, nil, map[string]string{
			"displayName":            topic.DisplayName,
			"subscriptionsConfirmed": topic.SubscriptionsConfirmed,
			"subscriptionsPending":   topic.SubscriptionsPending,
		})
	}
	for _, database := range workspace.RDSInstances {
		add("rds", "db-instance", database.DBInstanceIdentifier, database.DBInstanceIdentifier, database.Status, workspace.SelectedRDSRegion, "", nil, map[string]string{
			"engine":           database.Engine,
			"engineVersion":    database.EngineVersion,
			"instanceClass":    database.InstanceClass,
			"availabilityZone": database.AvailabilityZone,
			"multiAz":          strconv.FormatBool(database.MultiAZ),
			"storageEncrypted": strconv.FormatBool(database.StorageEncrypted),
		})
	}
	for _, group := range workspace.LogGroups {
		add("cloudwatch-logs", "log-group", group.LogGroupName, group.LogGroupName, "", workspace.SelectedLogsRegion, group.Arn, nil, map[string]string{
			"storedBytes":     strconv.FormatInt(group.StoredBytes, 10),
			"retentionInDays": int32String(group.RetentionInDays),
		})
	}
	for _, role := range workspace.IAMRoles {
		add("iam", "role", role.RoleName, role.RoleName, "", "", role.RoleArn, nil, map[string]string{
			"path":             role.Path,
			"description":      role.Description,
			"createDate":       role.CreateDate,
			"attachedPolicies": strings.Join(role.AttachedPolicies, ","),
		})
	}
	for _, policy := range workspace.IAMPolicies {
		add("iam", "policy", policy.PolicyName, policy.PolicyName, "", "", policy.PolicyArn, nil, map[string]string{
			"attachmentCount": int32String(policy.AttachmentCount),
			"updateDate":      policy.UpdateDate,
		})
	}
}

func normaliseAzureResources(
	workspace models.WorkspaceSnapshot,
	run models.InventoryRun,
	add addResourceFunc,
) []models.ResourceEdge {
	edges := []models.ResourceEdge{}
	resourceGroups := map[string]string{}
	addContainedBy := func(sourceID string, resourceGroup string) {
		targetID := resourceGroups[strings.ToLower(resourceGroup)]
		if sourceID == "" || targetID == "" {
			return
		}
		edges = append(edges, models.ResourceEdge{
			ScopeID:     run.ScopeID,
			SourceID:    sourceID,
			TargetID:    targetID,
			Kind:        "contained-by",
			Confidence:  "exact",
			Evidence:    "Azure resourceGroup field",
			LastSeenAt:  run.CompletedAt,
			InventoryID: run.RunID,
		})
	}

	for _, group := range workspace.AzureResourceGroups {
		id := add("resources", "resource-group", group.Name, group.Name, group.ProvisioningState, group.Location, "", detailFieldsMap(group.Tags), map[string]string{
			"managedBy": group.ManagedBy,
		})
		resourceGroups[strings.ToLower(group.Name)] = id
	}
	for _, virtualMachine := range workspace.AzureVirtualMachines {
		id := add("compute", "virtual-machine", virtualMachine.VMID, virtualMachine.Name, firstNonEmptyValue(virtualMachine.PowerState, virtualMachine.ProvisioningState), virtualMachine.Location, virtualMachine.VMID, detailFieldsMap(virtualMachine.Tags), map[string]string{
			"resourceGroup": virtualMachine.ResourceGroup,
			"size":          virtualMachine.Size,
			"osType":        virtualMachine.OSType,
			"publicIp":      virtualMachine.PublicIP,
			"privateIp":     virtualMachine.PrivateIP,
		})
		addContainedBy(id, virtualMachine.ResourceGroup)
	}
	for _, account := range workspace.AzureStorageAccounts {
		add("storage", "storage-account", account.Name, account.Name, "", account.Location, "", nil, map[string]string{
			"kind":         account.Kind,
			"blobEndpoint": account.BlobEndpoint,
			"summary":      account.Summary,
		})
	}
	planIDs := map[string]string{}
	for _, plan := range workspace.AzureAppServicePlans {
		id := add("app-service", "plan", plan.ResourceGroup+"/"+plan.Name, plan.Name, plan.Status, plan.Location, "", nil, map[string]string{
			"resourceGroup":   plan.ResourceGroup,
			"sku":             plan.SKU,
			"kind":            plan.Kind,
			"numberOfWorkers": strconv.Itoa(plan.NumberOfWorkers),
		})
		planIDs[strings.ToLower(plan.ResourceGroup+"/"+plan.Name)] = id
		addContainedBy(id, plan.ResourceGroup)
	}
	for _, webApp := range workspace.AzureWebApps {
		id := add("app-service", "web-app", webApp.ResourceGroup+"/"+webApp.Name, webApp.Name, webApp.State, webApp.Location, "", nil, map[string]string{
			"resourceGroup":  webApp.ResourceGroup,
			"hostName":       webApp.DefaultHostName,
			"kind":           webApp.Kind,
			"httpsOnly":      strconv.FormatBool(webApp.HTTPSOnly),
			"appServicePlan": webApp.AppServicePlan,
			"planSku":        webApp.PlanSKU,
			"runtime":        webApp.Runtime,
			"identityType":   webApp.IdentityType,
		})
		addContainedBy(id, webApp.ResourceGroup)
		if targetID := planIDs[strings.ToLower(webApp.ResourceGroup+"/"+webApp.AppServicePlan)]; targetID != "" {
			edges = append(edges, exactEdge(run, id, targetID, "runs-on", "Azure appServicePlan field"))
		}
	}
	for _, logWorkspace := range workspace.AzureLogAnalyticsWorkspaces {
		id := add("monitor", "log-analytics-workspace", logWorkspace.ResourceGroup+"/"+logWorkspace.Name, logWorkspace.Name, "", logWorkspace.Location, logWorkspace.CustomerID, nil, map[string]string{
			"resourceGroup": logWorkspace.ResourceGroup,
		})
		addContainedBy(id, logWorkspace.ResourceGroup)
	}
	for _, policy := range workspace.AzureWafPolicies {
		status := "disabled"
		if policy.Enabled {
			status = "enabled"
		}
		id := add("front-door", "waf-policy", policy.ResourceGroup+"/"+policy.Name, policy.Name, status, policy.Location, "", nil, map[string]string{
			"resourceGroup": policy.ResourceGroup,
			"sku":           policy.SKU,
			"mode":          policy.Mode,
			"enabled":       strconv.FormatBool(policy.Enabled),
		})
		addContainedBy(id, policy.ResourceGroup)
	}
	for _, functionApp := range workspace.AzureFunctionApps {
		id := add("functions", "function-app", functionApp.ResourceGroup+"/"+functionApp.Name, functionApp.Name, functionApp.State, functionApp.Location, "", nil, map[string]string{
			"resourceGroup": functionApp.ResourceGroup,
			"hostName":      functionApp.DefaultHostName,
			"runtime":       functionApp.Runtime,
		})
		addContainedBy(id, functionApp.ResourceGroup)
	}
	for _, vault := range workspace.AzureKeyVaults {
		id := add("key-vault", "vault", vault.ResourceGroup+"/"+vault.Name, vault.Name, "", vault.Location, vault.VaultURI, nil, map[string]string{
			"resourceGroup": vault.ResourceGroup,
		})
		addContainedBy(id, vault.ResourceGroup)
	}
	for _, account := range workspace.AzureCosmosAccounts {
		id := add("cosmos-db", "account", account.ResourceGroup+"/"+account.Name, account.Name, "", "", account.DocumentEndpoint, nil, map[string]string{
			"resourceGroup": account.ResourceGroup,
		})
		addContainedBy(id, account.ResourceGroup)
	}
	for _, queue := range workspace.AzureStorageQueues {
		identity := workspace.SelectedAzureStorageAccount + "/" + queue.Name
		add("storage", "queue", identity, queue.Name, "", "", "", nil, map[string]string{
			"storageAccount": workspace.SelectedAzureStorageAccount,
		})
	}
	return edges
}

func exactEdge(run models.InventoryRun, sourceID string, targetID string, kind string, evidence string) models.ResourceEdge {
	return models.ResourceEdge{
		ScopeID:     run.ScopeID,
		SourceID:    sourceID,
		TargetID:    targetID,
		Kind:        kind,
		Confidence:  "exact",
		Evidence:    evidence,
		LastSeenAt:  run.CompletedAt,
		InventoryID: run.RunID,
	}
}

func canonicalResourceID(provider string, scopeID string, region string, service string, resourceType string, identity string) string {
	parts := []string{scopeID, firstNonEmptyValue(region, "global"), service, resourceType, identity}
	for index := range parts {
		parts[index] = url.PathEscape(parts[index])
	}
	return provider + "://" + strings.Join(parts, "/")
}

func detailFieldsMap(fields []models.DetailField) map[string]string {
	result := map[string]string{}
	for _, field := range fields {
		if field.Sensitive || strings.TrimSpace(field.Label) == "" || strings.TrimSpace(field.Value) == "" {
			continue
		}
		result[field.Label] = field.Value
	}
	return result
}

func nonEmptyMap(values map[string]string) map[string]string {
	result := map[string]string{}
	for key, value := range values {
		if strings.TrimSpace(value) != "" {
			result[key] = value
		}
	}
	return result
}

func int32String(value int32) string {
	return strconv.FormatInt(int64(value), 10)
}

func firstNonEmptyValue(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

// Some current Azure storage adapter summaries include the resource group as
// "Resource group: name". Keep this parser narrow and add a native field to
// the model later rather than inferring from arbitrary text.
func profileAccountID(profile models.ProfileSummary) string {
	for _, field := range profile.Attributes {
		label := strings.NewReplacer(" ", "", "_", "", "-", "").Replace(strings.ToLower(field.Label))
		switch label {
		case "accountid", "ssoaccountid", "subscriptionid", "projectid":
			if value := strings.TrimSpace(field.Value); value != "" && !field.Sensitive {
				return value
			}
		}
	}
	return profile.ProfileID
}
