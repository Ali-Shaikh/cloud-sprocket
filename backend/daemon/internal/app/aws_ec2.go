// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"cloudsprocket/backend/daemon/internal/discovery"
	"cloudsprocket/backend/daemon/internal/models"
)

func (s *Service) activeEC2Selection(
	snapshot discovery.Snapshot,
	session models.SessionSnapshot,
	instanceIDOverride string,
) (models.ProfileSummary, string, string, error) {
	if !session.IsLocked || session.CurrentProviderID != "aws" {
		return models.ProfileSummary{}, "", "", errors.New("open an AWS workspace before using EC2 actions")
	}
	profile, ok := findProfile(filterProfiles(snapshot.Profiles, session.CurrentProviderID), session.SelectedProfileID)
	if !ok {
		return models.ProfileSummary{}, "", "", errors.New("the workspace's AWS profile is not available")
	}
	regions := s.ec2Regions(context.Background(), profile)
	region := s.selectedEC2Region(session, regions, profile)
	if region == "" {
		return models.ProfileSummary{}, "", "", errors.New("select an EC2 region before using this action")
	}
	instanceID := strings.TrimSpace(instanceIDOverride)
	if instanceID == "" {
		instanceID = session.SelectedEC2InstanceID
	}
	if instanceID == "" {
		instanceID = s.selectedEC2InstanceID(session, s.ec2Instances(context.Background(), profile, region))
	}
	if instanceID == "" {
		return models.ProfileSummary{}, "", "", errors.New("select an EC2 instance before using this action")
	}
	return profile, region, instanceID, nil
}

func (s *Service) ec2Regions(ctx context.Context, profile models.ProfileSummary) []string {
	const scope = "aws.ec2.regions"
	queryHash := profile.ProfileID

	var cached []string
	if _, ok, _ := s.loadCachedResource(ctx, scope, queryHash, &cached); ok && len(cached) > 0 {
		return cached
	}

	regions, err := s.ec2.ListRegions(ctx, profile)
	if err == nil && len(regions) > 0 {
		_ = s.saveResourceCacheWithTTL(ctx, scope, queryHash, regions)
		return regions
	}

	_, ok, cacheErr := s.store.LoadResourceCache(ctx, scope, queryHash, &cached)
	if cacheErr == nil && ok && len(cached) > 0 {
		return cached
	}

	if hint := profileRegionHint(profile); hint != "" {
		return []string{hint}
	}
	return []string{}
}

func (s *Service) selectedEC2Region(
	session models.SessionSnapshot,
	regions []string,
	profile models.ProfileSummary,
) string {
	if session.SelectedEC2Region != "" {
		for _, region := range regions {
			if region == session.SelectedEC2Region {
				return session.SelectedEC2Region
			}
		}
	}
	hint := profileRegionHint(profile)
	for _, region := range regions {
		if region == hint {
			return hint
		}
	}
	if len(regions) == 0 {
		return ""
	}
	return regions[0]
}

func (s *Service) ec2Instances(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
) []models.AwsEc2Instance {
	if region == "" {
		return []models.AwsEc2Instance{}
	}

	const scope = "aws.ec2.instances"
	queryHash := profile.ProfileID + "|" + region

	var cached []models.AwsEc2Instance
	if _, ok, _ := s.loadCachedResource(ctx, scope, queryHash, &cached); ok {
		return cached
	}

	instances, err := s.ec2.ListInstances(ctx, profile, region)
	if err == nil {
		_ = s.saveResourceCacheWithTTL(ctx, scope, queryHash, instances)
		return instances
	}

	_, ok, cacheErr := s.store.LoadResourceCache(ctx, scope, queryHash, &cached)
	if cacheErr == nil && ok {
		return cached
	}

	return []models.AwsEc2Instance{}
}

func (s *Service) selectedEC2InstanceID(
	session models.SessionSnapshot,
	instances []models.AwsEc2Instance,
) string {
	if session.SelectedEC2InstanceID != "" {
		for _, instance := range instances {
			if instance.InstanceID == session.SelectedEC2InstanceID {
				return session.SelectedEC2InstanceID
			}
		}
	}
	if len(instances) == 0 {
		return ""
	}
	return instances[0].InstanceID
}

func (s *Service) enrichEC2Inventory(
	workspace *models.WorkspaceSnapshot,
	session models.SessionSnapshot,
	opts awsEnrichmentOptions,
	mu *sync.Mutex,
) {
	if workspace.Provider == nil ||
		workspace.Provider.ProviderID != "aws" ||
		workspace.Profile == nil ||
		s.ec2 == nil {
		return
	}
	timeoutCtx, cancel := s.withAWSTimeout(context.Background())
	regions := s.ec2Regions(timeoutCtx, *workspace.Profile)
	cancel()
	selectedRegion := s.selectedEC2Region(session, regions, *workspace.Profile)

	if opts.lightweight {
		status := "No EC2 region is available for this AWS workspace."
		if selectedRegion != "" {
			status = fmt.Sprintf("Loaded %d region(s). Select %s to browse instances.", len(regions), selectedRegion)
		} else if len(regions) > 0 {
			status = fmt.Sprintf("Loaded %d region(s). Select a region to browse instances.", len(regions))
		}
		lockWorkspace(mu, func() {
			workspace.EC2Regions = regions
			workspace.SelectedEC2Region = selectedRegion
			workspace.EC2Instances = []models.AwsEc2Instance{}
			workspace.SelectedEC2InstanceID = ""
			workspace.EC2StatusMessage = status
		})
		return
	}

	timeoutCtx, cancel = s.withAWSTimeout(context.Background())
	instances := s.ec2Instances(timeoutCtx, *workspace.Profile, selectedRegion)
	cancel()
	selectedInstance := s.selectedEC2InstanceID(session, instances)

	status := "No EC2 region is available for this AWS workspace."
	if selectedRegion != "" {
		if len(instances) == 0 {
			status = fmt.Sprintf("No EC2 instances were returned for %s.", selectedRegion)
		} else {
			status = fmt.Sprintf("Loaded %d EC2 instances from %s.", len(instances), selectedRegion)
		}
	}

	lockWorkspace(mu, func() {
		workspace.EC2Regions = regions
		workspace.SelectedEC2Region = selectedRegion
		workspace.EC2Instances = instances
		workspace.SelectedEC2InstanceID = selectedInstance
		workspace.EC2StatusMessage = status
	})
}

// lambdaRegions reuses the EC2 region list for an AWS profile (single source of
// truth for account regions, cheap, avoids duplicating the DescribeRegions call).

func (s *Service) runEC2Action(
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
	runningMessage := fmt.Sprintf("Running EC2 %s for %s in %s.", normalisedAction, instanceID, region)
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
		err = s.ec2.StartInstance(background, profile, region, instanceID)
	case "stop":
		err = s.ec2.StopInstance(background, profile, region, instanceID)
	case "reboot":
		err = s.ec2.RebootInstance(background, profile, region, instanceID)
	case "terminate":
		err = s.ec2.TerminateInstances(background, profile, region, instanceID)
	default:
		err = fmt.Errorf("EC2 action %q is not implemented", action)
	}
	if err != nil {
		failureMessage := fmt.Sprintf("EC2 %s failed for %s: %v", normalisedAction, instanceID, err)
		_ = s.appendActivity(background, notifier, "error", failureMessage)
		s.notifyJob(notifier, models.JobStatus{
			JobID:   job.JobID,
			Label:   job.Label,
			Status:  "failed",
			Message: failureMessage,
		})
		return
	}

	s.invalidateResourceCache(background, "aws.ec2.instances", profile.ProfileID+"|"+region)

	session.SelectedEC2Region = region
	session.SelectedEC2InstanceID = instanceID
	s.mu.Lock()
	if saveErr := s.store.SaveSession(background, session); saveErr != nil {
		s.mu.Unlock()
		s.notifyJob(notifier, models.JobStatus{
			JobID:   job.JobID,
			Label:   job.Label,
			Status:  "failed",
			Message: fmt.Sprintf("EC2 %s completed, but session state could not be saved: %v", normalisedAction, saveErr),
		})
		return
	}
	s.mu.Unlock()

	instances := s.waitForEC2ActionState(background, notifier, job, profile, region, instanceID, normalisedAction)
	finalState := selectedEC2State(instances, instanceID)
	successMessage := fmt.Sprintf("EC2 %s completed for %s in %s.", normalisedAction, instanceID, region)
	if finalState != "" {
		desiredState := ec2DesiredState(normalisedAction)
		if desiredState != "" && finalState == desiredState {
			successMessage = fmt.Sprintf("%s Desired state reached: %s.", successMessage, finalState)
		} else {
			successMessage = fmt.Sprintf("%s Latest observed state: %s.", successMessage, finalState)
		}
	}

	// Job results replace the full desktop workspace on job.updated, so load all
	// AWS inventory. Skip Azure only (opposite cloud) to cut cost.
	workspace := s.buildWorkspaceSnapshotOpts(background, snapshot, session, workspaceSnapshotOptions{
		skipAzureInventory: true,
	})
	workspace.EC2Instances = instances
	workspace.SelectedEC2Region = region
	workspace.SelectedEC2InstanceID = instanceID
	err = s.notifyStateAndLog(background, snapshot, session, notifier, "success", successMessage)
	if err != nil {
		s.notifyJob(notifier, models.JobStatus{
			JobID:   job.JobID,
			Label:   job.Label,
			Status:  "failed",
			Message: err.Error(),
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

func (s *Service) waitForEC2ActionState(
	ctx context.Context,
	notifier Notifier,
	job models.JobStatus,
	profile models.ProfileSummary,
	region string,
	instanceID string,
	action string,
) []models.AwsEc2Instance {
	desiredState := ec2DesiredState(action)
	deadline := time.Now().Add(30 * time.Second)
	var instances []models.AwsEc2Instance
	for attempt := 1; ; attempt++ {
		instances = s.ec2Instances(ctx, profile, region)
		currentState := selectedEC2State(instances, instanceID)
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

func (s *Service) handleAwsEc2InvokeAction(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
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
		return nil, errors.New("EC2 write actions require write mode to be enabled")
	}
	s.mu.Unlock()

	job := models.JobStatus{
		JobID:   fmt.Sprintf("job-%d", s.now().UnixNano()),
		Label:   "EC2 Action",
		Status:  "queued",
		Message: fmt.Sprintf("Queueing EC2 %s for %s in %s.", request.Action, instanceID, region),
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
	go s.runEC2Action(job, notifier, snapshot, session, profile, region, instanceID, request.Action)
	return job, nil
}
