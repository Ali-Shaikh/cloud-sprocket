// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"cloudsprocket/backend/daemon/internal/discovery"
	"cloudsprocket/backend/daemon/internal/models"
)

func (s *Service) activeS3ObjectSelection(
	snapshot discovery.Snapshot,
	session models.SessionSnapshot,
	objectKeyOverride string,
) (models.ProfileSummary, string, string, error) {
	profile, bucketName, err := s.activeS3Selection(snapshot, session, true)
	if err != nil {
		return models.ProfileSummary{}, "", "", err
	}
	objectKey := strings.TrimSpace(objectKeyOverride)
	if objectKey == "" {
		objectKey = session.SelectedS3ObjectKey
	}
	if objectKey == "" {
		objectKey = s.selectedS3ObjectKey(session, s.s3Objects(context.Background(), profile, bucketName, session.S3PrefixFilter))
	}
	if objectKey == "" {
		return models.ProfileSummary{}, "", "", errors.New("select an S3 object before using this action")
	}
	return profile, bucketName, objectKey, nil
}

func (s *Service) activeRDSSelection(
	snapshot discovery.Snapshot,
	session models.SessionSnapshot,
	instanceIDOverride string,
) (models.ProfileSummary, string, string, error) {
	if !session.IsLocked || session.CurrentProviderID != "aws" {
		return models.ProfileSummary{}, "", "", errors.New("open an AWS workspace before using RDS actions")
	}
	profile, ok := findProfile(filterProfiles(snapshot.Profiles, session.CurrentProviderID), session.SelectedProfileID)
	if !ok {
		return models.ProfileSummary{}, "", "", errors.New("the workspace's AWS profile is not available")
	}
	regions := s.rdsRegions(context.Background(), profile)
	region := s.selectedRDSRegion(session, regions, profile)
	if region == "" {
		return models.ProfileSummary{}, "", "", errors.New("select an RDS region before using this action")
	}
	instanceID := strings.TrimSpace(instanceIDOverride)
	if instanceID == "" {
		instanceID = session.SelectedRDSInstanceID
	}
	if instanceID == "" {
		instanceID = s.selectedRDSInstanceID(session, s.rdsInstances(context.Background(), profile, region))
	}
	if instanceID == "" {
		return models.ProfileSummary{}, "", "", errors.New("select an RDS instance before using this action")
	}
	return profile, region, instanceID, nil
}

func (s *Service) activeLogsRegion(
	snapshot discovery.Snapshot,
	session models.SessionSnapshot,
) (models.ProfileSummary, string, error) {
	if !session.IsLocked || session.CurrentProviderID != "aws" {
		return models.ProfileSummary{}, "", errors.New("open an AWS workspace before using CloudWatch Logs actions")
	}
	profile, ok := findProfile(filterProfiles(snapshot.Profiles, session.CurrentProviderID), session.SelectedProfileID)
	if !ok {
		return models.ProfileSummary{}, "", errors.New("the workspace's AWS profile is not available")
	}
	regions := s.logsRegions(context.Background(), profile)
	region := s.selectedLogsRegion(session, regions, profile)
	if region == "" {
		return models.ProfileSummary{}, "", errors.New("select a CloudWatch Logs region before using this action")
	}
	return profile, region, nil
}

func (s *Service) handleAwsS3DeleteObject(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		ObjectKey string `json:"objectKey"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	profile, bucketName, objectKey, err := s.authorizeAWSWriteSelection(
		ctx, snapshot,
		"S3 delete requires write mode to be enabled",
		func(snap discovery.Snapshot, session models.SessionSnapshot) (models.ProfileSummary, string, string, error) {
			return s.activeS3ObjectSelection(snap, session, request.ObjectKey)
		},
	)
	if err != nil {
		return nil, err
	}
	prefix := ""
	s.mu.Lock()
	session, sessionErr := s.currentState(ctx, snapshot)
	if sessionErr == nil {
		prefix = session.S3PrefixFilter
	}
	s.mu.Unlock()

	actionCtx, cancel := s.withAWSTimeout(ctx)
	_, err = s.s3.DeleteObject(actionCtx, profile, bucketName, objectKey)
	cancel()
	if err != nil {
		return nil, err
	}
	s.invalidateResourceCache(ctx, "aws.s3.objects", profile.ProfileID+"|"+bucketName+"|"+prefix)
	s.invalidateResourceCache(ctx, "aws.s3.object-metadata", profile.ProfileID+"|"+bucketName+"|"+objectKey)

	return s.finishAWSWriteAction(
		ctx, snapshot, notifier, "s3",
		fmt.Sprintf("Deleted object %s from bucket %s.", objectKey, bucketName),
		func(session *models.SessionSnapshot) {
			if session.SelectedS3ObjectKey == objectKey {
				session.SelectedS3ObjectKey = ""
			}
		},
	)
}

func (s *Service) handleAwsS3CreateBucket(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		BucketName string `json:"bucketName"`
		Region     string `json:"region"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	bucketName := strings.TrimSpace(request.BucketName)
	if bucketName == "" {
		return nil, errors.New("bucket name is required")
	}
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	_, profile, err := s.authorizeAWSWrite(
		ctx, snapshot,
		"open an AWS workspace before creating an S3 bucket",
		"S3 create requires write mode to be enabled",
	)
	if err != nil {
		return nil, err
	}
	region := strings.TrimSpace(request.Region)
	if region == "" {
		region = profileRegionHint(profile)
	}

	actionCtx, cancel := s.withAWSTimeout(ctx)
	created, err := s.s3.CreateBucket(actionCtx, profile, bucketName, region)
	cancel()
	if err != nil {
		return nil, err
	}
	s.invalidateResourceCache(ctx, "aws.s3.buckets", profile.ProfileID)

	return s.finishAWSWriteAction(
		ctx, snapshot, notifier, "s3",
		fmt.Sprintf("Created S3 bucket %s in %s.", created.BucketName, created.Region),
		func(session *models.SessionSnapshot) {
			session.SelectedS3BucketName = created.BucketName
			session.SelectedS3ObjectKey = ""
		},
	)
}

func (s *Service) handleAwsEc2RunInstances(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		InstanceType string `json:"instanceType"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	session, profile, err := s.authorizeAWSWrite(
		ctx, snapshot,
		"open an AWS workspace before launching EC2 instances",
		"EC2 launch requires write mode to be enabled",
	)
	if err != nil {
		return nil, err
	}
	regions := s.ec2Regions(context.Background(), profile)
	region := s.selectedEC2Region(session, regions, profile)
	if region == "" {
		return nil, errors.New("select an EC2 region before launching instances")
	}

	actionCtx, cancel := s.withAWSTimeout(ctx)
	launched, err := s.ec2.RunInstances(actionCtx, profile, region, request.InstanceType)
	cancel()
	if err != nil {
		return nil, err
	}
	s.invalidateResourceCache(ctx, "aws.ec2.instances", profile.ProfileID+"|"+region)

	return s.finishAWSWriteAction(
		ctx, snapshot, notifier, "ec2",
		launched.Summary,
		func(session *models.SessionSnapshot) {
			session.SelectedEC2Region = region
			session.SelectedEC2InstanceID = launched.InstanceID
		},
	)
}

func (s *Service) handleAwsEc2TerminateInstances(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		InstanceID string `json:"instanceId"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	s.mu.Lock()
	session, err := s.currentState(ctx, snapshot)
	if err != nil {
		s.mu.Unlock()
		return nil, err
	}
	profile, region, instanceID, err := s.activeEC2Selection(snapshot, session, request.InstanceID)
	if err != nil {
		s.mu.Unlock()
		return nil, err
	}
	if !effectiveAWSWritesEnabled(session, profile) {
		s.mu.Unlock()
		return nil, errors.New("EC2 terminate requires write mode to be enabled")
	}
	s.mu.Unlock()

	job := models.JobStatus{
		JobID:   fmt.Sprintf("job-%d", s.now().UnixNano()),
		Label:   "EC2 Terminate",
		Status:  "queued",
		Message: fmt.Sprintf("Queueing EC2 terminate for %s in %s.", instanceID, region),
	}
	entry, err := s.store.AppendLog(ctx, "info", job.Message, "", s.timestamp())
	if err != nil {
		return nil, err
	}
	if notifier != nil {
		if err := notifier.Notify("log.appended", entry); err != nil {
			return nil, err
		}
	}
	go s.runEC2Action(job, notifier, snapshot, session, profile, region, instanceID, "terminate")
	return job, nil
}

func (s *Service) handleAwsLambdaDeleteFunction(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		FunctionName string `json:"functionName"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	profile, region, functionName, err := s.authorizeAWSWriteSelection(
		ctx, snapshot,
		"Lambda delete requires write mode to be enabled",
		func(snap discovery.Snapshot, session models.SessionSnapshot) (models.ProfileSummary, string, string, error) {
			return s.activeLambdaSelection(snap, session, request.FunctionName)
		},
	)
	if err != nil {
		return nil, err
	}

	actionCtx, cancel := s.withAWSTimeout(ctx)
	result, err := s.lambda.DeleteFunction(actionCtx, profile, region, functionName)
	cancel()
	if err != nil {
		return nil, err
	}
	s.invalidateResourceCache(ctx, "aws.lambda.functions", profile.ProfileID+"|"+region)

	return s.finishAWSWriteAction(
		ctx, snapshot, notifier, "lambda",
		result.Summary,
		func(session *models.SessionSnapshot) {
			if session.SelectedLambdaFunctionName == functionName {
				session.SelectedLambdaFunctionName = ""
			}
		},
	)
}

func (s *Service) handleAwsRdsLifecycleInstance(ctx context.Context, params json.RawMessage, notifier Notifier, action string) (any, error) {
	var request struct {
		InstanceID string `json:"instanceId"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	s.mu.Lock()
	session, err := s.currentState(ctx, snapshot)
	if err != nil {
		s.mu.Unlock()
		return nil, err
	}
	profile, region, instanceID, err := s.activeRDSSelection(snapshot, session, request.InstanceID)
	if err != nil {
		s.mu.Unlock()
		return nil, err
	}
	if !effectiveAWSWritesEnabled(session, profile) {
		s.mu.Unlock()
		return nil, errors.New("RDS lifecycle actions require write mode to be enabled")
	}
	s.mu.Unlock()

	job := models.JobStatus{
		JobID:   fmt.Sprintf("job-%d", s.now().UnixNano()),
		Label:   "RDS Action",
		Status:  "queued",
		Message: fmt.Sprintf("Queueing RDS %s for %s in %s.", action, instanceID, region),
	}
	entry, err := s.store.AppendLog(ctx, "info", job.Message, "", s.timestamp())
	if err != nil {
		return nil, err
	}
	if notifier != nil {
		if err := notifier.Notify("log.appended", entry); err != nil {
			return nil, err
		}
	}
	go s.runRDSAction(job, notifier, snapshot, session, profile, region, instanceID, action)
	return job, nil
}

func (s *Service) handleAwsRdsStartInstance(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	return s.handleAwsRdsLifecycleInstance(ctx, params, notifier, "start")
}

func (s *Service) handleAwsRdsStopInstance(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	return s.handleAwsRdsLifecycleInstance(ctx, params, notifier, "stop")
}

func (s *Service) handleAwsLogsCreateLogGroup(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		LogGroupName string `json:"logGroupName"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	logGroupName := strings.TrimSpace(request.LogGroupName)
	if logGroupName == "" {
		return nil, errors.New("log group name is required")
	}
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	session, profile, err := s.authorizeAWSWrite(
		ctx, snapshot,
		"open an AWS workspace before creating a log group",
		"CloudWatch Logs create requires write mode to be enabled",
	)
	if err != nil {
		return nil, err
	}
	_, region, regionErr := s.activeLogsRegion(snapshot, session)
	if regionErr != nil {
		return nil, regionErr
	}

	actionCtx, cancel := s.withAWSTimeout(ctx)
	created, err := s.logs.CreateLogGroup(actionCtx, profile, region, logGroupName)
	cancel()
	if err != nil {
		return nil, err
	}
	s.invalidateResourceCache(ctx, "aws.logs.groups", profile.ProfileID+"|"+region)

	return s.finishAWSWriteAction(
		ctx, snapshot, notifier, "logs",
		fmt.Sprintf("Created log group %s in %s.", created.LogGroupName, created.Region),
		func(session *models.SessionSnapshot) {
			session.SelectedLogGroupName = created.LogGroupName
		},
	)
}

func (s *Service) handleAwsLogsPutLogEvents(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		LogGroupName string `json:"logGroupName"`
		Message      string `json:"message"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	logGroupName := strings.TrimSpace(request.LogGroupName)
	if logGroupName == "" {
		return nil, errors.New("log group name is required")
	}
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	session, profile, err := s.authorizeAWSWrite(
		ctx, snapshot,
		"open an AWS workspace before injecting log events",
		"CloudWatch Logs put requires write mode to be enabled",
	)
	if err != nil {
		return nil, err
	}
	_, region, regionErr := s.activeLogsRegion(snapshot, session)
	if regionErr != nil {
		return nil, regionErr
	}

	actionCtx, cancel := s.withAWSTimeout(ctx)
	result, err := s.logs.PutLogEvents(actionCtx, profile, region, logGroupName, request.Message)
	cancel()
	if err != nil {
		return nil, err
	}
	return result, nil
}

func (s *Service) handleAwsIamCreateRole(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		RoleName string `json:"roleName"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	roleName := strings.TrimSpace(request.RoleName)
	if roleName == "" {
		return nil, errors.New("role name is required")
	}
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	_, profile, err := s.authorizeAWSWrite(
		ctx, snapshot,
		"open an AWS workspace before creating an IAM role",
		"IAM create requires write mode to be enabled",
	)
	if err != nil {
		return nil, err
	}
	region := profileRegionHint(profile)

	actionCtx, cancel := s.withAWSTimeout(ctx)
	created, err := s.iam.CreateRole(actionCtx, profile, region, roleName)
	cancel()
	if err != nil {
		return nil, err
	}
	s.invalidateResourceCache(ctx, "aws.iam.roles", profile.ProfileID+"|"+region)

	return s.finishAWSWriteAction(
		ctx, snapshot, notifier, "iam",
		fmt.Sprintf("Created IAM role %s.", created.RoleName),
		func(session *models.SessionSnapshot) {
			session.SelectedIAMRoleName = created.RoleName
		},
	)
}

func (s *Service) runRDSAction(
	job models.JobStatus,
	notifier Notifier,
	snapshot discovery.Snapshot,
	session models.SessionSnapshot,
	profile models.ProfileSummary,
	region string,
	instanceID string,
	action string,
) {
	background := context.Background()
	normalisedAction := strings.ToLower(strings.TrimSpace(action))
	runningMessage := fmt.Sprintf("Running RDS %s for %s in %s.", normalisedAction, instanceID, region)
	_ = s.appendActivity(background, notifier, "info", runningMessage)
	s.notifyJob(notifier, models.JobStatus{
		JobID:   job.JobID,
		Label:   job.Label,
		Status:  "running",
		Message: runningMessage,
	})

	var err error
	switch normalisedAction {
	case "start":
		err = s.rds.StartDBInstance(background, profile, region, instanceID)
	case "stop":
		err = s.rds.StopDBInstance(background, profile, region, instanceID)
	default:
		err = fmt.Errorf("RDS action %q is not implemented", action)
	}
	if err != nil {
		failureMessage := fmt.Sprintf("RDS %s failed for %s: %v", normalisedAction, instanceID, err)
		_ = s.appendActivity(background, notifier, "error", failureMessage)
		s.notifyJob(notifier, models.JobStatus{
			JobID:   job.JobID,
			Label:   job.Label,
			Status:  "failed",
			Message: failureMessage,
		})
		return
	}

	s.invalidateResourceCache(background, "aws.rds.instances", profile.ProfileID+"|"+region)

	session.SelectedRDSRegion = region
	session.SelectedRDSInstanceID = instanceID
	s.mu.Lock()
	if saveErr := s.store.SaveSession(background, session); saveErr != nil {
		s.mu.Unlock()
		s.notifyJob(notifier, models.JobStatus{
			JobID:   job.JobID,
			Label:   job.Label,
			Status:  "failed",
			Message: fmt.Sprintf("RDS %s completed, but session state could not be saved: %v", normalisedAction, saveErr),
		})
		return
	}
	s.mu.Unlock()

	successMessage := fmt.Sprintf("RDS %s completed for %s in %s.", normalisedAction, instanceID, region)
	workspace := s.buildWorkspaceSnapshot(snapshot, session)
	workspace.RDSInstances = s.rdsInstances(background, profile, region)
	workspace.SelectedRDSRegion = region
	workspace.SelectedRDSInstanceID = instanceID
	if notifyErr := s.notifyStateAndLog(background, snapshot, session, notifier, "success", successMessage); notifyErr != nil {
		s.notifyJob(notifier, models.JobStatus{
			JobID:   job.JobID,
			Label:   job.Label,
			Status:  "failed",
			Message: notifyErr.Error(),
		})
		return
	}

	s.notifyJob(notifier, models.JobStatus{
		JobID:       job.JobID,
		Label:       job.Label,
		Status:      "completed",
		Message:     successMessage,
		CompletedAt: s.timestamp(),
		Result:      workspace,
	})
}