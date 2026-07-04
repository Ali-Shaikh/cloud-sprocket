// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package awsadapter

import (
	"context"
	"encoding/base64"
	"errors"
	"sort"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/secretsmanager"
	smtypes "github.com/aws/aws-sdk-go-v2/service/secretsmanager/types"

	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/models"
)

// SecretsManagerInventory provides read-only inventory and secret value retrieval.
type SecretsManagerInventory struct {
	settings config.Settings
}

func NewSecretsManagerInventory(settings config.Settings) *SecretsManagerInventory {
	return &SecretsManagerInventory{settings: settings}
}

func (s *SecretsManagerInventory) ListSecrets(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
) ([]models.AwsSecretsManagerSecret, error) {
	if region == "" {
		region = awsRegionHint(profile)
	}
	cfg, err := s.loadConfig(ctx, profile, region)
	if err != nil {
		return nil, err
	}

	client := secretsManagerClient(cfg, profile)
	secrets := []models.AwsSecretsManagerSecret{}
	paginator := secretsmanager.NewListSecretsPaginator(client, &secretsmanager.ListSecretsInput{})
	for paginator.HasMorePages() {
		page, err := paginator.NextPage(ctx)
		if err != nil {
			return nil, err
		}
		for _, item := range page.SecretList {
			secrets = append(secrets, secretSummary(item))
		}
	}
	sort.SliceStable(secrets, func(i, j int) bool {
		return strings.ToLower(secrets[i].Name) < strings.ToLower(secrets[j].Name)
	})
	return secrets, nil
}

func (s *SecretsManagerInventory) GetSecretValue(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
	secretID string,
) (string, error) {
	if region == "" {
		region = awsRegionHint(profile)
	}
	secretID = strings.TrimSpace(secretID)
	if secretID == "" {
		return "", errors.New("a secret name or ARN is required")
	}
	cfg, err := s.loadConfig(ctx, profile, region)
	if err != nil {
		return "", err
	}

	client := secretsManagerClient(cfg, profile)
	result, err := client.GetSecretValue(ctx, &secretsmanager.GetSecretValueInput{
		SecretId: aws.String(secretID),
	})
	if err != nil {
		return "", err
	}
	return secretValueFromResult(result), nil
}

func secretValueFromResult(result *secretsmanager.GetSecretValueOutput) string {
	if result.SecretString != nil {
		return *result.SecretString
	}
	if len(result.SecretBinary) > 0 {
		return base64.StdEncoding.EncodeToString(result.SecretBinary)
	}
	return ""
}

func (s *SecretsManagerInventory) loadConfig(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
) (aws.Config, error) {
	return loadAWSConfig(ctx, s.settings, profile, region)
}

func secretsManagerClient(cfg aws.Config, profile models.ProfileSummary) *secretsmanager.Client {
	return secretsmanager.NewFromConfig(cfg, func(options *secretsmanager.Options) {
		if endpointURL := awsEndpointURL(profile); endpointURL != "" {
			options.BaseEndpoint = aws.String(endpointURL)
		}
	})
}

func secretSummary(item smtypes.SecretListEntry) models.AwsSecretsManagerSecret {
	summary := models.AwsSecretsManagerSecret{
		Arn:         awsString(item.ARN),
		Name:        awsString(item.Name),
		Description: awsString(item.Description),
	}
	if item.LastChangedDate != nil {
		summary.LastChangedDate = item.LastChangedDate.UTC().Format(time.RFC3339)
	}
	if item.LastAccessedDate != nil {
		summary.LastAccessedDate = item.LastAccessedDate.UTC().Format(time.RFC3339)
	}
	if item.RotationEnabled != nil {
		summary.RotationEnabled = *item.RotationEnabled
	}
	return summary
}