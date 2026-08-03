// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package aws

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"cloudsprocket/backend/daemon/internal/app/sessionport"
	"cloudsprocket/backend/daemon/internal/discovery"
	"cloudsprocket/backend/daemon/internal/models"
)

// HandleEC2InvokeAction implements aws.ec2.invokeAction (queues an async job).
func (s *Service) HandleEC2InvokeAction(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	if s == nil || s.ec2Lifecycle == nil || s.session == nil {
		return nil, errors.New("aws write service is not available")
	}
	var request struct {
		Action     string `json:"action"`
		InstanceID string `json:"instanceId"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	session, err := s.session.Load(ctx, snapshot)
	if err != nil {
		return nil, err
	}
	profile, region, instanceID, err := ActiveEC2Selection(snapshot, session, request.InstanceID)
	if err != nil {
		return nil, err
	}
	if !WritesEnabled(session, profile) {
		return nil, errors.New("EC2 write actions require write mode to be enabled")
	}

	job := models.JobStatus{
		JobID:   s.newJobID(),
		Label:   "EC2 Action",
		Status:  "queued",
		Message: fmt.Sprintf("Queueing EC2 %s for %s in %s.", request.Action, instanceID, region),
	}
	if s.activity != nil {
		if err := s.activity.AppendActivity(ctx, notifier, "info", job.Message); err != nil {
			return nil, err
		}
	}
	go s.RunEC2Action(job, notifier, snapshot, session, profile, region, instanceID, request.Action)
	return job, nil
}

// HandleEC2TerminateInstances implements aws.ec2.terminateInstances (queues an async job).
func (s *Service) HandleEC2TerminateInstances(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	if s == nil || s.ec2Lifecycle == nil || s.session == nil {
		return nil, errors.New("aws write service is not available")
	}
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
	session, err := s.session.Load(ctx, snapshot)
	if err != nil {
		return nil, err
	}
	profile, region, instanceID, err := ActiveEC2Selection(snapshot, session, request.InstanceID)
	if err != nil {
		return nil, err
	}
	if !WritesEnabled(session, profile) {
		return nil, errors.New("EC2 terminate requires write mode to be enabled")
	}

	job := models.JobStatus{
		JobID:   s.newJobID(),
		Label:   "EC2 Terminate",
		Status:  "queued",
		Message: fmt.Sprintf("Queueing EC2 terminate for %s in %s.", instanceID, region),
	}
	if s.activity != nil {
		if err := s.activity.AppendActivity(ctx, notifier, "info", job.Message); err != nil {
			return nil, err
		}
	}
	go s.RunEC2Action(job, notifier, snapshot, session, profile, region, instanceID, "terminate")
	return job, nil
}

// RunEC2Action performs the async EC2 lifecycle job body.
func (s *Service) RunEC2Action(
	job models.JobStatus,
	notifier sessionport.Notifier,
	snapshot discovery.Snapshot,
	session models.SessionSnapshot,
	profile models.ProfileSummary,
	region string,
	instanceID string,
	action string,
) {
	background := context.Background()
	normalisedAction := strings.ToLower(strings.TrimSpace(action))
	runningMessage := fmt.Sprintf("Running EC2 %s for %s in %s.", normalisedAction, instanceID, region)
	if s.activity != nil {
		_ = s.activity.AppendActivity(background, notifier, "info", runningMessage)
	}
	s.notifyJob(notifier, models.JobStatus{
		JobID:   job.JobID,
		Label:   job.Label,
		Status:  "running",
		Message: runningMessage,
	})

	var err error
	switch normalisedAction {
	case "start":
		err = s.ec2Lifecycle.StartInstance(background, profile, region, instanceID)
	case "stop":
		err = s.ec2Lifecycle.StopInstance(background, profile, region, instanceID)
	case "reboot":
		err = s.ec2Lifecycle.RebootInstance(background, profile, region, instanceID)
	case "terminate":
		err = s.ec2Lifecycle.TerminateInstances(background, profile, region, instanceID)
	default:
		err = fmt.Errorf("EC2 action %q is not implemented", action)
	}
	if err != nil {
		failureMessage := fmt.Sprintf("EC2 %s failed for %s: %v", normalisedAction, instanceID, err)
		if s.activity != nil {
			_ = s.activity.AppendActivity(background, notifier, "error", failureMessage)
		}
		s.notifyJob(notifier, models.JobStatus{
			JobID:   job.JobID,
			Label:   job.Label,
			Status:  "failed",
			Message: failureMessage,
		})
		return
	}

	if s.invalidator != nil {
		s.invalidator.InvalidateResourceCache(background, "aws.ec2.instances", profile.ProfileID+"|"+region)
	}

	updated, saveErr := s.session.Update(background, snapshot, func(sess *models.SessionSnapshot) error {
		sess.SelectedEC2Region = region
		sess.SelectedEC2InstanceID = instanceID
		return nil
	})
	if saveErr != nil {
		s.notifyJob(notifier, models.JobStatus{
			JobID:   job.JobID,
			Label:   job.Label,
			Status:  "failed",
			Message: fmt.Sprintf("EC2 %s completed, but session state could not be saved: %v", normalisedAction, saveErr),
		})
		return
	}
	session = updated

	instances := s.waitForEC2ActionState(background, notifier, job, profile, region, instanceID, normalisedAction)
	finalState := SelectedEC2State(instances, instanceID)
	successMessage := fmt.Sprintf("EC2 %s completed for %s in %s.", normalisedAction, instanceID, region)
	if finalState != "" {
		desiredState := EC2DesiredState(normalisedAction)
		if desiredState != "" && finalState == desiredState {
			successMessage = fmt.Sprintf("%s Desired state reached: %s.", successMessage, finalState)
		} else {
			successMessage = fmt.Sprintf("%s Latest observed state: %s.", successMessage, finalState)
		}
	}

	// Job results replace the full desktop workspace on job.updated, so load all
	// AWS inventory. Skip Azure only (opposite cloud) to cut cost.
	var workspace models.WorkspaceSnapshot
	if s.workspace != nil {
		workspace = s.workspace.Build(background, snapshot, session, sessionport.SnapshotOptions{
			SkipAzureInventory: true,
		})
	}
	workspace.EC2Instances = instances
	workspace.SelectedEC2Region = region
	workspace.SelectedEC2InstanceID = instanceID
	if s.activity != nil {
		if err := s.activity.NotifyStateAndLog(background, snapshot, session, notifier, "success", successMessage); err != nil {
			s.notifyJob(notifier, models.JobStatus{
				JobID:   job.JobID,
				Label:   job.Label,
				Status:  "failed",
				Message: err.Error(),
			})
			return
		}
	}

	s.notifyJob(notifier, models.JobStatus{
		JobID:       job.JobID,
		Label:       job.Label,
		Status:      "completed",
		Message:     successMessage,
		CompletedAt: s.jobTimestamp(),
		Result:      workspace,
	})
}

func (s *Service) waitForEC2ActionState(
	ctx context.Context,
	notifier sessionport.Notifier,
	job models.JobStatus,
	profile models.ProfileSummary,
	region string,
	instanceID string,
	action string,
) []models.AwsEc2Instance {
	desiredState := EC2DesiredState(action)
	deadline := time.Now().Add(30 * time.Second)
	var instances []models.AwsEc2Instance
	for attempt := 1; ; attempt++ {
		if s.ec2Lifecycle != nil {
			listed, err := s.ec2Lifecycle.ListInstances(ctx, profile, region)
			if err == nil {
				instances = listed
			}
		}
		currentState := SelectedEC2State(instances, instanceID)
		if desiredState == "" || currentState == desiredState || time.Now().After(deadline) {
			return instances
		}
		s.notifyJob(notifier, models.JobStatus{
			JobID:   job.JobID,
			Label:   job.Label,
			Status:  "running",
			Message: fmt.Sprintf("Waiting for EC2 %s to reach %s. Current state: %s.", instanceID, desiredState, firstNonEmpty(currentState, "unknown")),
		})
		if attempt >= 15 {
			return instances
		}
		time.Sleep(2 * time.Second)
	}
}

// HandleRDSStartInstance implements aws.rds.startInstance (queues an async job).
func (s *Service) HandleRDSStartInstance(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	return s.handleRDSLifecycleInstance(ctx, params, notifier, "start")
}

// HandleRDSStopInstance implements aws.rds.stopInstance (queues an async job).
func (s *Service) HandleRDSStopInstance(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	return s.handleRDSLifecycleInstance(ctx, params, notifier, "stop")
}

func (s *Service) handleRDSLifecycleInstance(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier, action string) (any, error) {
	if s == nil || s.rdsLifecycle == nil || s.session == nil {
		return nil, errors.New("aws write service is not available")
	}
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
	session, err := s.session.Load(ctx, snapshot)
	if err != nil {
		return nil, err
	}
	profile, region, instanceID, err := ActiveRDSSelection(snapshot, session, request.InstanceID)
	if err != nil {
		return nil, err
	}
	if !WritesEnabled(session, profile) {
		return nil, errors.New("RDS lifecycle actions require write mode to be enabled")
	}

	job := models.JobStatus{
		JobID:   s.newJobID(),
		Label:   "RDS Action",
		Status:  "queued",
		Message: fmt.Sprintf("Queueing RDS %s for %s in %s.", action, instanceID, region),
	}
	if s.activity != nil {
		if err := s.activity.AppendActivity(ctx, notifier, "info", job.Message); err != nil {
			return nil, err
		}
	}
	go s.RunRDSAction(job, notifier, snapshot, session, profile, region, instanceID, action)
	return job, nil
}

// RunRDSAction performs the async RDS lifecycle job body.
func (s *Service) RunRDSAction(
	job models.JobStatus,
	notifier sessionport.Notifier,
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
	if s.activity != nil {
		_ = s.activity.AppendActivity(background, notifier, "info", runningMessage)
	}
	s.notifyJob(notifier, models.JobStatus{
		JobID:   job.JobID,
		Label:   job.Label,
		Status:  "running",
		Message: runningMessage,
	})

	var err error
	switch normalisedAction {
	case "start":
		err = s.rdsLifecycle.StartDBInstance(background, profile, region, instanceID)
	case "stop":
		err = s.rdsLifecycle.StopDBInstance(background, profile, region, instanceID)
	default:
		err = fmt.Errorf("RDS action %q is not implemented", action)
	}
	if err != nil {
		failureMessage := fmt.Sprintf("RDS %s failed for %s: %v", normalisedAction, instanceID, err)
		if s.activity != nil {
			_ = s.activity.AppendActivity(background, notifier, "error", failureMessage)
		}
		s.notifyJob(notifier, models.JobStatus{
			JobID:   job.JobID,
			Label:   job.Label,
			Status:  "failed",
			Message: failureMessage,
		})
		return
	}

	if s.invalidator != nil {
		s.invalidator.InvalidateResourceCache(background, "aws.rds.instances", profile.ProfileID+"|"+region)
	}

	updated, saveErr := s.session.Update(background, snapshot, func(sess *models.SessionSnapshot) error {
		sess.SelectedRDSRegion = region
		sess.SelectedRDSInstanceID = instanceID
		return nil
	})
	if saveErr != nil {
		s.notifyJob(notifier, models.JobStatus{
			JobID:   job.JobID,
			Label:   job.Label,
			Status:  "failed",
			Message: fmt.Sprintf("RDS %s completed, but session state could not be saved: %v", normalisedAction, saveErr),
		})
		return
	}
	session = updated

	successMessage := fmt.Sprintf("RDS %s completed for %s in %s.", normalisedAction, instanceID, region)
	var workspace models.WorkspaceSnapshot
	if s.workspace != nil {
		workspace = s.workspace.Build(background, snapshot, session, sessionport.SnapshotOptions{
			SkipAzureInventory: true,
		})
	}
	if s.rdsLifecycle != nil {
		if instances, listErr := s.rdsLifecycle.ListInstances(background, profile, region); listErr == nil {
			workspace.RDSInstances = instances
		}
	}
	workspace.SelectedRDSRegion = region
	workspace.SelectedRDSInstanceID = instanceID
	if s.activity != nil {
		if notifyErr := s.activity.NotifyStateAndLog(background, snapshot, session, notifier, "success", successMessage); notifyErr != nil {
			s.notifyJob(notifier, models.JobStatus{
				JobID:   job.JobID,
				Label:   job.Label,
				Status:  "failed",
				Message: notifyErr.Error(),
			})
			return
		}
	}

	s.notifyJob(notifier, models.JobStatus{
		JobID:       job.JobID,
		Label:       job.Label,
		Status:      "completed",
		Message:     successMessage,
		CompletedAt: s.jobTimestamp(),
		Result:      workspace,
	})
}
