// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"encoding/json"
	"errors"
)

// Thin façade wrappers for AWS selection RPCs owned by internal/app/aws (F-029 Phase 4b).

func (s *Service) requireAWS() error {
	if s.aws == nil {
		return errors.New("aws selection service is not available")
	}
	return nil
}

func (s *Service) handleAwsS3SelectBucket(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAWS(); err != nil {
		return nil, err
	}
	return s.aws.HandleS3SelectBucket(ctx, params, notifier)
}

func (s *Service) handleAwsS3SelectObject(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAWS(); err != nil {
		return nil, err
	}
	return s.aws.HandleS3SelectObject(ctx, params, notifier)
}

func (s *Service) handleAwsS3SetPrefixFilter(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAWS(); err != nil {
		return nil, err
	}
	return s.aws.HandleS3SetPrefixFilter(ctx, params, notifier)
}

func (s *Service) handleAwsEc2SelectRegion(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAWS(); err != nil {
		return nil, err
	}
	return s.aws.HandleEC2SelectRegion(ctx, params, notifier)
}

func (s *Service) handleAwsEc2SelectInstance(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAWS(); err != nil {
		return nil, err
	}
	return s.aws.HandleEC2SelectInstance(ctx, params, notifier)
}

func (s *Service) handleAwsLambdaSelectRegion(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAWS(); err != nil {
		return nil, err
	}
	return s.aws.HandleLambdaSelectRegion(ctx, params, notifier)
}

func (s *Service) handleAwsLambdaSelectFunction(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAWS(); err != nil {
		return nil, err
	}
	return s.aws.HandleLambdaSelectFunction(ctx, params, notifier)
}

func (s *Service) handleAwsDynamodbSelectRegion(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAWS(); err != nil {
		return nil, err
	}
	return s.aws.HandleDynamoDBSelectRegion(ctx, params, notifier)
}

func (s *Service) handleAwsDynamodbSelectTable(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAWS(); err != nil {
		return nil, err
	}
	return s.aws.HandleDynamoDBSelectTable(ctx, params, notifier)
}

func (s *Service) handleAwsSqsSelectRegion(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAWS(); err != nil {
		return nil, err
	}
	return s.aws.HandleSQSSelectRegion(ctx, params, notifier)
}

func (s *Service) handleAwsSqsSelectQueue(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAWS(); err != nil {
		return nil, err
	}
	return s.aws.HandleSQSSelectQueue(ctx, params, notifier)
}

func (s *Service) handleAwsSnsSelectRegion(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAWS(); err != nil {
		return nil, err
	}
	return s.aws.HandleSNSSelectRegion(ctx, params, notifier)
}

func (s *Service) handleAwsSnsSelectTopic(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAWS(); err != nil {
		return nil, err
	}
	return s.aws.HandleSNSSelectTopic(ctx, params, notifier)
}

func (s *Service) handleAwsRdsSelectRegion(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAWS(); err != nil {
		return nil, err
	}
	return s.aws.HandleRDSSelectRegion(ctx, params, notifier)
}

func (s *Service) handleAwsRdsSelectInstance(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAWS(); err != nil {
		return nil, err
	}
	return s.aws.HandleRDSSelectInstance(ctx, params, notifier)
}

func (s *Service) handleAwsEcsSelectRegion(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAWS(); err != nil {
		return nil, err
	}
	return s.aws.HandleECSSelectRegion(ctx, params, notifier)
}

func (s *Service) handleAwsEcsSelectCluster(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAWS(); err != nil {
		return nil, err
	}
	return s.aws.HandleECSSelectCluster(ctx, params, notifier)
}

func (s *Service) handleAwsEcsSelectService(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAWS(); err != nil {
		return nil, err
	}
	return s.aws.HandleECSSelectService(ctx, params, notifier)
}

func (s *Service) handleAwsEcsSelectTask(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAWS(); err != nil {
		return nil, err
	}
	return s.aws.HandleECSSelectTask(ctx, params, notifier)
}

func (s *Service) handleAwsEksSelectRegion(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAWS(); err != nil {
		return nil, err
	}
	return s.aws.HandleEKSSelectRegion(ctx, params, notifier)
}

func (s *Service) handleAwsEksSelectCluster(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAWS(); err != nil {
		return nil, err
	}
	return s.aws.HandleEKSSelectCluster(ctx, params, notifier)
}

func (s *Service) handleAwsCloudFormationSelectRegion(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAWS(); err != nil {
		return nil, err
	}
	return s.aws.HandleCloudFormationSelectRegion(ctx, params, notifier)
}

func (s *Service) handleAwsCloudFormationSelectStack(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAWS(); err != nil {
		return nil, err
	}
	return s.aws.HandleCloudFormationSelectStack(ctx, params, notifier)
}

func (s *Service) handleAwsEventBridgeSelectRegion(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAWS(); err != nil {
		return nil, err
	}
	return s.aws.HandleEventBridgeSelectRegion(ctx, params, notifier)
}

func (s *Service) handleAwsEventBridgeSelectBus(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAWS(); err != nil {
		return nil, err
	}
	return s.aws.HandleEventBridgeSelectBus(ctx, params, notifier)
}

func (s *Service) handleAwsRoute53SelectHostedZone(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAWS(); err != nil {
		return nil, err
	}
	return s.aws.HandleRoute53SelectHostedZone(ctx, params, notifier)
}

func (s *Service) handleAwsElbv2SelectRegion(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAWS(); err != nil {
		return nil, err
	}
	return s.aws.HandleELBSelectRegion(ctx, params, notifier)
}

func (s *Service) handleAwsElbv2SelectLoadBalancer(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAWS(); err != nil {
		return nil, err
	}
	return s.aws.HandleELBSelectLoadBalancer(ctx, params, notifier)
}

func (s *Service) handleAwsKmsSelectRegion(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAWS(); err != nil {
		return nil, err
	}
	return s.aws.HandleKMSSelectRegion(ctx, params, notifier)
}

func (s *Service) handleAwsKmsSelectKey(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAWS(); err != nil {
		return nil, err
	}
	return s.aws.HandleKMSSelectKey(ctx, params, notifier)
}

func (s *Service) handleAwsApiGatewaySelectRegion(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAWS(); err != nil {
		return nil, err
	}
	return s.aws.HandleAPIGatewaySelectRegion(ctx, params, notifier)
}

func (s *Service) handleAwsApiGatewaySelectApi(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAWS(); err != nil {
		return nil, err
	}
	return s.aws.HandleAPIGatewaySelectAPI(ctx, params, notifier)
}

func (s *Service) handleAwsSecretsManagerSelectRegion(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAWS(); err != nil {
		return nil, err
	}
	return s.aws.HandleSecretsSelectRegion(ctx, params, notifier)
}

func (s *Service) handleAwsSecretsManagerSelectSecret(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAWS(); err != nil {
		return nil, err
	}
	return s.aws.HandleSecretsSelectSecret(ctx, params, notifier)
}

func (s *Service) handleAwsLogsSelectRegion(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAWS(); err != nil {
		return nil, err
	}
	return s.aws.HandleLogsSelectRegion(ctx, params, notifier)
}

func (s *Service) handleAwsLogsSelectLogGroup(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAWS(); err != nil {
		return nil, err
	}
	return s.aws.HandleLogsSelectLogGroup(ctx, params, notifier)
}

func (s *Service) handleAwsIamSelectRole(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	if err := s.requireAWS(); err != nil {
		return nil, err
	}
	return s.aws.HandleIAMSelectRole(ctx, params, notifier)
}
