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