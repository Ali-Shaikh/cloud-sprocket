// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"

	"cloudsprocket/backend/daemon/internal/models"
)

func (s *Service) enrichCloudFormationInventory(
	workspace *models.WorkspaceSnapshot,
	session models.SessionSnapshot,
	opts awsEnrichmentOptions,
	mu *sync.Mutex,
) {
	if workspace.Provider == nil ||
		workspace.Provider.ProviderID != "aws" ||
		workspace.Profile == nil ||
		s.cloudformation == nil {
		return
	}
	timeoutCtx, cancel := s.withAWSTimeout(context.Background())
	regions := s.cloudFormationRegions(timeoutCtx, *workspace.Profile)
	cancel()
	selectedRegion := s.selectedCloudFormationRegion(session, regions, *workspace.Profile)

	if opts.lightweight {
		status := "No region is available for CloudFormation stacks in this AWS workspace."
		if selectedRegion != "" {
			status = fmt.Sprintf("Loaded %d region(s). Select %s to browse stacks.", len(regions), selectedRegion)
		} else if len(regions) > 0 {
			status = fmt.Sprintf("Loaded %d region(s). Select a region to browse stacks.", len(regions))
		}
		lockWorkspace(mu, func() {
			workspace.CloudFormationRegions = regions
			workspace.SelectedCloudFormationRegion = selectedRegion
			workspace.CloudFormationStacks = []models.AwsCloudFormationStack{}
			workspace.CloudFormationStackEvents = []models.AwsCloudFormationStackEvent{}
			workspace.SelectedCloudFormationStackName = ""
			workspace.CloudFormationStatusMessage = status
		})
		return
	}

	timeoutCtx, cancel = s.withAWSTimeout(context.Background())
	stacks := s.cloudFormationStacks(timeoutCtx, *workspace.Profile, selectedRegion)
	cancel()
	selectedStack := s.selectedCloudFormationStackName(session, stacks)
	stackEvents := []models.AwsCloudFormationStackEvent{}
	if selectedStack != "" {
		timeoutCtx, cancel = s.withAWSTimeout(context.Background())
		stackEvents = s.cloudFormationStackEvents(timeoutCtx, *workspace.Profile, selectedRegion, selectedStack)
		cancel()
	}

	status := "No region is available for CloudFormation stacks in this AWS workspace."
	if selectedRegion != "" {
		if len(stacks) == 0 {
			status = fmt.Sprintf("No CloudFormation stacks were returned for %s.", selectedRegion)
		} else if selectedStack == "" {
			status = fmt.Sprintf("Loaded %d CloudFormation stacks from %s.", len(stacks), selectedRegion)
		} else {
			status = fmt.Sprintf(
				"Loaded %d stacks and %d recent events from %s.",
				len(stacks),
				len(stackEvents),
				selectedRegion,
			)
		}
	}

	lockWorkspace(mu, func() {
		workspace.CloudFormationRegions = regions
		workspace.SelectedCloudFormationRegion = selectedRegion
		workspace.CloudFormationStacks = stacks
		workspace.CloudFormationStackEvents = stackEvents
		workspace.SelectedCloudFormationStackName = selectedStack
		workspace.CloudFormationStatusMessage = status
	})
}

func (s *Service) cloudFormationRegions(ctx context.Context, profile models.ProfileSummary) []string {
	return s.lambdaRegions(ctx, profile)
}

func (s *Service) selectedCloudFormationRegion(
	session models.SessionSnapshot,
	regions []string,
	profile models.ProfileSummary,
) string {
	if session.SelectedCloudFormationRegion != "" {
		for _, region := range regions {
			if region == session.SelectedCloudFormationRegion {
				return session.SelectedCloudFormationRegion
			}
		}
	}
	return s.selectedRDSRegion(session, regions, profile)
}

func (s *Service) cloudFormationStacks(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
) []models.AwsCloudFormationStack {
	if region == "" {
		return []models.AwsCloudFormationStack{}
	}
	const scope = "aws.cloudformation.stacks"
	queryHash := profile.ProfileID + "|" + region

	var cached []models.AwsCloudFormationStack
	if _, ok, _ := s.loadCachedResource(ctx, scope, queryHash, &cached); ok {
		return cached
	}

	stacks, err := s.cloudformation.DescribeStacks(ctx, profile, region)
	if err == nil {
		_ = s.saveResourceCacheWithTTL(ctx, scope, queryHash, stacks)
		return stacks
	}
	_, ok, cacheErr := s.store.LoadResourceCache(ctx, scope, queryHash, &cached)
	if cacheErr == nil && ok {
		return cached
	}
	return []models.AwsCloudFormationStack{}
}

func (s *Service) selectedCloudFormationStackName(
	session models.SessionSnapshot,
	stacks []models.AwsCloudFormationStack,
) string {
	if session.SelectedCloudFormationStackName != "" {
		for _, stack := range stacks {
			if stack.StackName == session.SelectedCloudFormationStackName {
				return session.SelectedCloudFormationStackName
			}
		}
	}
	if len(stacks) == 0 {
		return ""
	}
	return stacks[0].StackName
}

func (s *Service) cloudFormationStackEvents(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
	stackName string,
) []models.AwsCloudFormationStackEvent {
	if region == "" || stackName == "" {
		return []models.AwsCloudFormationStackEvent{}
	}
	const scope = "aws.cloudformation.events"
	queryHash := profile.ProfileID + "|" + region + "|" + stackName

	var cached []models.AwsCloudFormationStackEvent
	if _, ok, _ := s.loadCachedResource(ctx, scope, queryHash, &cached); ok {
		return cached
	}

	events, err := s.cloudformation.DescribeStackEvents(ctx, profile, region, stackName)
	if err == nil {
		_ = s.saveResourceCacheWithTTL(ctx, scope, queryHash, events)
		return events
	}
	_, ok, cacheErr := s.store.LoadResourceCache(ctx, scope, queryHash, &cached)
	if cacheErr == nil && ok {
		return cached
	}
	return []models.AwsCloudFormationStackEvent{}
}

func (s *Service) handleAwsCloudFormationSelectRegion(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		Region string `json:"region"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAWSWorkspace(ctx, "open an AWS workspace before selecting a CloudFormation region", func(session *models.SessionSnapshot) error {
		session.SelectedCloudFormationRegion = request.Region
		session.SelectedCloudFormationStackName = ""
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAWSWorkspaceOpts(ctx, snapshot, session, notifier, workspaceSnapshotOptions{awsScope: "cloudformation", skipAzureInventory: true}, "", "", false)
}

func (s *Service) handleAwsCloudFormationSelectStack(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		StackName string `json:"stackName"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAWSWorkspace(ctx, "open an AWS workspace before selecting a CloudFormation stack", func(session *models.SessionSnapshot) error {
		session.SelectedCloudFormationStackName = request.StackName
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAWSWorkspaceOpts(ctx, snapshot, session, notifier, workspaceSnapshotOptions{awsScope: "cloudformation", skipAzureInventory: true}, "", "", false)
}