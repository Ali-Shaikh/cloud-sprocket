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

func (s *Service) activeSNSSelection(
	snapshot discovery.Snapshot,
	session models.SessionSnapshot,
	requestTopicArn string,
) (models.ProfileSummary, string, string, error) {
	if !session.IsLocked || session.CurrentProviderID != "aws" {
		return models.ProfileSummary{}, "", "", errors.New("open an AWS workspace before using SNS actions")
	}
	profile, ok := findProfile(filterProfiles(snapshot.Profiles, session.CurrentProviderID), session.SelectedProfileID)
	if !ok {
		return models.ProfileSummary{}, "", "", errors.New("the workspace's AWS profile is not available")
	}
	region := session.SelectedSNSRegion
	if region == "" {
		region = profileRegionHint(profile)
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

func (s *Service) handleAwsSnsPublish(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		TopicArn string `json:"topicArn"`
		Message  string `json:"message"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	profile, region, topicArn, err := s.authorizeAWSWriteSelection(
		ctx, snapshot,
		"SNS publish requires write mode to be enabled",
		func(snap discovery.Snapshot, session models.SessionSnapshot) (models.ProfileSummary, string, string, error) {
			return s.activeSNSSelection(snap, session, request.TopicArn)
		},
	)
	if err != nil {
		return nil, err
	}
	actionCtx, cancel := s.withAWSTimeout(ctx)
	defer cancel()
	return s.sns.Publish(actionCtx, profile, region, topicArn, request.Message)
}

func (s *Service) handleAwsSnsCreateTopic(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		TopicName string `json:"topicName"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	topicName := strings.TrimSpace(request.TopicName)
	if topicName == "" {
		return nil, errors.New("topic name is required")
	}
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	session, profile, err := s.authorizeAWSWrite(
		ctx, snapshot,
		"open an AWS workspace before creating an SNS topic",
		"SNS create requires write mode to be enabled",
	)
	if err != nil {
		return nil, err
	}
	region := session.SelectedSNSRegion
	if region == "" {
		region = profileRegionHint(profile)
	}

	actionCtx, cancel := s.withAWSTimeout(ctx)
	created, err := s.sns.CreateTopic(actionCtx, profile, region, topicName)
	cancel()
	if err != nil {
		return nil, err
	}
	s.invalidateResourceCache(ctx, "aws.sns.topics", profile.ProfileID+"|"+region)

	return s.finishAWSWriteAction(
		ctx, snapshot, notifier, "sns",
		fmt.Sprintf("Created SNS topic %s in %s.", created.TopicName, region),
		func(session *models.SessionSnapshot) { session.SelectedSNSTopicArn = created.TopicArn },
	)
}
