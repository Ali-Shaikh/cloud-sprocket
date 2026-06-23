// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package awsadapter

import (
	"context"

	"github.com/aws/aws-sdk-go-v2/aws"
	awscfg "github.com/aws/aws-sdk-go-v2/config"

	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/models"
)

// loadAWSConfig builds an AWS SDK config bound to a CloudSprocket profile: it
// reads the app-managed shared config/credentials files and pins the region.
// Every service adapter resolves its client config through here so credential
// resolution (and any future SSO, assume-role, or retry policy) lives in one place.
func loadAWSConfig(
	ctx context.Context,
	settings config.Settings,
	profile models.ProfileSummary,
	region string,
) (aws.Config, error) {
	return awscfg.LoadDefaultConfig(
		ctx,
		awscfg.WithSharedConfigProfile(profile.ProfileID),
		awscfg.WithSharedConfigFiles([]string{settings.AWSConfigPath}),
		awscfg.WithSharedCredentialsFiles([]string{settings.AWSCredentialsPath}),
		awscfg.WithRegion(region),
	)
}
