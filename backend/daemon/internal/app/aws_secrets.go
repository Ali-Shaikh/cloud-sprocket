// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"fmt"
	"sync"

	"cloudsprocket/backend/daemon/internal/models"
)

func (s *Service) enrichSecretsManagerInventory(
	workspace *models.WorkspaceSnapshot,
	session models.SessionSnapshot,
	opts awsEnrichmentOptions,
	mu *sync.Mutex,
) {
	if workspace.Provider == nil ||
		workspace.Provider.ProviderID != "aws" ||
		workspace.Profile == nil ||
		s.secretsManager == nil {
		return
	}
	timeoutCtx, cancel := s.withAWSTimeout(context.Background())
	regions := s.secretsManagerRegions(timeoutCtx, *workspace.Profile)
	cancel()
	selectedRegion := s.selectedSecretsManagerRegion(session, regions, *workspace.Profile)

	if opts.lightweight {
		status := "No region is available for Secrets Manager in this AWS workspace."
		if selectedRegion != "" {
			status = fmt.Sprintf("Loaded %d region(s). Select %s to browse secrets.", len(regions), selectedRegion)
		} else if len(regions) > 0 {
			status = fmt.Sprintf("Loaded %d region(s). Select a region to browse secrets.", len(regions))
		}
		lockWorkspace(mu, func() {
			workspace.SecretsManagerRegions = regions
			workspace.SelectedSecretsManagerRegion = selectedRegion
			workspace.SecretsManagerSecrets = []models.AwsSecretsManagerSecret{}
			workspace.SelectedSecretsManagerName = ""
			workspace.SecretsManagerStatusMessage = status
		})
		return
	}

	timeoutCtx, cancel = s.withAWSTimeout(context.Background())
	secrets := s.secretsManagerSecrets(timeoutCtx, *workspace.Profile, selectedRegion)
	cancel()
	selectedSecret := s.selectedSecretsManagerName(session, secrets)

	status := "No region is available for Secrets Manager in this AWS workspace."
	if selectedRegion != "" {
		if len(secrets) == 0 {
			status = fmt.Sprintf("No secrets were returned for %s.", selectedRegion)
		} else {
			status = fmt.Sprintf("Loaded %d secrets from %s.", len(secrets), selectedRegion)
		}
	}

	lockWorkspace(mu, func() {
		workspace.SecretsManagerRegions = regions
		workspace.SelectedSecretsManagerRegion = selectedRegion
		workspace.SecretsManagerSecrets = secrets
		workspace.SelectedSecretsManagerName = selectedSecret
		workspace.SecretsManagerStatusMessage = status
	})
}

func (s *Service) secretsManagerRegions(ctx context.Context, profile models.ProfileSummary) []string {
	return s.lambdaRegions(ctx, profile)
}

func (s *Service) selectedSecretsManagerRegion(
	session models.SessionSnapshot,
	regions []string,
	profile models.ProfileSummary,
) string {
	if session.SelectedSecretsManagerRegion != "" {
		for _, region := range regions {
			if region == session.SelectedSecretsManagerRegion {
				return session.SelectedSecretsManagerRegion
			}
		}
	}
	return s.selectedApiGatewayRegion(session, regions, profile)
}

func (s *Service) secretsManagerSecrets(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
) []models.AwsSecretsManagerSecret {
	if region == "" {
		return []models.AwsSecretsManagerSecret{}
	}
	const scope = "aws.secretsmanager.secrets"
	queryHash := profile.ProfileID + "|" + region

	var cached []models.AwsSecretsManagerSecret
	if _, ok, _ := s.loadCachedResource(ctx, scope, queryHash, &cached); ok {
		return cached
	}

	secrets, err := s.secretsManager.ListSecrets(ctx, profile, region)
	if err == nil {
		_ = s.saveResourceCacheWithTTL(ctx, scope, queryHash, secrets)
		return secrets
	}
	_, ok, cacheErr := s.store.LoadResourceCache(ctx, scope, queryHash, &cached)
	if cacheErr == nil && ok {
		return cached
	}
	return []models.AwsSecretsManagerSecret{}
}

func (s *Service) selectedSecretsManagerName(
	session models.SessionSnapshot,
	secrets []models.AwsSecretsManagerSecret,
) string {
	if session.SelectedSecretsManagerName != "" {
		for _, secret := range secrets {
			if secret.Name == session.SelectedSecretsManagerName {
				return session.SelectedSecretsManagerName
			}
		}
	}
	if len(secrets) == 0 {
		return ""
	}
	return secrets[0].Name
}
