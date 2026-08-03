// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"fmt"
	"sync"

	"cloudsprocket/backend/daemon/internal/models"
)

func (s *Service) ec2Regions(ctx context.Context, profile models.ProfileSummary) []string {
	const scope = "aws.ec2.regions"
	queryHash := profile.ProfileID

	var cached []string
	if _, ok, _ := s.loadCachedResource(ctx, scope, queryHash, &cached); ok && len(cached) > 0 {
		return cached
	}

	regions, err := s.ec2.ListRegions(ctx, profile)
	if err == nil && len(regions) > 0 {
		_ = s.saveResourceCacheWithTTL(ctx, scope, queryHash, regions)
		return regions
	}

	_, ok, cacheErr := s.store.LoadResourceCache(ctx, scope, queryHash, &cached)
	if cacheErr == nil && ok && len(cached) > 0 {
		return cached
	}

	if hint := profileRegionHint(profile); hint != "" {
		return []string{hint}
	}
	return []string{}
}

func (s *Service) selectedEC2Region(
	session models.SessionSnapshot,
	regions []string,
	profile models.ProfileSummary,
) string {
	if session.SelectedEC2Region != "" {
		for _, region := range regions {
			if region == session.SelectedEC2Region {
				return session.SelectedEC2Region
			}
		}
	}
	hint := profileRegionHint(profile)
	for _, region := range regions {
		if region == hint {
			return hint
		}
	}
	if len(regions) == 0 {
		return ""
	}
	return regions[0]
}

func (s *Service) ec2Instances(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
) []models.AwsEc2Instance {
	if region == "" {
		return []models.AwsEc2Instance{}
	}

	const scope = "aws.ec2.instances"
	queryHash := profile.ProfileID + "|" + region

	var cached []models.AwsEc2Instance
	if _, ok, _ := s.loadCachedResource(ctx, scope, queryHash, &cached); ok {
		return cached
	}

	instances, err := s.ec2.ListInstances(ctx, profile, region)
	if err == nil {
		_ = s.saveResourceCacheWithTTL(ctx, scope, queryHash, instances)
		return instances
	}

	_, ok, cacheErr := s.store.LoadResourceCache(ctx, scope, queryHash, &cached)
	if cacheErr == nil && ok {
		return cached
	}

	return []models.AwsEc2Instance{}
}

func (s *Service) selectedEC2InstanceID(
	session models.SessionSnapshot,
	instances []models.AwsEc2Instance,
) string {
	if session.SelectedEC2InstanceID != "" {
		for _, instance := range instances {
			if instance.InstanceID == session.SelectedEC2InstanceID {
				return session.SelectedEC2InstanceID
			}
		}
	}
	if len(instances) == 0 {
		return ""
	}
	return instances[0].InstanceID
}

func (s *Service) enrichEC2Inventory(
	workspace *models.WorkspaceSnapshot,
	session models.SessionSnapshot,
	opts awsEnrichmentOptions,
	mu *sync.Mutex,
) {
	if workspace.Provider == nil ||
		workspace.Provider.ProviderID != "aws" ||
		workspace.Profile == nil ||
		s.ec2 == nil {
		return
	}
	timeoutCtx, cancel := s.withAWSTimeout(context.Background())
	regions := s.ec2Regions(timeoutCtx, *workspace.Profile)
	cancel()
	selectedRegion := s.selectedEC2Region(session, regions, *workspace.Profile)

	if opts.lightweight {
		status := "No EC2 region is available for this AWS workspace."
		if selectedRegion != "" {
			status = fmt.Sprintf("Loaded %d region(s). Select %s to browse instances.", len(regions), selectedRegion)
		} else if len(regions) > 0 {
			status = fmt.Sprintf("Loaded %d region(s). Select a region to browse instances.", len(regions))
		}
		lockWorkspace(mu, func() {
			workspace.EC2Regions = regions
			workspace.SelectedEC2Region = selectedRegion
			workspace.EC2Instances = []models.AwsEc2Instance{}
			workspace.SelectedEC2InstanceID = ""
			workspace.EC2StatusMessage = status
		})
		return
	}

	timeoutCtx, cancel = s.withAWSTimeout(context.Background())
	instances := s.ec2Instances(timeoutCtx, *workspace.Profile, selectedRegion)
	cancel()
	selectedInstance := s.selectedEC2InstanceID(session, instances)

	status := "No EC2 region is available for this AWS workspace."
	if selectedRegion != "" {
		if len(instances) == 0 {
			status = fmt.Sprintf("No EC2 instances were returned for %s.", selectedRegion)
		} else {
			status = fmt.Sprintf("Loaded %d EC2 instances from %s.", len(instances), selectedRegion)
		}
	}

	lockWorkspace(mu, func() {
		workspace.EC2Regions = regions
		workspace.SelectedEC2Region = selectedRegion
		workspace.EC2Instances = instances
		workspace.SelectedEC2InstanceID = selectedInstance
		workspace.EC2StatusMessage = status
	})
}

// lambdaRegions reuses the EC2 region list for an AWS profile (single source of
// truth for account regions, cheap, avoids duplicating the DescribeRegions call).
