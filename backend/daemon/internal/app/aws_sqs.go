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
	queues, err := s.sqs.ListQueues(ctx, profile, region)
	if err == nil {
		_ = s.store.SaveResourceCache(ctx, scope, queryHash, queues, s.timestamp())
		return queues
	}
	var cached []models.AwsSqsQueue
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
	return s.finishAWSWorkspace(ctx, snapshot, session, notifier, "info", fmt.Sprintf("Selected SQS region %s.", request.Region), true)
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
	return s.finishAWSWorkspace(ctx, snapshot, session, notifier, "", "", false)
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
	s.mu.Lock()
	session, err := s.currentState(ctx, snapshot)
	if err != nil {
		s.mu.Unlock()
		return nil, err
	}
	profile, region, queueURL, err := s.activeSQSSelection(snapshot, session, request.QueueURL)
	if err != nil {
		s.mu.Unlock()
		return nil, err
	}
	if !effectiveAWSWritesEnabled(session, profile) {
		s.mu.Unlock()
		return nil, errors.New("SQS peek requires write mode to be enabled and a profile with local endpoint_url and cloudsprocket_allow_writes = true")
	}
	s.mu.Unlock()
	return s.sqs.PeekMessages(ctx, profile, region, queueURL)
}
