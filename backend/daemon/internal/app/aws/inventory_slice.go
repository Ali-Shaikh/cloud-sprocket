// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package aws

import (
	"fmt"

	"cloudsprocket/backend/daemon/internal/models"
)

func nonNilSlice[T any](items []T) []T {
	if items == nil {
		return []T{}
	}
	return items
}

// InventorySliceFromWorkspace projects one AWS inventory scope out of a full
// workspace snapshot. Nil Go collections are emitted as empty arrays so an
// empty refresh authoritatively clears stale desktop lists.
func InventorySliceFromWorkspace(scope string, workspace models.WorkspaceSnapshot) (models.AwsInventorySlice, error) {
	payload := models.AwsInventoryPayload{}
	switch scope {
	case "s3":
		payload.AwsS3InventoryPayload = &models.AwsS3InventoryPayload{
			SelectedS3BucketName: workspace.SelectedS3BucketName,
			SelectedS3ObjectKey:  workspace.SelectedS3ObjectKey,
			S3PrefixFilter:       workspace.S3PrefixFilter,
			S3StatusMessage:      workspace.S3StatusMessage,
			S3Buckets:            nonNilSlice(workspace.S3Buckets),
			S3Objects:            nonNilSlice(workspace.S3Objects),
			S3ObjectsNextToken:   workspace.S3ObjectsNextToken,
			S3ObjectsHasMore:     workspace.S3ObjectsHasMore,
			S3ObjectMetadata:     nonNilSlice(workspace.S3ObjectMetadata),
			S3ExportSnippets:     nonNilSlice(workspace.S3ExportSnippets),
		}
	case "ec2":
		payload.AwsEc2InventoryPayload = &models.AwsEc2InventoryPayload{
			SelectedEC2Region:     workspace.SelectedEC2Region,
			SelectedEC2InstanceID: workspace.SelectedEC2InstanceID,
			EC2StatusMessage:      workspace.EC2StatusMessage,
			EC2Regions:            nonNilSlice(workspace.EC2Regions),
			EC2Instances:          nonNilSlice(workspace.EC2Instances),
		}
	case "lambda":
		payload.AwsLambdaInventoryPayload = &models.AwsLambdaInventoryPayload{
			SelectedLambdaRegion:       workspace.SelectedLambdaRegion,
			SelectedLambdaFunctionName: workspace.SelectedLambdaFunctionName,
			LambdaStatusMessage:        workspace.LambdaStatusMessage,
			LambdaRegions:              nonNilSlice(workspace.LambdaRegions),
			LambdaFunctions:            nonNilSlice(workspace.LambdaFunctions),
		}
	case "dynamodb":
		payload.AwsDynamoDBInventoryPayload = &models.AwsDynamoDBInventoryPayload{
			SelectedDynamoDBRegion:    workspace.SelectedDynamoDBRegion,
			SelectedDynamoDBTableName: workspace.SelectedDynamoDBTableName,
			DynamoDBStatusMessage:     workspace.DynamoDBStatusMessage,
			DynamoDBRegions:           nonNilSlice(workspace.DynamoDBRegions),
			DynamoDBTables:            nonNilSlice(workspace.DynamoDBTables),
		}
	case "sqs":
		payload.AwsSqsInventoryPayload = &models.AwsSqsInventoryPayload{
			SelectedSQSRegion:   workspace.SelectedSQSRegion,
			SelectedSQSQueueURL: workspace.SelectedSQSQueueURL,
			SQSStatusMessage:    workspace.SQSStatusMessage,
			SQSRegions:          nonNilSlice(workspace.SQSRegions),
			SQSQueues:           nonNilSlice(workspace.SQSQueues),
		}
	case "sns":
		payload.AwsSnsInventoryPayload = &models.AwsSnsInventoryPayload{
			SelectedSNSRegion:   workspace.SelectedSNSRegion,
			SelectedSNSTopicArn: workspace.SelectedSNSTopicArn,
			SNSStatusMessage:    workspace.SNSStatusMessage,
			SNSRegions:          nonNilSlice(workspace.SNSRegions),
			SNSTopics:           nonNilSlice(workspace.SNSTopics),
		}
	case "rds":
		payload.AwsRdsInventoryPayload = &models.AwsRdsInventoryPayload{
			SelectedRDSRegion:     workspace.SelectedRDSRegion,
			SelectedRDSInstanceID: workspace.SelectedRDSInstanceID,
			RDSStatusMessage:      workspace.RDSStatusMessage,
			RDSRegions:            nonNilSlice(workspace.RDSRegions),
			RDSInstances:          nonNilSlice(workspace.RDSInstances),
		}
	case "ecs":
		payload.AwsEcsInventoryPayload = &models.AwsEcsInventoryPayload{
			SelectedECSRegion:     workspace.SelectedECSRegion,
			SelectedECSClusterArn: workspace.SelectedECSClusterArn,
			SelectedECSServiceArn: workspace.SelectedECSServiceArn,
			SelectedECSTaskArn:    workspace.SelectedECSTaskArn,
			ECSStatusMessage:      workspace.ECSStatusMessage,
			ECSRegions:            nonNilSlice(workspace.ECSRegions),
			ECSClusters:           nonNilSlice(workspace.ECSClusters),
			ECSServices:           nonNilSlice(workspace.ECSServices),
			ECSTasks:              nonNilSlice(workspace.ECSTasks),
		}
	case "eks":
		payload.AwsEksInventoryPayload = &models.AwsEksInventoryPayload{
			SelectedEKSRegion:      workspace.SelectedEKSRegion,
			SelectedEKSClusterName: workspace.SelectedEKSClusterName,
			EKSStatusMessage:       workspace.EKSStatusMessage,
			EKSRegions:             nonNilSlice(workspace.EKSRegions),
			EKSClusters:            nonNilSlice(workspace.EKSClusters),
			EKSNodeGroups:          nonNilSlice(workspace.EKSNodeGroups),
		}
	case "cloudformation":
		payload.AwsCloudFormationInventoryPayload = &models.AwsCloudFormationInventoryPayload{
			SelectedCloudFormationRegion:    workspace.SelectedCloudFormationRegion,
			SelectedCloudFormationStackName: workspace.SelectedCloudFormationStackName,
			CloudFormationStatusMessage:     workspace.CloudFormationStatusMessage,
			CloudFormationRegions:           nonNilSlice(workspace.CloudFormationRegions),
			CloudFormationStacks:            nonNilSlice(workspace.CloudFormationStacks),
			CloudFormationStackEvents:       nonNilSlice(workspace.CloudFormationStackEvents),
		}
	case "eventbridge":
		payload.AwsEventBridgeInventoryPayload = &models.AwsEventBridgeInventoryPayload{
			SelectedEventBridgeRegion:  workspace.SelectedEventBridgeRegion,
			SelectedEventBridgeBusName: workspace.SelectedEventBridgeBusName,
			EventBridgeStatusMessage:   workspace.EventBridgeStatusMessage,
			EventBridgeRegions:         nonNilSlice(workspace.EventBridgeRegions),
			EventBridgeBuses:           nonNilSlice(workspace.EventBridgeBuses),
			EventBridgeRules:           nonNilSlice(workspace.EventBridgeRules),
		}
	case "route53":
		payload.AwsRoute53InventoryPayload = &models.AwsRoute53InventoryPayload{
			SelectedRoute53HostedZoneID: workspace.SelectedRoute53HostedZoneID,
			Route53StatusMessage:        workspace.Route53StatusMessage,
			Route53HostedZones:          nonNilSlice(workspace.Route53HostedZones),
			Route53ResourceRecordSets:   nonNilSlice(workspace.Route53ResourceRecordSets),
		}
	case "elb":
		payload.AwsElbInventoryPayload = &models.AwsElbInventoryPayload{
			SelectedElbRegion:          workspace.SelectedElbRegion,
			SelectedElbLoadBalancerArn: workspace.SelectedElbLoadBalancerArn,
			ElbStatusMessage:           workspace.ElbStatusMessage,
			ElbRegions:                 nonNilSlice(workspace.ElbRegions),
			ElbLoadBalancers:           nonNilSlice(workspace.ElbLoadBalancers),
			ElbTargetGroups:            nonNilSlice(workspace.ElbTargetGroups),
		}
	case "kms":
		payload.AwsKmsInventoryPayload = &models.AwsKmsInventoryPayload{
			SelectedKmsRegion: workspace.SelectedKmsRegion,
			SelectedKmsKeyId:  workspace.SelectedKmsKeyId,
			KmsStatusMessage:  workspace.KmsStatusMessage,
			KmsRegions:        nonNilSlice(workspace.KmsRegions),
			KmsKeys:           nonNilSlice(workspace.KmsKeys),
			KmsAliases:        nonNilSlice(workspace.KmsAliases),
		}
	case "apigateway":
		payload.AwsApiGatewayInventoryPayload = &models.AwsApiGatewayInventoryPayload{
			SelectedApiGatewayRegion: workspace.SelectedApiGatewayRegion,
			SelectedApiGatewayApiKey: workspace.SelectedApiGatewayApiKey,
			ApiGatewayStatusMessage:  workspace.ApiGatewayStatusMessage,
			ApiGatewayRegions:        nonNilSlice(workspace.ApiGatewayRegions),
			ApiGatewayApis:           nonNilSlice(workspace.ApiGatewayApis),
			ApiGatewayStages:         nonNilSlice(workspace.ApiGatewayStages),
		}
	case "secrets":
		payload.AwsSecretsManagerInventoryPayload = &models.AwsSecretsManagerInventoryPayload{
			SelectedSecretsManagerRegion: workspace.SelectedSecretsManagerRegion,
			SelectedSecretsManagerName:   workspace.SelectedSecretsManagerName,
			SecretsManagerStatusMessage:  workspace.SecretsManagerStatusMessage,
			SecretsManagerRegions:        nonNilSlice(workspace.SecretsManagerRegions),
			SecretsManagerSecrets:        nonNilSlice(workspace.SecretsManagerSecrets),
		}
	case "logs":
		payload.AwsLogsInventoryPayload = &models.AwsLogsInventoryPayload{
			SelectedLogsRegion:   workspace.SelectedLogsRegion,
			SelectedLogGroupName: workspace.SelectedLogGroupName,
			LogsStatusMessage:    workspace.LogsStatusMessage,
			LogsRegions:          nonNilSlice(workspace.LogsRegions),
			LogGroups:            nonNilSlice(workspace.LogGroups),
		}
	case "iam":
		payload.AwsIamInventoryPayload = &models.AwsIamInventoryPayload{
			SelectedIAMRoleName: workspace.SelectedIAMRoleName,
			IAMStatusMessage:    workspace.IAMStatusMessage,
			IAMRoles:            nonNilSlice(workspace.IAMRoles),
			IAMPolicies:         nonNilSlice(workspace.IAMPolicies),
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
