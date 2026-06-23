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
	s.mu.Lock()
	session, err := s.currentState(ctx, snapshot)
	if err != nil {
		s.mu.Unlock()
		return nil, err
	}
	profile, region, topicArn, err := s.activeSNSSelection(snapshot, session, request.TopicArn)
	if err != nil {
		s.mu.Unlock()
		return nil, err
	}
	if !effectiveAWSWritesEnabled(session, profile) {
		s.mu.Unlock()
		return nil, errors.New("SNS publish requires write mode to be enabled and a profile with local endpoint_url and cloudsprocket_allow_writes = true")
	}
	s.mu.Unlock()
	return s.sns.Publish(ctx, profile, region, topicArn, request.Message)
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
	s.mu.Lock()
	session, err := s.currentState(ctx, snapshot)
	if err != nil {
		s.mu.Unlock()
		return nil, err
	}
	if !session.IsLocked || session.CurrentProviderID != "aws" {
		s.mu.Unlock()
		return nil, errors.New("open an AWS workspace before creating an SNS topic")
	}
	profile, ok := findProfile(filterProfiles(snapshot.Profiles, session.CurrentProviderID), session.SelectedProfileID)
	if !ok {
		s.mu.Unlock()
		return nil, errors.New("the workspace's AWS profile is not available")
	}
	if !effectiveAWSWritesEnabled(session, profile) {
		s.mu.Unlock()
		return nil, errors.New("SNS create requires write mode to be enabled and a profile with local endpoint_url and cloudsprocket_allow_writes = true")
	}
	region := session.SelectedSNSRegion
	if region == "" {
		region = profileRegionHint(profile)
	}
	s.mu.Unlock()

	created, err := s.sns.CreateTopic(ctx, profile, region, topicName)
	if err != nil {
		return nil, err
	}
	s.invalidateResourceCache(ctx, "aws.sns.topics", profile.ProfileID+"|"+region)

	s.mu.Lock()
	defer s.mu.Unlock()
	session, err = s.currentState(ctx, snapshot)
	if err != nil {
		return nil, err
	}
	session.SelectedSNSTopicArn = created.TopicArn
	if err := s.store.SaveSession(ctx, session); err != nil {
		return nil, err
	}
	return s.finishAWSWorkspaceOpts(
		ctx,
		snapshot,
		session,
		notifier,
		workspaceSnapshotOptions{awsScope: "sns", skipAzureInventory: true},
		"success",
		fmt.Sprintf("Created SNS topic %s in %s.", created.TopicName, region),
		false,
	)
}
