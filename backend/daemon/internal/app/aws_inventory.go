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

	"cloudsprocket/backend/daemon/internal/app/sessionport"
	"cloudsprocket/backend/daemon/internal/models"
)

func isValidAwsInventoryScope(scope string) bool {
	_, ok := awsInventoryScopesFromCatalog()[scope]
	return ok
}

func nonNilAwsSlice[T any](items []T) []T {
	if items == nil {
		return []T{}
	}
	return items
}

func awsInventorySliceFromWorkspace(
	scope string,
	workspace models.WorkspaceSnapshot,
) (models.AwsInventorySlice, error) {
	payload := models.AwsInventoryPayload{}
	switch scope {
	case "s3":
		payload.AwsS3InventoryPayload = &models.AwsS3InventoryPayload{
			SelectedS3BucketName: workspace.SelectedS3BucketName,
			SelectedS3ObjectKey:  workspace.SelectedS3ObjectKey,
			S3PrefixFilter:       workspace.S3PrefixFilter,
			S3StatusMessage:      workspace.S3StatusMessage,
			S3Buckets:            nonNilAwsSlice(workspace.S3Buckets),
			S3Objects:            nonNilAwsSlice(workspace.S3Objects),
			S3ObjectsNextToken:   workspace.S3ObjectsNextToken,
			S3ObjectsHasMore:     workspace.S3ObjectsHasMore,
			S3ObjectMetadata:     nonNilAwsSlice(workspace.S3ObjectMetadata),
			S3ExportSnippets:     nonNilAwsSlice(workspace.S3ExportSnippets),
		}
	case "ec2":
		payload.AwsEc2InventoryPayload = &models.AwsEc2InventoryPayload{
			SelectedEC2Region:     workspace.SelectedEC2Region,
			SelectedEC2InstanceID: workspace.SelectedEC2InstanceID,
			EC2StatusMessage:      workspace.EC2StatusMessage,
			EC2Regions:            nonNilAwsSlice(workspace.EC2Regions),
			EC2Instances:          nonNilAwsSlice(workspace.EC2Instances),
		}
	case "lambda":
		payload.AwsLambdaInventoryPayload = &models.AwsLambdaInventoryPayload{
			SelectedLambdaRegion:       workspace.SelectedLambdaRegion,
			SelectedLambdaFunctionName: workspace.SelectedLambdaFunctionName,
			LambdaStatusMessage:        workspace.LambdaStatusMessage,
			LambdaRegions:              nonNilAwsSlice(workspace.LambdaRegions),
			LambdaFunctions:            nonNilAwsSlice(workspace.LambdaFunctions),
		}
	case "dynamodb":
		payload.AwsDynamoDBInventoryPayload = &models.AwsDynamoDBInventoryPayload{
			SelectedDynamoDBRegion:    workspace.SelectedDynamoDBRegion,
			SelectedDynamoDBTableName: workspace.SelectedDynamoDBTableName,
			DynamoDBStatusMessage:     workspace.DynamoDBStatusMessage,
			DynamoDBRegions:           nonNilAwsSlice(workspace.DynamoDBRegions),
			DynamoDBTables:            nonNilAwsSlice(workspace.DynamoDBTables),
		}
	case "sqs":
		payload.AwsSqsInventoryPayload = &models.AwsSqsInventoryPayload{
			SelectedSQSRegion:   workspace.SelectedSQSRegion,
			SelectedSQSQueueURL: workspace.SelectedSQSQueueURL,
			SQSStatusMessage:    workspace.SQSStatusMessage,
			SQSRegions:          nonNilAwsSlice(workspace.SQSRegions),
			SQSQueues:           nonNilAwsSlice(workspace.SQSQueues),
		}
	case "sns":
		payload.AwsSnsInventoryPayload = &models.AwsSnsInventoryPayload{
			SelectedSNSRegion:   workspace.SelectedSNSRegion,
			SelectedSNSTopicArn: workspace.SelectedSNSTopicArn,
			SNSStatusMessage:    workspace.SNSStatusMessage,
			SNSRegions:          nonNilAwsSlice(workspace.SNSRegions),
			SNSTopics:           nonNilAwsSlice(workspace.SNSTopics),
		}
	case "rds":
		payload.AwsRdsInventoryPayload = &models.AwsRdsInventoryPayload{
			SelectedRDSRegion:     workspace.SelectedRDSRegion,
			SelectedRDSInstanceID: workspace.SelectedRDSInstanceID,
			RDSStatusMessage:      workspace.RDSStatusMessage,
			RDSRegions:            nonNilAwsSlice(workspace.RDSRegions),
			RDSInstances:          nonNilAwsSlice(workspace.RDSInstances),
		}
	case "ecs":
		payload.AwsEcsInventoryPayload = &models.AwsEcsInventoryPayload{
			SelectedECSRegion:     workspace.SelectedECSRegion,
			SelectedECSClusterArn: workspace.SelectedECSClusterArn,
			SelectedECSServiceArn: workspace.SelectedECSServiceArn,
			SelectedECSTaskArn:    workspace.SelectedECSTaskArn,
			ECSStatusMessage:      workspace.ECSStatusMessage,
			ECSRegions:            nonNilAwsSlice(workspace.ECSRegions),
			ECSClusters:           nonNilAwsSlice(workspace.ECSClusters),
			ECSServices:           nonNilAwsSlice(workspace.ECSServices),
			ECSTasks:              nonNilAwsSlice(workspace.ECSTasks),
		}
	case "eks":
		payload.AwsEksInventoryPayload = &models.AwsEksInventoryPayload{
			SelectedEKSRegion:      workspace.SelectedEKSRegion,
			SelectedEKSClusterName: workspace.SelectedEKSClusterName,
			EKSStatusMessage:       workspace.EKSStatusMessage,
			EKSRegions:             nonNilAwsSlice(workspace.EKSRegions),
			EKSClusters:            nonNilAwsSlice(workspace.EKSClusters),
			EKSNodeGroups:          nonNilAwsSlice(workspace.EKSNodeGroups),
		}
	case "cloudformation":
		payload.AwsCloudFormationInventoryPayload = &models.AwsCloudFormationInventoryPayload{
			SelectedCloudFormationRegion:    workspace.SelectedCloudFormationRegion,
			SelectedCloudFormationStackName: workspace.SelectedCloudFormationStackName,
			CloudFormationStatusMessage:     workspace.CloudFormationStatusMessage,
			CloudFormationRegions:           nonNilAwsSlice(workspace.CloudFormationRegions),
			CloudFormationStacks:            nonNilAwsSlice(workspace.CloudFormationStacks),
			CloudFormationStackEvents:       nonNilAwsSlice(workspace.CloudFormationStackEvents),
		}
	case "eventbridge":
		payload.AwsEventBridgeInventoryPayload = &models.AwsEventBridgeInventoryPayload{
			SelectedEventBridgeRegion:  workspace.SelectedEventBridgeRegion,
			SelectedEventBridgeBusName: workspace.SelectedEventBridgeBusName,
			EventBridgeStatusMessage:   workspace.EventBridgeStatusMessage,
			EventBridgeRegions:         nonNilAwsSlice(workspace.EventBridgeRegions),
			EventBridgeBuses:           nonNilAwsSlice(workspace.EventBridgeBuses),
			EventBridgeRules:           nonNilAwsSlice(workspace.EventBridgeRules),
		}
	case "route53":
		payload.AwsRoute53InventoryPayload = &models.AwsRoute53InventoryPayload{
			SelectedRoute53HostedZoneID: workspace.SelectedRoute53HostedZoneID,
			Route53StatusMessage:        workspace.Route53StatusMessage,
			Route53HostedZones:          nonNilAwsSlice(workspace.Route53HostedZones),
			Route53ResourceRecordSets:   nonNilAwsSlice(workspace.Route53ResourceRecordSets),
		}
	case "elb":
		payload.AwsElbInventoryPayload = &models.AwsElbInventoryPayload{
			SelectedElbRegion:          workspace.SelectedElbRegion,
			SelectedElbLoadBalancerArn: workspace.SelectedElbLoadBalancerArn,
			ElbStatusMessage:           workspace.ElbStatusMessage,
			ElbRegions:                 nonNilAwsSlice(workspace.ElbRegions),
			ElbLoadBalancers:           nonNilAwsSlice(workspace.ElbLoadBalancers),
			ElbTargetGroups:            nonNilAwsSlice(workspace.ElbTargetGroups),
		}
	case "kms":
		payload.AwsKmsInventoryPayload = &models.AwsKmsInventoryPayload{
			SelectedKmsRegion: workspace.SelectedKmsRegion,
			SelectedKmsKeyId:  workspace.SelectedKmsKeyId,
			KmsStatusMessage:  workspace.KmsStatusMessage,
			KmsRegions:        nonNilAwsSlice(workspace.KmsRegions),
			KmsKeys:           nonNilAwsSlice(workspace.KmsKeys),
			KmsAliases:        nonNilAwsSlice(workspace.KmsAliases),
		}
	case "apigateway":
		payload.AwsApiGatewayInventoryPayload = &models.AwsApiGatewayInventoryPayload{
			SelectedApiGatewayRegion: workspace.SelectedApiGatewayRegion,
			SelectedApiGatewayApiKey: workspace.SelectedApiGatewayApiKey,
			ApiGatewayStatusMessage:  workspace.ApiGatewayStatusMessage,
			ApiGatewayRegions:        nonNilAwsSlice(workspace.ApiGatewayRegions),
			ApiGatewayApis:           nonNilAwsSlice(workspace.ApiGatewayApis),
			ApiGatewayStages:         nonNilAwsSlice(workspace.ApiGatewayStages),
		}
	case "secrets":
		payload.AwsSecretsManagerInventoryPayload = &models.AwsSecretsManagerInventoryPayload{
			SelectedSecretsManagerRegion: workspace.SelectedSecretsManagerRegion,
			SelectedSecretsManagerName:   workspace.SelectedSecretsManagerName,
			SecretsManagerStatusMessage:  workspace.SecretsManagerStatusMessage,
			SecretsManagerRegions:        nonNilAwsSlice(workspace.SecretsManagerRegions),
			SecretsManagerSecrets:        nonNilAwsSlice(workspace.SecretsManagerSecrets),
		}
	case "logs":
		payload.AwsLogsInventoryPayload = &models.AwsLogsInventoryPayload{
			SelectedLogsRegion:   workspace.SelectedLogsRegion,
			SelectedLogGroupName: workspace.SelectedLogGroupName,
			LogsStatusMessage:    workspace.LogsStatusMessage,
			LogsRegions:          nonNilAwsSlice(workspace.LogsRegions),
			LogGroups:            nonNilAwsSlice(workspace.LogGroups),
		}
	case "iam":
		payload.AwsIamInventoryPayload = &models.AwsIamInventoryPayload{
			SelectedIAMRoleName: workspace.SelectedIAMRoleName,
			IAMStatusMessage:    workspace.IAMStatusMessage,
			IAMRoles:            nonNilAwsSlice(workspace.IAMRoles),
			IAMPolicies:         nonNilAwsSlice(workspace.IAMPolicies),
		}
	default:
		return models.AwsInventorySlice{}, fmt.Errorf("unknown AWS inventory scope %q", scope)
	}

	return models.AwsInventorySlice{
		ProviderID: "aws",
		Scope:      scope,
		Payload:    payload,
	}, nil
}

func (s *Service) enrichAwsInventory(
	workspace *models.WorkspaceSnapshot,
	session models.SessionSnapshot,
	mu *sync.Mutex,
) {
	if workspace.Provider == nil ||
		workspace.Provider.ProviderID != "aws" ||
		workspace.Profile == nil {
		return
	}
	opts := awsEnrichmentOptions{lightweight: true}
	var wg sync.WaitGroup
	wg.Add(2)
	go func() {
		defer wg.Done()
		s.enrichS3Inventory(workspace, session, opts, mu)
	}()
	go func() {
		defer wg.Done()
		s.enrichEC2Inventory(workspace, session, opts, mu)
	}()
	wg.Wait()
}

func (s *Service) handleAwsInventoryGet(ctx context.Context, params json.RawMessage, _ Notifier) (any, error) {
	var request struct {
		Scope string `json:"scope"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	scope := strings.TrimSpace(strings.ToLower(request.Scope))
	if scope == "" {
		return nil, errors.New("scope is required")
	}
	if !isValidAwsInventoryScope(scope) {
		return nil, fmt.Errorf("unknown AWS inventory scope %q", request.Scope)
	}
	serviceID := awsServiceIDForInventoryScope(scope)
	if !s.isServiceEnabled("aws", serviceID) {
		return nil, errors.New("that AWS service is disabled in settings")
	}

	snapshot, err := s.discovery.Discover()
	if err != nil {
		return nil, err
	}
	session, err := s.Load(ctx, snapshot)
	if err != nil {
		return nil, err
	}
	if !session.IsLocked || session.CurrentProviderID != "aws" {
		return nil, errors.New("open an AWS workspace before loading service inventory")
	}

	workspace := s.Build(ctx, snapshot, session, sessionport.SnapshotOptions{
		LightweightAWS:     true,
		SkipAzureInventory: true,
		AWSScope:           scope,
	})
	return awsInventorySliceFromWorkspace(scope, workspace)
}
