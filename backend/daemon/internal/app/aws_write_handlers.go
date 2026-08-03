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
	// Job results replace the full desktop workspace on job.updated, so load all
	// AWS inventory. Skip Azure only (opposite cloud) to cut cost.
	workspace := s.buildWorkspaceSnapshotOpts(background, snapshot, session, workspaceSnapshotOptions{
		skipAzureInventory: true,
	})
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
