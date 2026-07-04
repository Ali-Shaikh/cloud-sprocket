// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import "cloudsprocket/backend/daemon/internal/models"

func awsActionGate(
	session models.SessionSnapshot,
	profile models.ProfileSummary,
) (enabled bool, reason string) {
	if !profileAllowsAWSWrites(profile) {
		return false, "This profile does not support write mode. Use a local endpoint profile with cloudsprocket_allow_writes enabled."
	}
	if !session.AWSWriteModeEnabled {
		return false, "Turn on write mode from the top bar to run mutating actions."
	}
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
		},
		"ec2": {
			awsActionCapability(session, profile, "start", "Start instance"),
			awsActionCapability(session, profile, "stop", "Stop instance"),
			awsActionCapability(session, profile, "reboot", "Reboot instance"),
		},
		"lambda": {
			awsActionCapability(session, profile, "invoke", "Invoke function"),
			awsActionCapability(session, profile, "create", "Create function"),
		},
		"sqs": {
			awsActionCapability(session, profile, "peek", "Peek messages"),
			awsActionCapability(session, profile, "sendMessage", "Send message"),
			awsActionCapability(session, profile, "createQueue", "Create queue"),
		},
		"sns": {
			awsActionCapability(session, profile, "publish", "Publish message"),
			awsActionCapability(session, profile, "createTopic", "Create topic"),
		},
		"dynamodb": {
			awsActionCapability(session, profile, "putItem", "Put item"),
			awsActionCapability(session, profile, "deleteItem", "Delete item"),
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
		},
		"functions": {
			cap("invoke", "Invoke function"),
		},
		"keyvault": {
			cap("setSecret", "Set secret"),
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
	}
}