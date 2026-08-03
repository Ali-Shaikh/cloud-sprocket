// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"fmt"
	"sync"

	"cloudsprocket/backend/daemon/internal/models"
)

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
