package awsadapter

import (
	"context"
	"fmt"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/iam"

	"cloudsprocket/backend/daemon/internal/models"
)

const lambdaExecutionRoleName = "cloudsprocket-lambda"

const lambdaTrustPolicy = `{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Service": "lambda.amazonaws.com" },
      "Action": "sts:AssumeRole"
    }
  ]
}`

func iamClient(cfg aws.Config, profile models.ProfileSummary) *iam.Client {
	return iam.NewFromConfig(cfg, func(options *iam.Options) {
		if endpointURL := awsEndpointURL(profile); endpointURL != "" {
			options.BaseEndpoint = aws.String(endpointURL)
		}
	})
}

func (l *LambdaInventory) ensureLambdaExecutionRole(
	ctx context.Context,
	cfg aws.Config,
	profile models.ProfileSummary,
) (string, error) {
	client := iamClient(cfg, profile)
	getOut, err := client.GetRole(ctx, &iam.GetRoleInput{
		RoleName: aws.String(lambdaExecutionRoleName),
	})
	if err == nil && getOut.Role != nil && getOut.Role.Arn != nil {
		return *getOut.Role.Arn, nil
	}

	_, createErr := client.CreateRole(ctx, &iam.CreateRoleInput{
		RoleName:                 aws.String(lambdaExecutionRoleName),
		AssumeRolePolicyDocument: aws.String(lambdaTrustPolicy),
		Description:              aws.String("CloudSprocket Lambda execution role"),
	})
	if createErr != nil {
		getOut, retryErr := client.GetRole(ctx, &iam.GetRoleInput{
			RoleName: aws.String(lambdaExecutionRoleName),
		})
		if retryErr == nil && getOut.Role != nil && getOut.Role.Arn != nil {
			return *getOut.Role.Arn, nil
		}
		return "", createErr
	}

	_, attachErr := client.AttachRolePolicy(ctx, &iam.AttachRolePolicyInput{
		RoleName:  aws.String(lambdaExecutionRoleName),
		PolicyArn: aws.String("arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"),
	})
	if attachErr != nil {
		return "", attachErr
	}

	getOut, err = client.GetRole(ctx, &iam.GetRoleInput{
		RoleName: aws.String(lambdaExecutionRoleName),
	})
	if err != nil || getOut.Role == nil || getOut.Role.Arn == nil {
		return "", fmt.Errorf("lambda execution role was created but ARN could not be read")
	}
	return *getOut.Role.Arn, nil
}