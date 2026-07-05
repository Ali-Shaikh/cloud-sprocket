// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"

	"cloudsprocket/backend/daemon/internal/models"
)

func (s *Service) enrichKmsInventory(
	workspace *models.WorkspaceSnapshot,
	session models.SessionSnapshot,
	opts awsEnrichmentOptions,
	mu *sync.Mutex,
) {
	if workspace.Provider == nil ||
		workspace.Provider.ProviderID != "aws" ||
		workspace.Profile == nil ||
		s.kms == nil {
		return
	}

	timeoutCtx, cancel := s.withAWSTimeout(context.Background())
	regions := s.kmsRegions(timeoutCtx, *workspace.Profile)
	cancel()
	selectedRegion := s.selectedKmsRegion(session, regions, *workspace.Profile)

	if opts.lightweight {
		status := "Select a key to browse aliases and metadata."
		if selectedRegion != "" {
			status = fmt.Sprintf("Loaded %d region(s). Select %s to browse KMS keys.", len(regions), selectedRegion)
		} else if len(regions) > 0 {
			status = fmt.Sprintf("Loaded %d region(s). Select a region to browse KMS keys.", len(regions))
		} else {
			status = "No region is available for KMS in this AWS workspace."
		}
		lockWorkspace(mu, func() {
			workspace.KmsRegions = regions
			workspace.SelectedKmsRegion = selectedRegion
			workspace.KmsKeys = []models.AwsKmsKey{}
			workspace.KmsAliases = []models.AwsKmsAlias{}
			workspace.SelectedKmsKeyId = ""
			workspace.KmsStatusMessage = status
		})
		return
	}

	timeoutCtx, cancel = s.withAWSTimeout(context.Background())
	keys := s.kmsKeys(timeoutCtx, *workspace.Profile, selectedRegion)
	cancel()
	selectedKey := s.selectedKmsKeyID(session, keys)
	aliases := []models.AwsKmsAlias{}
	if selectedRegion != "" {
		timeoutCtx, cancel = s.withAWSTimeout(context.Background())
		aliases = s.kmsAliases(timeoutCtx, *workspace.Profile, selectedRegion)
		cancel()
	}
	if selectedRegion != "" && selectedKey != "" {
		timeoutCtx, cancel = s.withAWSTimeout(context.Background())
		if detailed, err := s.kms.DescribeKey(timeoutCtx, *workspace.Profile, selectedRegion, selectedKey); err == nil {
			for i := range keys {
				if keys[i].KeyId == detailed.KeyId {
					keys[i] = detailed
					break
				}
			}
		}
		cancel()
	}

	status := "No region is available for KMS in this AWS workspace."
	if selectedRegion != "" {
		if len(keys) == 0 {
			status = fmt.Sprintf("No KMS keys were returned for %s.", selectedRegion)
		} else if selectedKey == "" {
			status = fmt.Sprintf("Loaded %d KMS keys from %s.", len(keys), selectedRegion)
		} else {
			matchingAliases := 0
			for _, alias := range aliases {
				if alias.TargetKeyId == selectedKey {
					matchingAliases++
				}
			}
			status = fmt.Sprintf(
				"Loaded %d KMS keys and %d aliases for the selected key from %s.",
				len(keys),
				matchingAliases,
				selectedRegion,
			)
		}
	}

	lockWorkspace(mu, func() {
		workspace.KmsRegions = regions
		workspace.SelectedKmsRegion = selectedRegion
		workspace.KmsKeys = keys
		workspace.KmsAliases = aliases
		workspace.SelectedKmsKeyId = selectedKey
		workspace.KmsStatusMessage = status
	})
}

func (s *Service) kmsRegions(ctx context.Context, profile models.ProfileSummary) []string {
	return s.lambdaRegions(ctx, profile)
}

func (s *Service) selectedKmsRegion(
	session models.SessionSnapshot,
	regions []string,
	profile models.ProfileSummary,
) string {
	if session.SelectedKmsRegion != "" {
		for _, region := range regions {
			if region == session.SelectedKmsRegion {
				return session.SelectedKmsRegion
			}
		}
	}
	return s.selectedElbRegion(session, regions, profile)
}

func (s *Service) kmsKeys(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
) []models.AwsKmsKey {
	if region == "" {
		return []models.AwsKmsKey{}
	}
	const scope = "aws.kms.keys"
	queryHash := profile.ProfileID + "|" + region

	var cached []models.AwsKmsKey
	if _, ok, _ := s.loadCachedResource(ctx, scope, queryHash, &cached); ok {
		return cached
	}

	keys, err := s.kms.ListKeys(ctx, profile, region)
	if err == nil {
		_ = s.saveResourceCacheWithTTL(ctx, scope, queryHash, keys)
		return keys
	}
	_, ok, cacheErr := s.store.LoadResourceCache(ctx, scope, queryHash, &cached)
	if cacheErr == nil && ok {
		return cached
	}
	return []models.AwsKmsKey{}
}

func (s *Service) kmsAliases(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
) []models.AwsKmsAlias {
	if region == "" {
		return []models.AwsKmsAlias{}
	}
	const scope = "aws.kms.aliases"
	queryHash := profile.ProfileID + "|" + region

	var cached []models.AwsKmsAlias
	if _, ok, _ := s.loadCachedResource(ctx, scope, queryHash, &cached); ok {
		return cached
	}

	aliases, err := s.kms.ListAliases(ctx, profile, region)
	if err == nil {
		_ = s.saveResourceCacheWithTTL(ctx, scope, queryHash, aliases)
		return aliases
	}
	_, ok, cacheErr := s.store.LoadResourceCache(ctx, scope, queryHash, &cached)
	if cacheErr == nil && ok {
		return cached
	}
	return []models.AwsKmsAlias{}
}

func (s *Service) selectedKmsKeyID(
	session models.SessionSnapshot,
	keys []models.AwsKmsKey,
) string {
	if session.SelectedKmsKeyId != "" {
		for _, key := range keys {
			if key.KeyId == session.SelectedKmsKeyId {
				return session.SelectedKmsKeyId
			}
		}
	}
	if len(keys) == 0 {
		return ""
	}
	return keys[0].KeyId
}

func (s *Service) handleAwsKmsSelectRegion(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
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
	return s.finishAWSWorkspaceOpts(ctx, snapshot, session, notifier, workspaceSnapshotOptions{awsScope: "kms", skipAzureInventory: true}, "", "", false)
}

func (s *Service) handleAwsKmsSelectKey(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
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
	return s.finishAWSWorkspaceOpts(ctx, snapshot, session, notifier, workspaceSnapshotOptions{awsScope: "kms", skipAzureInventory: true}, "", "", false)
}