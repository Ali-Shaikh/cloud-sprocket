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

	"cloudsprocket/backend/daemon/internal/discovery"
	"cloudsprocket/backend/daemon/internal/models"
)

func (s *Service) activeSQSSelection(
	snapshot discovery.Snapshot,
	session models.SessionSnapshot,
	requestQueueURL string,
) (models.ProfileSummary, string, string, error) {
	if !session.IsLocked || session.CurrentProviderID != "aws" {
		return models.ProfileSummary{}, "", "", errors.New("open an AWS workspace before using SQS actions")
	}
	profile, ok := findProfile(filterProfiles(snapshot.Profiles, session.CurrentProviderID), session.SelectedProfileID)
	if !ok {
		return models.ProfileSummary{}, "", "", errors.New("the workspace's AWS profile is not available")
	}
	region := session.SelectedSQSRegion
	if region == "" {
		region = profileRegionHint(profile)
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

func (s *Service) sqsRegions(ctx context.Context, profile models.ProfileSummary) []string {
	return s.lambdaRegions(ctx, profile)
}

func (s *Service) selectedSQSRegion(
	session models.SessionSnapshot,
	regions []string,
	profile models.ProfileSummary,
) string {
	if session.SelectedSQSRegion != "" {
		for _, region := range regions {
			if region == session.SelectedSQSRegion {
				return session.SelectedSQSRegion
			}
		}
	}
	return s.selectedDynamoDBRegion(session, regions, profile)
}

func (s *Service) sqsQueues(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
) []models.AwsSqsQueue {
	if region == "" {
		return []models.AwsSqsQueue{}
	}
	const scope = "aws.sqs.queues"
	queryHash := profile.ProfileID + "|" + region

	var cached []models.AwsSqsQueue
	if _, ok, _ := s.loadCachedResource(ctx, scope, queryHash, &cached); ok {
		return cached
	}

	queues, err := s.sqs.ListQueues(ctx, profile, region)
	if err == nil {
		_ = s.saveResourceCacheWithTTL(ctx, scope, queryHash, queues)
		return queues
	}
	_, ok, cacheErr := s.store.LoadResourceCache(ctx, scope, queryHash, &cached)
	if cacheErr == nil && ok {
		return cached
	}
	return []models.AwsSqsQueue{}
}

func (s *Service) selectedSQSQueueURL(
	session models.SessionSnapshot,
	queues []models.AwsSqsQueue,
) string {
	if session.SelectedSQSQueueURL != "" {
		for _, queue := range queues {
			if queue.QueueURL == session.SelectedSQSQueueURL {
				return session.SelectedSQSQueueURL
			}
		}
	}
	if len(queues) == 0 {
		return ""
	}
	return queues[0].QueueURL
}

func (s *Service) enrichSQSInventory(
	workspace *models.WorkspaceSnapshot,
	session models.SessionSnapshot,
	opts awsEnrichmentOptions,
	mu *sync.Mutex,
) {
	if workspace.Provider == nil ||
		workspace.Provider.ProviderID != "aws" ||
		workspace.Profile == nil ||
		s.sqs == nil {
		return
	}
	timeoutCtx, cancel := s.withAWSTimeout(context.Background())
	regions := s.sqsRegions(timeoutCtx, *workspace.Profile)
	cancel()
	selectedRegion := s.selectedSQSRegion(session, regions, *workspace.Profile)

	if opts.lightweight {
		status := "No region is available for SQS queues in this AWS workspace."
		if selectedRegion != "" {
			status = fmt.Sprintf("Loaded %d region(s). Select %s to browse queues.", len(regions), selectedRegion)
		} else if len(regions) > 0 {
			status = fmt.Sprintf("Loaded %d region(s). Select a region to browse queues.", len(regions))
		}
		lockWorkspace(mu, func() {
			workspace.SQSRegions = regions
			workspace.SelectedSQSRegion = selectedRegion
			workspace.SQSQueues = []models.AwsSqsQueue{}
			workspace.SelectedSQSQueueURL = ""
			workspace.SQSStatusMessage = status
		})
		return
	}

	timeoutCtx, cancel = s.withAWSTimeout(context.Background())
	queues := s.sqsQueues(timeoutCtx, *workspace.Profile, selectedRegion)
	cancel()
	selectedQueue := s.selectedSQSQueueURL(session, queues)
	if selectedQueue != "" {
		timeoutCtx, cancel := s.withAWSTimeout(context.Background())
		if full, err := s.sqs.DescribeQueue(timeoutCtx, *workspace.Profile, selectedRegion, selectedQueue); err == nil {
			for i := range queues {
				if queues[i].QueueURL == full.QueueURL {
					queues[i] = full
					break
				}
			}
		}
		cancel()
	}

	status := "No region is available for SQS queues in this AWS workspace."
	if selectedRegion != "" {
		if len(queues) == 0 {
			status = fmt.Sprintf("No SQS queues were returned for %s.", selectedRegion)
		} else {
			status = fmt.Sprintf("Loaded %d SQS queues from %s.", len(queues), selectedRegion)
		}
	}

	lockWorkspace(mu, func() {
		workspace.SQSRegions = regions
		workspace.SelectedSQSRegion = selectedRegion
		workspace.SQSQueues = queues
		workspace.SelectedSQSQueueURL = selectedQueue
		workspace.SQSStatusMessage = status
	})
}

func (s *Service) handleAwsSqsSelectRegion(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		Region string `json:"region"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAWSWorkspace(ctx, "open an AWS workspace before selecting an SQS region", func(session *models.SessionSnapshot) error {
		session.SelectedSQSRegion = request.Region
		session.SelectedSQSQueueURL = ""
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAWSWorkspaceOpts(ctx, snapshot, session, notifier, workspaceSnapshotOptions{awsScope: "sqs", skipAzureInventory: true}, "info", fmt.Sprintf("Selected SQS region %s.", request.Region), true)
}

func (s *Service) handleAwsSqsSelectQueue(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		QueueURL string `json:"queueUrl"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAWSWorkspace(ctx, "open an AWS workspace before selecting an SQS queue", func(session *models.SessionSnapshot) error {
		session.SelectedSQSQueueURL = request.QueueURL
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAWSWorkspaceOpts(ctx, snapshot, session, notifier, workspaceSnapshotOptions{awsScope: "sqs", skipAzureInventory: true}, "", "", false)
}

func (s *Service) handleAwsSqsPeek(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		QueueURL string `json:"queueUrl"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	profile, region, queueURL, err := s.authorizeAWSWriteSelection(
		ctx, snapshot,
		"SQS peek requires write mode to be enabled and a profile with local endpoint_url and cloudsprocket_allow_writes = true",
		func(snap discovery.Snapshot, session models.SessionSnapshot) (models.ProfileSummary, string, string, error) {
			return s.activeSQSSelection(snap, session, request.QueueURL)
		},
	)
	if err != nil {
		return nil, err
	}
	actionCtx, cancel := s.withAWSTimeout(ctx)
	defer cancel()
	return s.sqs.PeekMessages(actionCtx, profile, region, queueURL)
}

func (s *Service) handleAwsSqsSendMessage(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		QueueURL    string `json:"queueUrl"`
		MessageBody string `json:"messageBody"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	profile, region, queueURL, err := s.authorizeAWSWriteSelection(
		ctx, snapshot,
		"SQS send requires write mode to be enabled and a profile with local endpoint_url and cloudsprocket_allow_writes = true",
		func(snap discovery.Snapshot, session models.SessionSnapshot) (models.ProfileSummary, string, string, error) {
			return s.activeSQSSelection(snap, session, request.QueueURL)
		},
	)
	if err != nil {
		return nil, err
	}
	actionCtx, cancel := s.withAWSTimeout(ctx)
	defer cancel()
	return s.sqs.SendMessage(actionCtx, profile, region, queueURL, request.MessageBody)
}

func (s *Service) handleAwsSqsCreateQueue(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		QueueName string `json:"queueName"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	queueName := strings.TrimSpace(request.QueueName)
	if queueName == "" {
		return nil, errors.New("queue name is required")
	}
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	session, profile, err := s.authorizeAWSWrite(
		ctx, snapshot,
		"open an AWS workspace before creating an SQS queue",
		"SQS create requires write mode to be enabled and a profile with local endpoint_url and cloudsprocket_allow_writes = true",
	)
	if err != nil {
		return nil, err
	}
	region := session.SelectedSQSRegion
	if region == "" {
		region = profileRegionHint(profile)
	}

	actionCtx, cancel := s.withAWSTimeout(ctx)
	created, err := s.sqs.CreateQueue(actionCtx, profile, region, queueName)
	cancel()
	if err != nil {
		return nil, err
	}
	s.invalidateResourceCache(ctx, "aws.sqs.queues", profile.ProfileID+"|"+region)

	return s.finishAWSWriteAction(
		ctx, snapshot, notifier, "sqs",
		fmt.Sprintf("Created SQS queue %s in %s.", created.QueueName, region),
		func(session *models.SessionSnapshot) { session.SelectedSQSQueueURL = created.QueueURL },
	)
}
