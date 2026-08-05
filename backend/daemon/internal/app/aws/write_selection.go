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

// ActiveS3Bucket resolves profile and bucket from the locked session.
// It does not list inventory; the workspace selection is required when requireBucket is true.
func ActiveS3Bucket(
	snapshot discovery.Snapshot,
	session models.SessionSnapshot,
	requireBucket bool,
) (models.ProfileSummary, string, error) {
	profile, err := LockedAWSProfile(snapshot.Profiles, session, "open an AWS workspace before using S3 actions")
	if err != nil {
		return models.ProfileSummary{}, "", err
	}
	bucketName := strings.TrimSpace(session.SelectedS3BucketName)
	if requireBucket && bucketName == "" {
		return models.ProfileSummary{}, "", errors.New("select an S3 bucket before using this action")
	}
	return profile, bucketName, nil
}

// ActiveS3ObjectSelection resolves profile/bucket/object for S3 object actions.
func ActiveS3ObjectSelection(
	snapshot discovery.Snapshot,
	session models.SessionSnapshot,
	objectKeyOverride string,
) (models.ProfileSummary, string, string, error) {
	profile, bucketName, err := ActiveS3Bucket(snapshot, session, true)
	if err != nil {
		return models.ProfileSummary{}, "", "", err
	}
	objectKey := strings.TrimSpace(objectKeyOverride)
	if objectKey == "" {
		objectKey = strings.TrimSpace(session.SelectedS3ObjectKey)
	}
	if objectKey == "" {
		return models.ProfileSummary{}, "", "", errors.New("select an S3 object before using this action")
	}
	return profile, bucketName, objectKey, nil
}

// ActiveLambdaRegion resolves profile/region for Lambda actions from session.
func ActiveLambdaRegion(
	snapshot discovery.Snapshot,
	session models.SessionSnapshot,
) (models.ProfileSummary, string, error) {
	profile, err := LockedAWSProfile(snapshot.Profiles, session, "open an AWS workspace before using Lambda actions")
	if err != nil {
		return models.ProfileSummary{}, "", err
	}
	region := strings.TrimSpace(session.SelectedLambdaRegion)
	if region == "" {
		region = ProfileRegionHint(profile)
	}
	if region == "" {
		return models.ProfileSummary{}, "", errors.New("select a Lambda region before using this action")
	}
	return profile, region, nil
}

// ActiveLambdaSelection resolves profile/region/function for Lambda actions.
func ActiveLambdaSelection(
	snapshot discovery.Snapshot,
	session models.SessionSnapshot,
	functionNameOverride string,
) (models.ProfileSummary, string, string, error) {
	profile, region, err := ActiveLambdaRegion(snapshot, session)
	if err != nil {
		return models.ProfileSummary{}, "", "", err
	}
	functionName := strings.TrimSpace(functionNameOverride)
	if functionName == "" {
		functionName = strings.TrimSpace(session.SelectedLambdaFunctionName)
	}
	if functionName == "" {
		return models.ProfileSummary{}, "", "", errors.New("select a Lambda function before using this action")
	}
	return profile, region, functionName, nil
}

// ActiveLogsRegion resolves profile/region for CloudWatch Logs actions from session.
func ActiveLogsRegion(
	snapshot discovery.Snapshot,
	session models.SessionSnapshot,
) (models.ProfileSummary, string, error) {
	profile, err := LockedAWSProfile(snapshot.Profiles, session, "open an AWS workspace before using CloudWatch Logs actions")
	if err != nil {
		return models.ProfileSummary{}, "", err
	}
	region := strings.TrimSpace(session.SelectedLogsRegion)
	if region == "" {
		region = ProfileRegionHint(profile)
	}
	if region == "" {
		return models.ProfileSummary{}, "", errors.New("select a CloudWatch Logs region before using this action")
	}
	return profile, region, nil
}

// ActiveEC2Region resolves the EC2 region from session selection or profile hint.
func ActiveEC2Region(session models.SessionSnapshot, profile models.ProfileSummary) (string, error) {
	region := strings.TrimSpace(session.SelectedEC2Region)
	if region == "" {
		region = ProfileRegionHint(profile)
	}
	if region == "" {
		return "", errors.New("select an EC2 region before launching instances")
	}
	return region, nil
}

// ActiveEC2Selection resolves profile/region/instance for EC2 lifecycle jobs.
func ActiveEC2Selection(
	snapshot discovery.Snapshot,
	session models.SessionSnapshot,
	instanceIDOverride string,
) (models.ProfileSummary, string, string, error) {
	profile, err := LockedAWSProfile(snapshot.Profiles, session, "open an AWS workspace before using EC2 actions")
	if err != nil {
		return models.ProfileSummary{}, "", "", err
	}
	region := strings.TrimSpace(session.SelectedEC2Region)
	if region == "" {
		region = ProfileRegionHint(profile)
	}
	if region == "" {
		return models.ProfileSummary{}, "", "", errors.New("select an EC2 region before using this action")
	}
	instanceID := strings.TrimSpace(instanceIDOverride)
	if instanceID == "" {
		instanceID = strings.TrimSpace(session.SelectedEC2InstanceID)
	}
	if instanceID == "" {
		return models.ProfileSummary{}, "", "", errors.New("select an EC2 instance before using this action")
	}
	return profile, region, instanceID, nil
}

// ActiveRDSSelection resolves profile/region/instance for RDS lifecycle jobs.
func ActiveRDSSelection(
	snapshot discovery.Snapshot,
	session models.SessionSnapshot,
	instanceIDOverride string,
) (models.ProfileSummary, string, string, error) {
	profile, err := LockedAWSProfile(snapshot.Profiles, session, "open an AWS workspace before using RDS actions")
	if err != nil {
		return models.ProfileSummary{}, "", "", err
	}
	region := strings.TrimSpace(session.SelectedRDSRegion)
	if region == "" {
		region = ProfileRegionHint(profile)
	}
	if region == "" {
		return models.ProfileSummary{}, "", "", errors.New("select an RDS region before using this action")
	}
	instanceID := strings.TrimSpace(instanceIDOverride)
	if instanceID == "" {
		instanceID = strings.TrimSpace(session.SelectedRDSInstanceID)
	}
	if instanceID == "" {
		return models.ProfileSummary{}, "", "", errors.New("select an RDS instance before using this action")
	}
	return profile, region, instanceID, nil
}

// ActiveECSServiceSelection resolves profile/region/cluster/service for ECS write actions.
func ActiveECSServiceSelection(
	snapshot discovery.Snapshot,
	session models.SessionSnapshot,
	clusterArnOverride string,
	serviceArnOverride string,
) (models.ProfileSummary, string, string, string, error) {
	profile, err := LockedAWSProfile(snapshot.Profiles, session, "open an AWS workspace before using ECS actions")
	if err != nil {
		return models.ProfileSummary{}, "", "", "", err
	}
	region := strings.TrimSpace(session.SelectedECSRegion)
	if region == "" {
		region = ProfileRegionHint(profile)
	}
	if region == "" {
		return models.ProfileSummary{}, "", "", "", errors.New("select an ECS region before using this action")
	}
	clusterArn := strings.TrimSpace(clusterArnOverride)
	if clusterArn == "" {
		clusterArn = strings.TrimSpace(session.SelectedECSClusterArn)
	}
	if clusterArn == "" {
		return models.ProfileSummary{}, "", "", "", errors.New("select an ECS cluster before using this action")
	}
	serviceArn := strings.TrimSpace(serviceArnOverride)
	if serviceArn == "" {
		serviceArn = strings.TrimSpace(session.SelectedECSServiceArn)
	}
	if serviceArn == "" {
		return models.ProfileSummary{}, "", "", "", errors.New("select an ECS service before using this action")
	}
	return profile, region, clusterArn, serviceArn, nil
}
