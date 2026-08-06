// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package aws

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"cloudsprocket/backend/daemon/internal/app/sessionport"
	"cloudsprocket/backend/daemon/internal/discovery"
	"cloudsprocket/backend/daemon/internal/models"
)

// HandleSQSPeek implements aws.sqs.peek.
func (s *Service) HandleSQSPeek(ctx context.Context, params json.RawMessage, _ sessionport.Notifier) (any, error) {
	if s == nil || s.sqs == nil {
		return nil, errors.New("aws write service is not available")
	}
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
	profile, region, queueURL, err := s.AuthorizeWriteSelection(
		ctx, snapshot,
		"SQS peek requires write mode to be enabled",
		func(snap discovery.Snapshot, session models.SessionSnapshot) (models.ProfileSummary, string, string, error) {
			return ActiveSQSSelection(snap, session, request.QueueURL)
		},
	)
	if err != nil {
		return nil, err
	}
	actionCtx, cancel := s.WithActionTimeout(ctx)
	defer cancel()
	return s.sqs.PeekMessages(actionCtx, profile, region, queueURL)
}

// HandleSQSSendMessage implements aws.sqs.sendMessage.
func (s *Service) HandleSQSSendMessage(ctx context.Context, params json.RawMessage, _ sessionport.Notifier) (any, error) {
	if s == nil || s.sqs == nil {
		return nil, errors.New("aws write service is not available")
	}
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
	profile, region, queueURL, err := s.AuthorizeWriteSelection(
		ctx, snapshot,
		"SQS send requires write mode to be enabled",
		func(snap discovery.Snapshot, session models.SessionSnapshot) (models.ProfileSummary, string, string, error) {
			return ActiveSQSSelection(snap, session, request.QueueURL)
		},
	)
	if err != nil {
		return nil, err
	}
	actionCtx, cancel := s.WithActionTimeout(ctx)
	defer cancel()
	return s.sqs.SendMessage(actionCtx, profile, region, queueURL, request.MessageBody)
}

// HandleSQSCreateQueue implements aws.sqs.createQueue.
func (s *Service) HandleSQSCreateQueue(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	if s == nil || s.sqs == nil {
		return nil, errors.New("aws write service is not available")
	}
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
	session, profile, err := s.AuthorizeWrite(
		ctx, snapshot,
		"open an AWS workspace before creating an SQS queue",
		"SQS create requires write mode to be enabled",
	)
	if err != nil {
		return nil, err
	}
	region := session.SelectedSQSRegion
	if region == "" {
		region = ProfileRegionHint(profile)
	}

	actionCtx, cancel := s.WithActionTimeout(ctx)
	created, err := s.sqs.CreateQueue(actionCtx, profile, region, queueName)
	cancel()
	if err != nil {
		return nil, err
	}
	if s.invalidator != nil {
		s.invalidator.InvalidateResourceCache(ctx, "aws.sqs.queues", profile.ProfileID+"|"+region)
	}

	return s.FinishWriteAction(
		ctx, snapshot, notifier, "sqs",
		fmt.Sprintf("Created SQS queue %s in %s.", created.QueueName, region),
		func(session *models.SessionSnapshot) { session.SelectedSQSQueueURL = created.QueueURL },
	)
}

// HandleSNSPublish implements aws.sns.publish.
func (s *Service) HandleSNSPublish(ctx context.Context, params json.RawMessage, _ sessionport.Notifier) (any, error) {
	if s == nil || s.sns == nil {
		return nil, errors.New("aws write service is not available")
	}
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
	profile, region, topicArn, err := s.AuthorizeWriteSelection(
		ctx, snapshot,
		"SNS publish requires write mode to be enabled",
		func(snap discovery.Snapshot, session models.SessionSnapshot) (models.ProfileSummary, string, string, error) {
			return ActiveSNSSelection(snap, session, request.TopicArn)
		},
	)
	if err != nil {
		return nil, err
	}
	actionCtx, cancel := s.WithActionTimeout(ctx)
	defer cancel()
	return s.sns.Publish(actionCtx, profile, region, topicArn, request.Message)
}

// HandleSNSCreateTopic implements aws.sns.createTopic.
func (s *Service) HandleSNSCreateTopic(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	if s == nil || s.sns == nil {
		return nil, errors.New("aws write service is not available")
	}
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
	session, profile, err := s.AuthorizeWrite(
		ctx, snapshot,
		"open an AWS workspace before creating an SNS topic",
		"SNS create requires write mode to be enabled",
	)
	if err != nil {
		return nil, err
	}
	region := session.SelectedSNSRegion
	if region == "" {
		region = ProfileRegionHint(profile)
	}

	actionCtx, cancel := s.WithActionTimeout(ctx)
	created, err := s.sns.CreateTopic(actionCtx, profile, region, topicName)
	cancel()
	if err != nil {
		return nil, err
	}
	if s.invalidator != nil {
		s.invalidator.InvalidateResourceCache(ctx, "aws.sns.topics", profile.ProfileID+"|"+region)
	}

	return s.FinishWriteAction(
		ctx, snapshot, notifier, "sns",
		fmt.Sprintf("Created SNS topic %s in %s.", created.TopicName, region),
		func(session *models.SessionSnapshot) { session.SelectedSNSTopicArn = created.TopicArn },
	)
}

// HandleSNSCreateSubscription implements aws.sns.createSubscription.
func (s *Service) HandleSNSCreateSubscription(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	if s == nil || s.sns == nil {
		return nil, errors.New("aws write service is not available")
	}
	var request struct {
		TopicArn string `json:"topicArn"`
		Protocol string `json:"protocol"`
		Endpoint string `json:"endpoint"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	protocol := strings.TrimSpace(request.Protocol)
	endpoint := strings.TrimSpace(request.Endpoint)
	if protocol == "" {
		return nil, errors.New("protocol is required")
	}
	if endpoint == "" {
		return nil, errors.New("endpoint is required")
	}
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	profile, region, topicArn, err := s.AuthorizeWriteSelection(
		ctx, snapshot,
		"SNS create subscription requires write mode to be enabled",
		func(snap discovery.Snapshot, session models.SessionSnapshot) (models.ProfileSummary, string, string, error) {
			return ActiveSNSSelection(snap, session, request.TopicArn)
		},
	)
	if err != nil {
		return nil, err
	}

	actionCtx, cancel := s.WithActionTimeout(ctx)
	created, err := s.sns.CreateSubscription(actionCtx, profile, region, topicArn, protocol, endpoint)
	cancel()
	if err != nil {
		return nil, err
	}
	if s.invalidator != nil {
		s.invalidator.InvalidateResourceCache(ctx, "aws.sns.topics", profile.ProfileID+"|"+region)
	}

	return s.FinishWriteAction(
		ctx, snapshot, notifier, "sns",
		created.Summary,
		func(session *models.SessionSnapshot) { session.SelectedSNSTopicArn = topicArn },
	)
}

// HandleDynamoDBPutItem implements aws.dynamodb.putItem.
func (s *Service) HandleDynamoDBPutItem(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	if s == nil || s.dynamodb == nil {
		return nil, errors.New("aws write service is not available")
	}
	var request struct {
		TableName string `json:"tableName"`
		ItemJSON  string `json:"itemJson"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	profile, region, tableName, err := s.AuthorizeWriteSelection(
		ctx, snapshot,
		"DynamoDB put requires write mode to be enabled",
		func(snap discovery.Snapshot, session models.SessionSnapshot) (models.ProfileSummary, string, string, error) {
			return ActiveDynamoDBSelection(snap, session, request.TableName)
		},
	)
	if err != nil {
		return nil, err
	}

	actionCtx, cancel := s.WithActionTimeout(ctx)
	result, err := s.dynamodb.PutItem(actionCtx, profile, region, tableName, request.ItemJSON)
	cancel()
	if err != nil {
		return nil, err
	}
	if s.invalidator != nil {
		s.invalidator.InvalidateResourceCache(ctx, "aws.dynamodb.tables", profile.ProfileID+"|"+region)
	}

	return s.FinishWriteAction(
		ctx, snapshot, notifier, "dynamodb",
		result.Summary,
		func(session *models.SessionSnapshot) { session.SelectedDynamoDBTableName = tableName },
	)
}

// HandleDynamoDBDeleteItem implements aws.dynamodb.deleteItem.
func (s *Service) HandleDynamoDBDeleteItem(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	if s == nil || s.dynamodb == nil {
		return nil, errors.New("aws write service is not available")
	}
	var request struct {
		TableName string `json:"tableName"`
		KeyJSON   string `json:"keyJson"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	profile, region, tableName, err := s.AuthorizeWriteSelection(
		ctx, snapshot,
		"DynamoDB delete requires write mode to be enabled",
		func(snap discovery.Snapshot, session models.SessionSnapshot) (models.ProfileSummary, string, string, error) {
			return ActiveDynamoDBSelection(snap, session, request.TableName)
		},
	)
	if err != nil {
		return nil, err
	}

	actionCtx, cancel := s.WithActionTimeout(ctx)
	result, err := s.dynamodb.DeleteItem(actionCtx, profile, region, tableName, request.KeyJSON)
	cancel()
	if err != nil {
		return nil, err
	}
	if s.invalidator != nil {
		s.invalidator.InvalidateResourceCache(ctx, "aws.dynamodb.tables", profile.ProfileID+"|"+region)
	}

	return s.FinishWriteAction(
		ctx, snapshot, notifier, "dynamodb",
		result.Summary,
		func(session *models.SessionSnapshot) { session.SelectedDynamoDBTableName = tableName },
	)
}

// HandleDynamoDBLoadMoreItems implements aws.dynamodb.loadMoreItems (read-only scan page).
func (s *Service) HandleDynamoDBLoadMoreItems(ctx context.Context, params json.RawMessage, _ sessionport.Notifier) (any, error) {
	if s == nil || s.dynamodb == nil || s.session == nil || s.workspace == nil {
		return nil, errors.New("aws write service is not available")
	}
	var request struct {
		TableName          string `json:"tableName"`
		ContinuationToken  string `json:"continuationToken"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	token := strings.TrimSpace(request.ContinuationToken)
	if token == "" {
		return nil, errors.New("continuation token is required to load more DynamoDB items")
	}
	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	session, err := s.session.Load(ctx, snapshot)
	if err != nil {
		return nil, err
	}
	profile, region, tableName, err := ActiveDynamoDBSelection(snapshot, session, request.TableName)
	if err != nil {
		return nil, err
	}

	actionCtx, cancel := s.WithActionTimeout(ctx)
	page, scanErr := s.dynamodb.ScanSampleItems(actionCtx, profile, region, tableName, token, 0)
	cancel()
	if scanErr != nil {
		return nil, fmt.Errorf("could not load more DynamoDB items: %w", scanErr)
	}

	workspace := s.workspace.Build(ctx, snapshot, session, sessionport.SnapshotOptions{
		AWSScope:           "dynamodb",
		SkipAzureInventory: true,
		LightweightAWS:     true,
	})
	// Replace selected table sample page only; the UI appends to the list.
	updatedTables := make([]models.AwsDynamoDBTable, 0, len(workspace.DynamoDBTables))
	found := false
	for _, table := range workspace.DynamoDBTables {
		if table.TableName != tableName {
			updatedTables = append(updatedTables, table)
			continue
		}
		found = true
		table.SampleItems = page.Items
		table.SampleItemsNextToken = page.SampleItemsNextToken
		table.SampleItemsHasMore = page.SampleItemsHasMore
		updatedTables = append(updatedTables, table)
	}
	if !found {
		updatedTables = append(updatedTables, models.AwsDynamoDBTable{
			TableName:            tableName,
			SampleItems:          page.Items,
			SampleItemsNextToken: page.SampleItemsNextToken,
			SampleItemsHasMore:   page.SampleItemsHasMore,
		})
	}
	workspace.DynamoDBTables = updatedTables
	workspace.SelectedDynamoDBRegion = region
	workspace.SelectedDynamoDBTableName = tableName
	moreNote := "End of scan."
	if page.SampleItemsHasMore {
		moreNote = "More items available."
	}
	workspace.DynamoDBStatusMessage = fmt.Sprintf(
		"Loaded %d more sample item(s) from %s. %s",
		len(page.Items),
		tableName,
		moreNote,
	)
	return workspace, nil
}

// HandleIAMCreateRole implements aws.iam.createRole.
func (s *Service) HandleIAMCreateRole(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	if s == nil || s.iam == nil {
		return nil, errors.New("aws write service is not available")
	}
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
	_, profile, err := s.AuthorizeWrite(
		ctx, snapshot,
		"open an AWS workspace before creating an IAM role",
		"IAM create requires write mode to be enabled",
	)
	if err != nil {
		return nil, err
	}
	region := ProfileRegionHint(profile)

	actionCtx, cancel := s.WithActionTimeout(ctx)
	created, err := s.iam.CreateRole(actionCtx, profile, region, roleName)
	cancel()
	if err != nil {
		return nil, err
	}
	if s.invalidator != nil {
		s.invalidator.InvalidateResourceCache(ctx, "aws.iam.roles", profile.ProfileID+"|"+region)
	}

	return s.FinishWriteAction(
		ctx, snapshot, notifier, "iam",
		fmt.Sprintf("Created IAM role %s.", created.RoleName),
		func(session *models.SessionSnapshot) {
			session.SelectedIAMRoleName = created.RoleName
		},
	)
}

// HandleSecretsReveal implements aws.secrets.reveal.
func (s *Service) HandleSecretsReveal(ctx context.Context, params json.RawMessage, _ sessionport.Notifier) (any, error) {
	if s == nil || s.secrets == nil || s.session == nil || s.discovery == nil {
		return nil, errors.New("aws write service is not available")
	}
	var request struct {
		Region     string `json:"region"`
		SecretName string `json:"secretName"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	region := strings.TrimSpace(request.Region)
	secretName := strings.TrimSpace(request.SecretName)
	if region == "" || secretName == "" {
		return nil, errors.New("a region and secret name are required")
	}

	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	session, err := s.session.Load(ctx, snapshot)
	if err != nil {
		return nil, err
	}
	if !session.IsLocked || session.CurrentProviderID != "aws" {
		return nil, errors.New("open a locked AWS workspace before revealing a secret")
	}
	profile, ok := FindProfile(FilterProfiles(snapshot.Profiles, session.CurrentProviderID), session.SelectedProfileID)
	if !ok {
		return nil, errors.New("the workspace's AWS profile is not available")
	}
	if enabled, reason := ActionGate(session, profile); !enabled {
		if reason == "" {
			reason = "Reveal requires write mode to be enabled for this AWS workspace."
		}
		return nil, errors.New(reason)
	}

	timeoutCtx, cancel := s.WithActionTimeout(ctx)
	defer cancel()
	value, err := s.secrets.GetSecretValue(timeoutCtx, profile, region, secretName)
	if err != nil {
		return nil, err
	}
	return map[string]string{"value": value}, nil
}
