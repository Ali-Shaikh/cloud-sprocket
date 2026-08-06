// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"strings"

	"cloudsprocket/backend/daemon/internal/models"
)

func awsActionGate(
	session models.SessionSnapshot,
	profile models.ProfileSummary,
) (enabled bool, reason string) {
	if !session.AWSWriteModeEnabled {
		return false, awsWriteModeRequiredMessage
	}
	_ = profile
	return true, ""
}

func awsActionCapability(
	session models.SessionSnapshot,
	profile models.ProfileSummary,
	actionID string,
	label string,
) models.ActionCapability {
	enabled, reason := awsActionGate(session, profile)
	return models.ActionCapability{
		ActionID: actionID,
		Label:    label,
		Enabled:  enabled,
		Reason:   reason,
	}
}

func azureActionGate(
	session models.SessionSnapshot,
	profile models.ProfileSummary,
	providerCommandPath string,
) (enabled bool, reason string) {
	if !profileAllowsAzureWrites(profile, providerCommandPath) {
		return false, "This profile does not support write mode. Use a local floci-az profile or an Azure CLI profile with write access."
	}
	if !session.AzureWriteModeEnabled {
		return false, "Turn on write mode from the top bar to run mutating actions."
	}
	return true, ""
}

func azureActionCapability(
	session models.SessionSnapshot,
	profile models.ProfileSummary,
	providerCommandPath string,
	actionID string,
	label string,
) models.ActionCapability {
	enabled, reason := azureActionGate(session, profile, providerCommandPath)
	return models.ActionCapability{
		ActionID: actionID,
		Label:    label,
		Enabled:  enabled,
		Reason:   reason,
	}
}

func buildAWSActionCapabilities(
	session models.SessionSnapshot,
	profile models.ProfileSummary,
) map[string][]models.ActionCapability {
	return map[string][]models.ActionCapability{
		"s3": {
			awsActionCapability(session, profile, "uploadObject", "Upload object"),
			awsActionCapability(session, profile, "deleteObject", "Delete object"),
			awsActionCapability(session, profile, "createBucket", "Create bucket"),
			awsActionCapability(session, profile, "copyObject", "Copy object"),
			awsActionCapability(session, profile, "createFolderPrefix", "Create folder prefix"),
		},
		"ec2": {
			awsActionCapability(session, profile, "start", "Start instance"),
			awsActionCapability(session, profile, "stop", "Stop instance"),
			awsActionCapability(session, profile, "reboot", "Reboot instance"),
			awsActionCapability(session, profile, "runInstances", "Launch instance"),
			awsActionCapability(session, profile, "terminateInstances", "Terminate instance"),
		},
		"lambda": {
			awsActionCapability(session, profile, "invoke", "Invoke function"),
			awsActionCapability(session, profile, "create", "Create function"),
			awsActionCapability(session, profile, "deleteFunction", "Delete function"),
		},
		"sqs": {
			awsActionCapability(session, profile, "peek", "Peek messages"),
			awsActionCapability(session, profile, "sendMessage", "Send message"),
			awsActionCapability(session, profile, "createQueue", "Create queue"),
			awsActionCapability(session, profile, "purgeQueue", "Purge queue"),
		},
		"sns": {
			awsActionCapability(session, profile, "publish", "Publish message"),
			awsActionCapability(session, profile, "createTopic", "Create topic"),
			awsActionCapability(session, profile, "createSubscription", "Create subscription"),
		},
		"dynamodb": {
			awsActionCapability(session, profile, "putItem", "Put item"),
			awsActionCapability(session, profile, "deleteItem", "Delete item"),
		},
		"secrets": {
			awsActionCapability(session, profile, "reveal", "Reveal secret value"),
		},
		"rds": {
			awsActionCapability(session, profile, "startInstance", "Start instance"),
			awsActionCapability(session, profile, "stopInstance", "Stop instance"),
			awsActionCapability(session, profile, "rebootInstance", "Reboot instance"),
		},
		"logs": {
			awsActionCapability(session, profile, "createLogGroup", "Create log group"),
			awsActionCapability(session, profile, "putLogEvents", "Inject test event"),
		},
		"iam": {
			awsActionCapability(session, profile, "createRole", "Create role"),
		},
		"ecs": {
			awsActionCapability(session, profile, "forceNewDeployment", "Force new deployment"),
			awsActionCapability(session, profile, "updateDesiredCount", "Update desired count"),
		},
	}
}

func buildAzureActionCapabilities(
	session models.SessionSnapshot,
	profile models.ProfileSummary,
	providerCommandPath string,
) map[string][]models.ActionCapability {
	cap := func(actionID, label string) models.ActionCapability {
		return azureActionCapability(session, profile, providerCommandPath, actionID, label)
	}
	return map[string][]models.ActionCapability{
		"resourceGroups": {
			cap("createResourceGroup", "Create resource group"),
			cap("deleteResourceGroup", "Delete resource group"),
		},
		"compute": {
			cap("startVm", "Start VM"),
			cap("stopVm", "Stop VM"),
			cap("deallocateVm", "Deallocate VM"),
			cap("restartVm", "Restart VM"),
		},
		"storage": {
			cap("createAccount", "Create storage account"),
			cap("createContainer", "Create container"),
			cap("uploadBlob", "Upload blob"),
			cap("deleteBlob", "Delete blob"),
			cap("copyBlob", "Copy blob"),
			cap("createFolderPrefix", "Create folder prefix"),
		},
		"functions": {
			cap("invoke", "Invoke function"),
		},
		"keyvault": {
			cap("setSecret", "Set secret"),
		},
		"postgres": {
			cap("startServer", "Start server"),
			cap("stopServer", "Stop server"),
		},
		"appService": {
			cap("createWebApp", "Create web app"),
			cap("lifecycleAction", "Lifecycle action"),
			cap("setSetting", "Set app setting"),
			cap("deleteSetting", "Delete app setting"),
			cap("createSlot", "Create deployment slot"),
			cap("swapSlot", "Swap deployment slot"),
		},
		"waf": {
			cap("setMode", "Change WAF mode"),
			cap("toggleRule", "Toggle managed rule"),
			cap("addExclusion", "Add exclusion"),
			cap("removeExclusion", "Remove exclusion"),
		},
		"frontDoor": {
			cap("purgeCache", "Purge cache"),
		},
		"queues": {
			cap("purge", "Purge queue"),
		},
		"cosmos": {
			cap("deleteItem", "Delete item"),
		},
	}
}

const gcpWriteModeRequiredMessage = "Turn on write mode from the top bar to run mutating actions."

func gcpActionGate(
	session models.SessionSnapshot,
	profile models.ProfileSummary,
) (enabled bool, reason string) {
	if !session.GcpWriteModeEnabled {
		return false, gcpWriteModeRequiredMessage
	}
	_ = profile
	return true, ""
}

func gcpActionCapability(
	session models.SessionSnapshot,
	profile models.ProfileSummary,
	actionID string,
	label string,
) models.ActionCapability {
	enabled, reason := gcpActionGate(session, profile)
	return models.ActionCapability{
		ActionID: actionID,
		Label:    label,
		Enabled:  enabled,
		Reason:   reason,
	}
}

func buildGcpActionCapabilities(
	session models.SessionSnapshot,
	profile models.ProfileSummary,
) map[string][]models.ActionCapability {
	return map[string][]models.ActionCapability{
		"storage": {
			gcpActionCapability(session, profile, "uploadObject", "Upload object"),
			gcpActionCapability(session, profile, "deleteObject", "Delete object"),
		},
		"compute": {
			gcpActionCapability(session, profile, "startInstance", "Start instance"),
			gcpActionCapability(session, profile, "stopInstance", "Stop instance"),
		},
		"functions": {
			gcpActionCapability(session, profile, "invoke", "Invoke function"),
		},
	}
}

// effectiveGcpWritesEnabled reports whether GCP mutating actions may run.
func effectiveGcpWritesEnabled(session models.SessionSnapshot, _ models.ProfileSummary) bool {
	return session.IsLocked && session.GcpWriteModeEnabled
}

// gcpWriteTargetSummary labels the active gcloud configuration/project for write dialogs.
func gcpWriteTargetSummary(profile models.ProfileSummary) string {
	project := ""
	configName := strings.TrimSpace(profile.ProfileID)
	for _, field := range profile.Attributes {
		label := strings.TrimSpace(field.Label)
		if strings.EqualFold(label, "Project") {
			project = strings.TrimSpace(field.Value)
		}
		if strings.EqualFold(label, "Configuration") && strings.TrimSpace(field.Value) != "" {
			configName = strings.TrimSpace(field.Value)
		}
	}
	if project != "" && configName != "" {
		return configName + " · project " + project
	}
	if project != "" {
		return "project " + project
	}
	if configName != "" {
		return configName
	}
	if display := strings.TrimSpace(profile.DisplayName); display != "" {
		return display
	}
	return "gcloud"
}
