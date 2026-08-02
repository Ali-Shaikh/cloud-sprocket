// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"fmt"
	"sync"

	"cloudsprocket/backend/daemon/internal/models"
)

func (s *Service) enrichElbv2Inventory(
	workspace *models.WorkspaceSnapshot,
	session models.SessionSnapshot,
	opts awsEnrichmentOptions,
	mu *sync.Mutex,
) {
	if workspace.Provider == nil ||
		workspace.Provider.ProviderID != "aws" ||
		workspace.Profile == nil ||
		s.elbv2 == nil {
		return
	}

	timeoutCtx, cancel := s.withAWSTimeout(context.Background())
	regions := s.elbRegions(timeoutCtx, *workspace.Profile)
	cancel()
	selectedRegion := s.selectedElbRegion(session, regions, *workspace.Profile)

	if opts.lightweight {
		status := "Select a load balancer to browse target groups."
		if selectedRegion != "" {
			status = fmt.Sprintf("Loaded %d region(s). Select %s to browse load balancers.", len(regions), selectedRegion)
		} else if len(regions) > 0 {
			status = fmt.Sprintf("Loaded %d region(s). Select a region to browse load balancers.", len(regions))
		} else {
			status = "No region is available for load balancers in this AWS workspace."
		}
		lockWorkspace(mu, func() {
			workspace.ElbRegions = regions
			workspace.SelectedElbRegion = selectedRegion
			workspace.ElbLoadBalancers = []models.AwsElbLoadBalancer{}
			workspace.ElbTargetGroups = []models.AwsElbTargetGroup{}
			workspace.SelectedElbLoadBalancerArn = ""
			workspace.ElbStatusMessage = status
		})
		return
	}

	timeoutCtx, cancel = s.withAWSTimeout(context.Background())
	loadBalancers := s.elbLoadBalancers(timeoutCtx, *workspace.Profile, selectedRegion)
	cancel()
	selectedLoadBalancer := s.selectedElbLoadBalancerArn(session, loadBalancers)
	targetGroups := []models.AwsElbTargetGroup{}
	if selectedLoadBalancer != "" {
		timeoutCtx, cancel = s.withAWSTimeout(context.Background())
		targetGroups = s.elbTargetGroups(timeoutCtx, *workspace.Profile, selectedRegion, selectedLoadBalancer)
		cancel()
	}

	status := "No region is available for load balancers in this AWS workspace."
	if selectedRegion != "" {
		if len(loadBalancers) == 0 {
			status = fmt.Sprintf("No load balancers were returned for %s.", selectedRegion)
		} else if selectedLoadBalancer == "" {
			status = fmt.Sprintf("Loaded %d load balancers from %s.", len(loadBalancers), selectedRegion)
		} else {
			status = fmt.Sprintf(
				"Loaded %d load balancers and %d target groups from %s.",
				len(loadBalancers),
				len(targetGroups),
				selectedRegion,
			)
		}
	}

	lockWorkspace(mu, func() {
		workspace.ElbRegions = regions
		workspace.SelectedElbRegion = selectedRegion
		workspace.ElbLoadBalancers = loadBalancers
		workspace.ElbTargetGroups = targetGroups
		workspace.SelectedElbLoadBalancerArn = selectedLoadBalancer
		workspace.ElbStatusMessage = status
	})
}

func (s *Service) elbRegions(ctx context.Context, profile models.ProfileSummary) []string {
	return s.lambdaRegions(ctx, profile)
}

func (s *Service) selectedElbRegion(
	session models.SessionSnapshot,
	regions []string,
	profile models.ProfileSummary,
) string {
	if session.SelectedElbRegion != "" {
		for _, region := range regions {
			if region == session.SelectedElbRegion {
				return session.SelectedElbRegion
			}
		}
	}
	return s.selectedRDSRegion(session, regions, profile)
}

func (s *Service) elbLoadBalancers(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
) []models.AwsElbLoadBalancer {
	if region == "" {
		return []models.AwsElbLoadBalancer{}
	}
	const scope = "aws.elb.loadbalancers"
	queryHash := profile.ProfileID + "|" + region

	var cached []models.AwsElbLoadBalancer
	if _, ok, _ := s.loadCachedResource(ctx, scope, queryHash, &cached); ok {
		return cached
	}

	loadBalancers, err := s.elbv2.DescribeLoadBalancers(ctx, profile, region)
	if err == nil {
		_ = s.saveResourceCacheWithTTL(ctx, scope, queryHash, loadBalancers)
		return loadBalancers
	}
	_, ok, cacheErr := s.store.LoadResourceCache(ctx, scope, queryHash, &cached)
	if cacheErr == nil && ok {
		return cached
	}
	return []models.AwsElbLoadBalancer{}
}

func (s *Service) selectedElbLoadBalancerArn(
	session models.SessionSnapshot,
	loadBalancers []models.AwsElbLoadBalancer,
) string {
	if session.SelectedElbLoadBalancerArn != "" {
		for _, loadBalancer := range loadBalancers {
			if loadBalancer.LoadBalancerArn == session.SelectedElbLoadBalancerArn {
				return session.SelectedElbLoadBalancerArn
			}
		}
	}
	if len(loadBalancers) == 0 {
		return ""
	}
	return loadBalancers[0].LoadBalancerArn
}

func (s *Service) elbTargetGroups(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
	loadBalancerArn string,
) []models.AwsElbTargetGroup {
	if region == "" || loadBalancerArn == "" {
		return []models.AwsElbTargetGroup{}
	}
	const scope = "aws.elb.targetgroups"
	queryHash := profile.ProfileID + "|" + region + "|" + loadBalancerArn

	var cached []models.AwsElbTargetGroup
	if _, ok, _ := s.loadCachedResource(ctx, scope, queryHash, &cached); ok {
		return cached
	}

	targetGroups, err := s.elbv2.DescribeTargetGroups(ctx, profile, region, loadBalancerArn)
	if err == nil {
		_ = s.saveResourceCacheWithTTL(ctx, scope, queryHash, targetGroups)
		return targetGroups
	}
	_, ok, cacheErr := s.store.LoadResourceCache(ctx, scope, queryHash, &cached)
	if cacheErr == nil && ok {
		return cached
	}
	return []models.AwsElbTargetGroup{}
}
