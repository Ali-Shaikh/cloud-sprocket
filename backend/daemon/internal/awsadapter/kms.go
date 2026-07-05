// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package awsadapter

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/kms"
	"github.com/aws/aws-sdk-go-v2/service/kms/types"

	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/models"
)

// KmsInventory provides read-only inventory for KMS keys and aliases.
type KmsInventory struct {
	settings config.Settings
}

func NewKmsInventory(settings config.Settings) *KmsInventory {
	return &KmsInventory{settings: settings}
}

func (k *KmsInventory) ListKeys(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
) ([]models.AwsKmsKey, error) {
	if region == "" {
		region = awsRegionHint(profile)
	}
	cfg, err := k.loadConfig(ctx, profile, region)
	if err != nil {
		return nil, err
	}

	client := kmsClient(cfg, profile)
	keys := make([]models.AwsKmsKey, 0)
	var marker *string
	for {
		res, err := client.ListKeys(ctx, &kms.ListKeysInput{
			Marker: marker,
		})
		if err != nil {
			return nil, err
		}
		for _, key := range res.Keys {
			keys = append(keys, kmsKeyListSummary(key))
		}
		if !res.Truncated || res.NextMarker == nil || *res.NextMarker == "" {
			break
		}
		marker = res.NextMarker
	}
	sort.SliceStable(keys, func(i, j int) bool {
		return keys[i].KeyId < keys[j].KeyId
	})
	return keys, nil
}

func (k *KmsInventory) ListAliases(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
) ([]models.AwsKmsAlias, error) {
	if region == "" {
		region = awsRegionHint(profile)
	}
	cfg, err := k.loadConfig(ctx, profile, region)
	if err != nil {
		return nil, err
	}

	client := kmsClient(cfg, profile)
	aliases := make([]models.AwsKmsAlias, 0)
	var marker *string
	for {
		res, err := client.ListAliases(ctx, &kms.ListAliasesInput{
			Marker: marker,
		})
		if err != nil {
			return nil, err
		}
		for _, alias := range res.Aliases {
			aliases = append(aliases, kmsAliasSummary(alias))
		}
		if !res.Truncated || res.NextMarker == nil || *res.NextMarker == "" {
			break
		}
		marker = res.NextMarker
	}
	sort.SliceStable(aliases, func(i, j int) bool {
		return aliases[i].AliasName < aliases[j].AliasName
	})
	return aliases, nil
}

func (k *KmsInventory) DescribeKey(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
	keyID string,
) (models.AwsKmsKey, error) {
	keyID = strings.TrimSpace(keyID)
	if keyID == "" {
		return models.AwsKmsKey{}, fmt.Errorf("key ID is required")
	}
	if region == "" {
		region = awsRegionHint(profile)
	}
	cfg, err := k.loadConfig(ctx, profile, region)
	if err != nil {
		return models.AwsKmsKey{}, err
	}

	client := kmsClient(cfg, profile)
	res, err := client.DescribeKey(ctx, &kms.DescribeKeyInput{
		KeyId: aws.String(keyID),
	})
	if err != nil {
		return models.AwsKmsKey{}, fmt.Errorf("describe key %s: %w", keyID, err)
	}
	if res.KeyMetadata == nil {
		return models.AwsKmsKey{}, fmt.Errorf("describe key %s: metadata was not returned", keyID)
	}
	return kmsKeyMetadataSummary(*res.KeyMetadata), nil
}

func (k *KmsInventory) loadConfig(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
) (aws.Config, error) {
	return loadAWSConfig(ctx, k.settings, profile, region)
}

func kmsClient(cfg aws.Config, profile models.ProfileSummary) *kms.Client {
	return kms.NewFromConfig(cfg, func(options *kms.Options) {
		if endpointURL := awsEndpointURL(profile); endpointURL != "" {
			options.BaseEndpoint = aws.String(endpointURL)
		}
	})
}

func kmsKeyListSummary(key types.KeyListEntry) models.AwsKmsKey {
	return models.AwsKmsKey{
		KeyId: awsString(key.KeyId),
		Arn:   awsString(key.KeyArn),
	}
}

func kmsKeyMetadataSummary(metadata types.KeyMetadata) models.AwsKmsKey {
	summary := models.AwsKmsKey{
		KeyId:       awsString(metadata.KeyId),
		Arn:         awsString(metadata.Arn),
		Description: awsString(metadata.Description),
		KeyUsage:    string(metadata.KeyUsage),
		KeyState:    string(metadata.KeyState),
		KeySpec:     string(metadata.KeySpec),
		Origin:      string(metadata.Origin),
	}
	if metadata.CreationDate != nil {
		summary.CreationDate = metadata.CreationDate.UTC().Format(time.RFC3339)
	}
	if metadata.DeletionDate != nil {
		summary.DeletionDate = metadata.DeletionDate.UTC().Format(time.RFC3339)
	}
	if metadata.MultiRegion != nil {
		summary.MultiRegion = *metadata.MultiRegion
	}
	summary.Enabled = metadata.Enabled
	return summary
}

func kmsAliasSummary(alias types.AliasListEntry) models.AwsKmsAlias {
	return models.AwsKmsAlias{
		AliasName:   awsString(alias.AliasName),
		AliasArn:    awsString(alias.AliasArn),
		TargetKeyId: awsString(alias.TargetKeyId),
	}
}