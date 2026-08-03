// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"encoding/json"
)

// Thin façade wrappers for AWS write RPCs owned by internal/app/aws (F-029 Phase 4c).

func (s *Service) handleAwsSqsPeek(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAWS(); err != nil {
		return nil, err
	}
	return s.aws.HandleSQSPeek(ctx, params, notifier)
}

func (s *Service) handleAwsSqsSendMessage(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAWS(); err != nil {
		return nil, err
	}
	return s.aws.HandleSQSSendMessage(ctx, params, notifier)
}

func (s *Service) handleAwsSqsCreateQueue(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAWS(); err != nil {
		return nil, err
	}
	return s.aws.HandleSQSCreateQueue(ctx, params, notifier)
}

func (s *Service) handleAwsSnsPublish(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAWS(); err != nil {
		return nil, err
	}
	return s.aws.HandleSNSPublish(ctx, params, notifier)
}

func (s *Service) handleAwsSnsCreateTopic(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAWS(); err != nil {
		return nil, err
	}
	return s.aws.HandleSNSCreateTopic(ctx, params, notifier)
}

func (s *Service) handleAwsDynamodbPutItem(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAWS(); err != nil {
		return nil, err
	}
	return s.aws.HandleDynamoDBPutItem(ctx, params, notifier)
}

func (s *Service) handleAwsDynamodbDeleteItem(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAWS(); err != nil {
		return nil, err
	}
	return s.aws.HandleDynamoDBDeleteItem(ctx, params, notifier)
}

func (s *Service) handleAwsIamCreateRole(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAWS(); err != nil {
		return nil, err
	}
	return s.aws.HandleIAMCreateRole(ctx, params, notifier)
}

func (s *Service) handleAwsSecretsManagerReveal(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAWS(); err != nil {
		return nil, err
	}
	return s.aws.HandleSecretsReveal(ctx, params, notifier)
}
