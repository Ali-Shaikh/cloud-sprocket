// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"fmt"
	"sync"

	"cloudsprocket/backend/daemon/internal/models"
)

func (s *Service) enrichEKSInventory(
	workspace *models.WorkspaceSnapshot,
	session models.SessionSnapshot,
	opts awsEnrichmentOptions,
	mu *sync.Mutex,
) {
	if workspace.Provider == nil ||
		workspace.Provider.ProviderID != "aws" ||
		workspace.Profile == nil ||
		s.eks == nil {
		return
	}
	timeoutCtx, cancel := s.withAWSTimeout(context.Background())
	regions := s.eksRegions(timeoutCtx, *workspace.Profile)
	cancel()
	selectedRegion := s.selectedEKSRegion(session, regions, *workspace.Profile)

	if opts.lightweight {
		status := "No region is available for EKS clusters in this AWS workspace."
		if selectedRegion != "" {
			status = fmt.Sprintf("Loaded %d region(s). Select %s to browse clusters.", len(regions), selectedRegion)
		} else if len(regions) > 0 {
			status = fmt.Sprintf("Loaded %d region(s). Select a region to browse clusters.", len(regions))
		}
		lockWorkspace(mu, func() {
			workspace.EKSRegions = regions
			workspace.SelectedEKSRegion = selectedRegion
			workspace.EKSClusters = []models.AwsEksCluster{}
			workspace.EKSNodeGroups = []models.AwsEksNodeGroup{}
			workspace.SelectedEKSClusterName = ""
			workspace.EKSStatusMessage = status
		})
		return
	}

	timeoutCtx, cancel = s.withAWSTimeout(context.Background())
	clusters := s.eksClusters(timeoutCtx, *workspace.Profile, selectedRegion)
	cancel()
	selectedCluster := s.selectedEKSClusterName(session, clusters)
	nodeGroups := []models.AwsEksNodeGroup{}
	if selectedCluster != "" {
		timeoutCtx, cancel = s.withAWSTimeout(context.Background())
		nodeGroups = s.eksNodeGroups(timeoutCtx, *workspace.Profile, selectedRegion, selectedCluster)
		cancel()
		timeoutCtx, cancel = s.withAWSTimeout(context.Background())
		if full, err := s.eks.DescribeCluster(timeoutCtx, *workspace.Profile, selectedRegion, selectedCluster); err == nil {
			for i := range clusters {
				if clusters[i].ClusterName == full.ClusterName {
					clusters[i] = full
					break
				}
			}
		}
		cancel()
	}

	status := "No region is available for EKS clusters in this AWS workspace."
	if selectedRegion != "" {
		if len(clusters) == 0 {
			status = fmt.Sprintf("No EKS clusters were returned for %s.", selectedRegion)
		} else if selectedCluster == "" {
			status = fmt.Sprintf("Loaded %d EKS clusters from %s.", len(clusters), selectedRegion)
		} else {
			status = fmt.Sprintf(
				"Loaded %d clusters and %d node groups from %s.",
				len(clusters),
				len(nodeGroups),
				selectedRegion,
			)
		}
	}

	lockWorkspace(mu, func() {
		workspace.EKSRegions = regions
		workspace.SelectedEKSRegion = selectedRegion
		workspace.EKSClusters = clusters
		workspace.EKSNodeGroups = nodeGroups
		workspace.SelectedEKSClusterName = selectedCluster
		workspace.EKSStatusMessage = status
	})
}

func (s *Service) eksRegions(ctx context.Context, profile models.ProfileSummary) []string {
	return s.lambdaRegions(ctx, profile)
}

func (s *Service) selectedEKSRegion(
	session models.SessionSnapshot,
	regions []string,
	profile models.ProfileSummary,
) string {
	if session.SelectedEKSRegion != "" {
		for _, region := range regions {
			if region == session.SelectedEKSRegion {
				return session.SelectedEKSRegion
			}
		}
	}
	return s.selectedRDSRegion(session, regions, profile)
}

func (s *Service) eksClusters(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
) []models.AwsEksCluster {
	if region == "" {
		return []models.AwsEksCluster{}
	}
	const scope = "aws.eks.clusters"
	queryHash := profile.ProfileID + "|" + region

	var cached []models.AwsEksCluster
	if _, ok, _ := s.loadCachedResource(ctx, scope, queryHash, &cached); ok {
		return cached
	}

	clusters, err := s.eks.ListClusters(ctx, profile, region)
	if err == nil {
		_ = s.saveResourceCacheWithTTL(ctx, scope, queryHash, clusters)
		return clusters
	}
	_, ok, cacheErr := s.store.LoadResourceCache(ctx, scope, queryHash, &cached)
	if cacheErr == nil && ok {
		return cached
	}
	return []models.AwsEksCluster{}
}

func (s *Service) selectedEKSClusterName(
	session models.SessionSnapshot,
	clusters []models.AwsEksCluster,
) string {
	if session.SelectedEKSClusterName != "" {
		for _, cluster := range clusters {
			if cluster.ClusterName == session.SelectedEKSClusterName {
				return session.SelectedEKSClusterName
			}
		}
	}
	if len(clusters) == 0 {
		return ""
	}
	return clusters[0].ClusterName
}

func (s *Service) eksNodeGroups(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
	clusterName string,
) []models.AwsEksNodeGroup {
	if region == "" || clusterName == "" {
		return []models.AwsEksNodeGroup{}
	}
	const scope = "aws.eks.nodegroups"
	queryHash := profile.ProfileID + "|" + region + "|" + clusterName

	var cached []models.AwsEksNodeGroup
	if _, ok, _ := s.loadCachedResource(ctx, scope, queryHash, &cached); ok {
		return cached
	}

	nodeGroups, err := s.eks.ListNodeGroups(ctx, profile, region, clusterName)
	if err == nil {
		_ = s.saveResourceCacheWithTTL(ctx, scope, queryHash, nodeGroups)
		return nodeGroups
	}
	_, ok, cacheErr := s.store.LoadResourceCache(ctx, scope, queryHash, &cached)
	if cacheErr == nil && ok {
		return cached
	}
	return []models.AwsEksNodeGroup{}
}
