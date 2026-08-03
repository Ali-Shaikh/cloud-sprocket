// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package aws

import (
	"errors"
	"strings"

	"cloudsprocket/backend/daemon/internal/discovery"
	"cloudsprocket/backend/daemon/internal/models"
)

// ActiveSQSSelection resolves profile/region/queue for SQS actions.
func ActiveSQSSelection(
	snapshot discovery.Snapshot,
	session models.SessionSnapshot,
	requestQueueURL string,
) (models.ProfileSummary, string, string, error) {
	profile, err := LockedAWSProfile(snapshot.Profiles, session, "open an AWS workspace before using SQS actions")
	if err != nil {
		return models.ProfileSummary{}, "", "", err
	}
	region := session.SelectedSQSRegion
	if region == "" {
		region = ProfileRegionHint(profile)
	}
	queueURL := strings.TrimSpace(requestQueueURL)
	if queueURL == "" {
		queueURL = session.SelectedSQSQueueURL
	}
	if queueURL == "" {
		return models.ProfileSummary{}, "", "", errors.New("select an SQS queue before using this action")
	}
	return profile, region, queueURL, nil
}

// ActiveSNSSelection resolves profile/region/topic for SNS actions.
func ActiveSNSSelection(
	snapshot discovery.Snapshot,
	session models.SessionSnapshot,
	requestTopicArn string,
) (models.ProfileSummary, string, string, error) {
	profile, err := LockedAWSProfile(snapshot.Profiles, session, "open an AWS workspace before using SNS actions")
	if err != nil {
		return models.ProfileSummary{}, "", "", err
	}
	region := session.SelectedSNSRegion
	if region == "" {
		region = ProfileRegionHint(profile)
	}
	topicArn := strings.TrimSpace(requestTopicArn)
	if topicArn == "" {
		topicArn = session.SelectedSNSTopicArn
	}
	if topicArn == "" {
		return models.ProfileSummary{}, "", "", errors.New("select an SNS topic before using this action")
	}
	return profile, region, topicArn, nil
}

// ActiveDynamoDBSelection resolves profile/region/table for DynamoDB actions.
func ActiveDynamoDBSelection(
	snapshot discovery.Snapshot,
	session models.SessionSnapshot,
	requestTableName string,
) (models.ProfileSummary, string, string, error) {
	profile, err := LockedAWSProfile(snapshot.Profiles, session, "open an AWS workspace before using DynamoDB actions")
	if err != nil {
		return models.ProfileSummary{}, "", "", err
	}
	region := session.SelectedDynamoDBRegion
	if region == "" {
		region = ProfileRegionHint(profile)
	}
	tableName := strings.TrimSpace(requestTableName)
	if tableName == "" {
		tableName = session.SelectedDynamoDBTableName
	}
	if tableName == "" {
		return models.ProfileSummary{}, "", "", errors.New("select a DynamoDB table before using this action")
	}
	return profile, region, tableName, nil
}
