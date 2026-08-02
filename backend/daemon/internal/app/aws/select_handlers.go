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
	"cloudsprocket/backend/daemon/internal/models"
)

// HandleS3SelectBucket implements aws.s3.selectBucket.
func (s *Service) HandleS3SelectBucket(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	var request struct {
		BucketName string `json:"bucketName"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAWSWorkspace(ctx, "open an AWS workspace before selecting an S3 bucket", func(session *models.SessionSnapshot) error {
		session.SelectedS3BucketName = request.BucketName
		session.SelectedS3ObjectKey = ""
		// Bucket paths are not portable: always open the new bucket at its root.
		session.S3PrefixFilter = ""
		return nil
	})
	if err != nil {
		return nil, err
	}
	if s.invalidator != nil {
		s.invalidator.InvalidateResourceCacheScope(ctx, "aws.s3.objects.page")
	}
	return s.finishAWSSelection(ctx, snapshot, session, notifier, "s3", "info", fmt.Sprintf("Selected S3 bucket %s.", request.BucketName), false)
}

// HandleS3SelectObject implements aws.s3.selectObject.
func (s *Service) HandleS3SelectObject(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	var request struct {
		ObjectKey string `json:"objectKey"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAWSWorkspace(ctx, "select an S3 bucket before selecting an object", func(session *models.SessionSnapshot) error {
		if session.SelectedS3BucketName == "" {
			return errors.New("select an S3 bucket before selecting an object")
		}
		session.SelectedS3ObjectKey = request.ObjectKey
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAWSSelection(ctx, snapshot, session, notifier, "s3", "", "", false)
}

// HandleS3SetPrefixFilter implements aws.s3.setPrefixFilter.
func (s *Service) HandleS3SetPrefixFilter(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	var request struct {
		Prefix string `json:"prefix"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAWSWorkspace(ctx, "open an AWS workspace before setting an S3 prefix filter", func(session *models.SessionSnapshot) error {
		session.S3PrefixFilter = request.Prefix
		session.SelectedS3ObjectKey = ""
		return nil
	})
	if err != nil {
		return nil, err
	}
	// Opening a folder must re-list the first page for the new prefix.
	if s.invalidator != nil {
		s.invalidator.InvalidateResourceCacheScope(ctx, "aws.s3.objects.page")
	}
	label := "bucket root"
	if strings.TrimSpace(request.Prefix) != "" {
		label = request.Prefix
	}
	return s.finishAWSSelection(ctx, snapshot, session, notifier, "s3", "info", fmt.Sprintf("Opened folder %s.", label), false)
}

// HandleEC2SelectRegion implements aws.ec2.selectRegion.
// EC2 select RPCs replace the workspace wholesale on the client (no merge helper),
// so the rebuild omits AWSScope.
func (s *Service) HandleEC2SelectRegion(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	var request struct {
		Region string `json:"region"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAWSWorkspace(ctx, "open an AWS workspace before selecting an EC2 region", func(session *models.SessionSnapshot) error {
		session.SelectedEC2Region = request.Region
		session.SelectedEC2InstanceID = ""
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAWSSelection(ctx, snapshot, session, notifier, "", "info", fmt.Sprintf("Selected EC2 region %s.", request.Region), false)
}

// HandleEC2SelectInstance implements aws.ec2.selectInstance.
func (s *Service) HandleEC2SelectInstance(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	var request struct {
		InstanceID string `json:"instanceId"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAWSWorkspace(ctx, "open an AWS workspace before selecting an EC2 instance", func(session *models.SessionSnapshot) error {
		session.SelectedEC2InstanceID = request.InstanceID
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAWSSelection(ctx, snapshot, session, notifier, "", "", "", false)
}

// HandleLambdaSelectRegion implements aws.lambda.selectRegion.
func (s *Service) HandleLambdaSelectRegion(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	var request struct {
		Region string `json:"region"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAWSWorkspace(ctx, "open an AWS workspace before selecting a Lambda region", func(session *models.SessionSnapshot) error {
		session.SelectedLambdaRegion = request.Region
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAWSSelection(ctx, snapshot, session, notifier, "lambda", "info", fmt.Sprintf("Selected Lambda region %s.", request.Region), true)
}

// HandleLambdaSelectFunction implements aws.lambda.selectFunction.
func (s *Service) HandleLambdaSelectFunction(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	var request struct {
		FunctionName string `json:"functionName"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAWSWorkspace(ctx, "open an AWS workspace before selecting a Lambda function", func(session *models.SessionSnapshot) error {
		session.SelectedLambdaFunctionName = request.FunctionName
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAWSSelection(ctx, snapshot, session, notifier, "lambda", "", "", false)
}

// HandleDynamoDBSelectRegion implements aws.dynamodb.selectRegion.
func (s *Service) HandleDynamoDBSelectRegion(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	var request struct {
		Region string `json:"region"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAWSWorkspace(ctx, "open an AWS workspace before selecting a DynamoDB region", func(session *models.SessionSnapshot) error {
		session.SelectedDynamoDBRegion = request.Region
		session.SelectedDynamoDBTableName = ""
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAWSSelection(ctx, snapshot, session, notifier, "dynamodb", "info", fmt.Sprintf("Selected DynamoDB region %s.", request.Region), true)
}

// HandleDynamoDBSelectTable implements aws.dynamodb.selectTable.
func (s *Service) HandleDynamoDBSelectTable(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	var request struct {
		TableName string `json:"tableName"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAWSWorkspace(ctx, "open an AWS workspace before selecting a DynamoDB table", func(session *models.SessionSnapshot) error {
		session.SelectedDynamoDBTableName = request.TableName
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAWSSelection(ctx, snapshot, session, notifier, "dynamodb", "", "", false)
}

// HandleSQSSelectRegion implements aws.sqs.selectRegion.
func (s *Service) HandleSQSSelectRegion(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
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
	return s.finishAWSSelection(ctx, snapshot, session, notifier, "sqs", "info", fmt.Sprintf("Selected SQS region %s.", request.Region), true)
}

// HandleSQSSelectQueue implements aws.sqs.selectQueue.
func (s *Service) HandleSQSSelectQueue(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
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
	return s.finishAWSSelection(ctx, snapshot, session, notifier, "sqs", "", "", false)
}

// HandleSNSSelectRegion implements aws.sns.selectRegion.
func (s *Service) HandleSNSSelectRegion(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	var request struct {
		Region string `json:"region"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAWSWorkspace(ctx, "open an AWS workspace before selecting an SNS region", func(session *models.SessionSnapshot) error {
		session.SelectedSNSRegion = request.Region
		session.SelectedSNSTopicArn = ""
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAWSSelection(ctx, snapshot, session, notifier, "sns", "", "", false)
}

// HandleSNSSelectTopic implements aws.sns.selectTopic.
func (s *Service) HandleSNSSelectTopic(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	var request struct {
		TopicArn string `json:"topicArn"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAWSWorkspace(ctx, "open an AWS workspace before selecting an SNS topic", func(session *models.SessionSnapshot) error {
		session.SelectedSNSTopicArn = request.TopicArn
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAWSSelection(ctx, snapshot, session, notifier, "sns", "", "", false)
}

// HandleRDSSelectRegion implements aws.rds.selectRegion.
func (s *Service) HandleRDSSelectRegion(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	var request struct {
		Region string `json:"region"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAWSWorkspace(ctx, "open an AWS workspace before selecting an RDS region", func(session *models.SessionSnapshot) error {
		session.SelectedRDSRegion = request.Region
		session.SelectedRDSInstanceID = ""
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAWSSelection(ctx, snapshot, session, notifier, "rds", "", "", false)
}

// HandleRDSSelectInstance implements aws.rds.selectInstance.
func (s *Service) HandleRDSSelectInstance(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	var request struct {
		InstanceID string `json:"instanceId"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAWSWorkspace(ctx, "open an AWS workspace before selecting an RDS instance", func(session *models.SessionSnapshot) error {
		session.SelectedRDSInstanceID = request.InstanceID
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAWSSelection(ctx, snapshot, session, notifier, "rds", "", "", false)
}

// HandleECSSelectRegion implements aws.ecs.selectRegion.
func (s *Service) HandleECSSelectRegion(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	var request struct {
		Region string `json:"region"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAWSWorkspace(ctx, "open an AWS workspace before selecting an ECS region", func(session *models.SessionSnapshot) error {
		session.SelectedECSRegion = request.Region
		session.SelectedECSClusterArn = ""
		session.SelectedECSServiceArn = ""
		session.SelectedECSTaskArn = ""
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAWSSelection(ctx, snapshot, session, notifier, "ecs", "", "", false)
}

// HandleECSSelectCluster implements aws.ecs.selectCluster.
func (s *Service) HandleECSSelectCluster(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	var request struct {
		ClusterArn string `json:"clusterArn"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAWSWorkspace(ctx, "open an AWS workspace before selecting an ECS cluster", func(session *models.SessionSnapshot) error {
		session.SelectedECSClusterArn = request.ClusterArn
		session.SelectedECSServiceArn = ""
		session.SelectedECSTaskArn = ""
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAWSSelection(ctx, snapshot, session, notifier, "ecs", "", "", false)
}

// HandleECSSelectService implements aws.ecs.selectService.
func (s *Service) HandleECSSelectService(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	var request struct {
		ServiceArn string `json:"serviceArn"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAWSWorkspace(ctx, "open an AWS workspace before selecting an ECS service", func(session *models.SessionSnapshot) error {
		session.SelectedECSServiceArn = request.ServiceArn
		session.SelectedECSTaskArn = ""
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAWSSelection(ctx, snapshot, session, notifier, "ecs", "", "", false)
}

// HandleECSSelectTask implements aws.ecs.selectTask.
func (s *Service) HandleECSSelectTask(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	var request struct {
		TaskArn string `json:"taskArn"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAWSWorkspace(ctx, "open an AWS workspace before selecting an ECS task", func(session *models.SessionSnapshot) error {
		session.SelectedECSTaskArn = request.TaskArn
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAWSSelection(ctx, snapshot, session, notifier, "ecs", "", "", false)
}

// HandleEKSSelectRegion implements aws.eks.selectRegion.
func (s *Service) HandleEKSSelectRegion(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	var request struct {
		Region string `json:"region"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAWSWorkspace(ctx, "open an AWS workspace before selecting an EKS region", func(session *models.SessionSnapshot) error {
		session.SelectedEKSRegion = request.Region
		session.SelectedEKSClusterName = ""
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAWSSelection(ctx, snapshot, session, notifier, "eks", "", "", false)
}

// HandleEKSSelectCluster implements aws.eks.selectCluster.
func (s *Service) HandleEKSSelectCluster(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	var request struct {
		ClusterName string `json:"clusterName"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAWSWorkspace(ctx, "open an AWS workspace before selecting an EKS cluster", func(session *models.SessionSnapshot) error {
		session.SelectedEKSClusterName = request.ClusterName
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAWSSelection(ctx, snapshot, session, notifier, "eks", "", "", false)
}

// HandleCloudFormationSelectRegion implements aws.cloudformation.selectRegion.
func (s *Service) HandleCloudFormationSelectRegion(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	var request struct {
		Region string `json:"region"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAWSWorkspace(ctx, "open an AWS workspace before selecting a CloudFormation region", func(session *models.SessionSnapshot) error {
		session.SelectedCloudFormationRegion = request.Region
		session.SelectedCloudFormationStackName = ""
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAWSSelection(ctx, snapshot, session, notifier, "cloudformation", "", "", false)
}

// HandleCloudFormationSelectStack implements aws.cloudformation.selectStack.
func (s *Service) HandleCloudFormationSelectStack(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	var request struct {
		StackName string `json:"stackName"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAWSWorkspace(ctx, "open an AWS workspace before selecting a CloudFormation stack", func(session *models.SessionSnapshot) error {
		session.SelectedCloudFormationStackName = request.StackName
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAWSSelection(ctx, snapshot, session, notifier, "cloudformation", "", "", false)
}

// HandleEventBridgeSelectRegion implements aws.eventbridge.selectRegion.
func (s *Service) HandleEventBridgeSelectRegion(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	var request struct {
		Region string `json:"region"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAWSWorkspace(ctx, "open an AWS workspace before selecting an EventBridge region", func(session *models.SessionSnapshot) error {
		session.SelectedEventBridgeRegion = request.Region
		session.SelectedEventBridgeBusName = ""
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAWSSelection(ctx, snapshot, session, notifier, "eventbridge", "", "", false)
}

// HandleEventBridgeSelectBus implements aws.eventbridge.selectBus.
func (s *Service) HandleEventBridgeSelectBus(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	var request struct {
		BusName string `json:"busName"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAWSWorkspace(ctx, "open an AWS workspace before selecting an EventBridge bus", func(session *models.SessionSnapshot) error {
		session.SelectedEventBridgeBusName = request.BusName
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAWSSelection(ctx, snapshot, session, notifier, "eventbridge", "", "", false)
}

// HandleRoute53SelectHostedZone implements aws.route53.selectHostedZone.
func (s *Service) HandleRoute53SelectHostedZone(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	var request struct {
		HostedZoneID string `json:"hostedZoneId"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAWSWorkspace(ctx, "open an AWS workspace before selecting a Route 53 hosted zone", func(session *models.SessionSnapshot) error {
		session.SelectedRoute53HostedZoneID = request.HostedZoneID
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAWSSelection(ctx, snapshot, session, notifier, "route53", "", "", false)
}

// HandleELBSelectRegion implements aws.elb.selectRegion.
func (s *Service) HandleELBSelectRegion(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	var request struct {
		Region string `json:"region"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAWSWorkspace(ctx, "open an AWS workspace before selecting a load balancer region", func(session *models.SessionSnapshot) error {
		session.SelectedElbRegion = request.Region
		session.SelectedElbLoadBalancerArn = ""
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAWSSelection(ctx, snapshot, session, notifier, "elb", "", "", false)
}

// HandleELBSelectLoadBalancer implements aws.elb.selectLoadBalancer.
func (s *Service) HandleELBSelectLoadBalancer(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	var request struct {
		LoadBalancerArn string `json:"loadBalancerArn"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAWSWorkspace(ctx, "open an AWS workspace before selecting a load balancer", func(session *models.SessionSnapshot) error {
		session.SelectedElbLoadBalancerArn = request.LoadBalancerArn
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAWSSelection(ctx, snapshot, session, notifier, "elb", "", "", false)
}

// HandleKMSSelectRegion implements aws.kms.selectRegion.
func (s *Service) HandleKMSSelectRegion(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	var request struct {
		Region string `json:"region"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAWSWorkspace(ctx, "open an AWS workspace before selecting a KMS region", func(session *models.SessionSnapshot) error {
		session.SelectedKmsRegion = request.Region
		session.SelectedKmsKeyId = ""
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAWSSelection(ctx, snapshot, session, notifier, "kms", "", "", false)
}

// HandleKMSSelectKey implements aws.kms.selectKey.
func (s *Service) HandleKMSSelectKey(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	var request struct {
		KeyId string `json:"keyId"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAWSWorkspace(ctx, "open an AWS workspace before selecting a KMS key", func(session *models.SessionSnapshot) error {
		session.SelectedKmsKeyId = request.KeyId
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAWSSelection(ctx, snapshot, session, notifier, "kms", "", "", false)
}

// HandleAPIGatewaySelectRegion implements aws.apigateway.selectRegion.
func (s *Service) HandleAPIGatewaySelectRegion(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	var request struct {
		Region string `json:"region"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAWSWorkspace(ctx, "open an AWS workspace before selecting an API Gateway region", func(session *models.SessionSnapshot) error {
		session.SelectedApiGatewayRegion = request.Region
		session.SelectedApiGatewayApiKey = ""
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAWSSelection(ctx, snapshot, session, notifier, "apigateway", "", "", false)
}

// HandleAPIGatewaySelectAPI implements aws.apigateway.selectApi.
func (s *Service) HandleAPIGatewaySelectAPI(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	var request struct {
		ApiKey string `json:"apiKey"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAWSWorkspace(ctx, "open an AWS workspace before selecting an API Gateway API", func(session *models.SessionSnapshot) error {
		session.SelectedApiGatewayApiKey = request.ApiKey
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAWSSelection(ctx, snapshot, session, notifier, "apigateway", "", "", false)
}

// HandleSecretsSelectRegion implements aws.secrets.selectRegion.
func (s *Service) HandleSecretsSelectRegion(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	var request struct {
		Region string `json:"region"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAWSWorkspace(ctx, "open an AWS workspace before selecting a Secrets Manager region", func(session *models.SessionSnapshot) error {
		session.SelectedSecretsManagerRegion = request.Region
		session.SelectedSecretsManagerName = ""
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAWSSelection(ctx, snapshot, session, notifier, "secrets", "", "", false)
}

// HandleSecretsSelectSecret implements aws.secrets.selectSecret.
func (s *Service) HandleSecretsSelectSecret(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	var request struct {
		SecretName string `json:"secretName"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAWSWorkspace(ctx, "open an AWS workspace before selecting a secret", func(session *models.SessionSnapshot) error {
		session.SelectedSecretsManagerName = strings.TrimSpace(request.SecretName)
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAWSSelection(ctx, snapshot, session, notifier, "secrets", "", "", false)
}

// HandleLogsSelectRegion implements aws.logs.selectRegion.
func (s *Service) HandleLogsSelectRegion(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	var request struct {
		Region string `json:"region"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAWSWorkspace(ctx, "open an AWS workspace before selecting a CloudWatch Logs region", func(session *models.SessionSnapshot) error {
		session.SelectedLogsRegion = request.Region
		session.SelectedLogGroupName = ""
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAWSSelection(ctx, snapshot, session, notifier, "logs", "", "", false)
}

// HandleLogsSelectLogGroup implements aws.logs.selectLogGroup.
func (s *Service) HandleLogsSelectLogGroup(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	var request struct {
		LogGroupName string `json:"logGroupName"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAWSWorkspace(ctx, "open an AWS workspace before selecting a log group", func(session *models.SessionSnapshot) error {
		session.SelectedLogGroupName = request.LogGroupName
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAWSSelection(ctx, snapshot, session, notifier, "logs", "", "", false)
}

// HandleIAMSelectRole implements aws.iam.selectRole.
func (s *Service) HandleIAMSelectRole(ctx context.Context, params json.RawMessage, notifier sessionport.Notifier) (any, error) {
	var request struct {
		RoleName string `json:"roleName"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAWSWorkspace(ctx, "open an AWS workspace before selecting an IAM role", func(session *models.SessionSnapshot) error {
		session.SelectedIAMRoleName = request.RoleName
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAWSSelection(ctx, snapshot, session, notifier, "iam", "", "", false)
}
