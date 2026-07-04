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

func (s *Service) enrichECSInventory(
	workspace *models.WorkspaceSnapshot,
	session models.SessionSnapshot,
	opts awsEnrichmentOptions,
	mu *sync.Mutex,
) {
	if workspace.Provider == nil ||
		workspace.Provider.ProviderID != "aws" ||
		workspace.Profile == nil ||
		s.ecs == nil {
		return
	}
	timeoutCtx, cancel := s.withAWSTimeout(context.Background())
	regions := s.ecsRegions(timeoutCtx, *workspace.Profile)
	cancel()
	selectedRegion := s.selectedECSRegion(session, regions, *workspace.Profile)

	if opts.lightweight {
		status := "No region is available for ECS clusters in this AWS workspace."
		if selectedRegion != "" {
			status = fmt.Sprintf("Loaded %d region(s). Select %s to browse clusters.", len(regions), selectedRegion)
		} else if len(regions) > 0 {
			status = fmt.Sprintf("Loaded %d region(s). Select a region to browse clusters.", len(regions))
		}
		lockWorkspace(mu, func() {
			workspace.ECSRegions = regions
			workspace.SelectedECSRegion = selectedRegion
			workspace.ECSClusters = []models.AwsEcsCluster{}
			workspace.ECSServices = []models.AwsEcsService{}
			workspace.ECSTasks = []models.AwsEcsTask{}
			workspace.SelectedECSClusterArn = ""
			workspace.SelectedECSServiceArn = ""
			workspace.SelectedECSTaskArn = ""
			workspace.ECSStatusMessage = status
		})
		return
	}

	timeoutCtx, cancel = s.withAWSTimeout(context.Background())
	clusters := s.ecsClusters(timeoutCtx, *workspace.Profile, selectedRegion)
	cancel()
	selectedCluster := s.selectedECSClusterArn(session, clusters)
	services := []models.AwsEcsService{}
	tasks := []models.AwsEcsTask{}
	if selectedCluster != "" {
		timeoutCtx, cancel = s.withAWSTimeout(context.Background())
		services = s.ecsServices(timeoutCtx, *workspace.Profile, selectedRegion, selectedCluster)
		cancel()
		selectedService := s.selectedECSServiceArn(session, services)
		timeoutCtx, cancel = s.withAWSTimeout(context.Background())
		tasks = s.ecsTasks(timeoutCtx, *workspace.Profile, selectedRegion, selectedCluster, selectedService)
		cancel()
		selectedTask := s.selectedECSTaskArn(session, tasks)
		if selectedTask != "" {
			timeoutCtx, cancel := s.withAWSTimeout(context.Background())
			if full, err := s.ecs.DescribeTask(timeoutCtx, *workspace.Profile, selectedRegion, selectedCluster, selectedTask); err == nil {
				for i := range tasks {
					if tasks[i].TaskArn == full.TaskArn {
						tasks[i] = full
						break
					}
				}
			}
			cancel()
		}
		if selectedCluster != "" {
			timeoutCtx, cancel := s.withAWSTimeout(context.Background())
			if full, err := s.ecs.DescribeCluster(timeoutCtx, *workspace.Profile, selectedRegion, selectedCluster); err == nil {
				for i := range clusters {
					if clusters[i].ClusterArn == full.ClusterArn {
						clusters[i] = full
						break
					}
				}
			}
			cancel()
		}
	}

	status := "No region is available for ECS clusters in this AWS workspace."
	if selectedRegion != "" {
		if len(clusters) == 0 {
			status = fmt.Sprintf("No ECS clusters were returned for %s.", selectedRegion)
		} else if selectedCluster == "" {
			status = fmt.Sprintf("Loaded %d ECS clusters from %s.", len(clusters), selectedRegion)
		} else {
			status = fmt.Sprintf(
				"Loaded %d clusters, %d services, and %d tasks from %s.",
				len(clusters),
				len(services),
				len(tasks),
				selectedRegion,
			)
		}
	}

	lockWorkspace(mu, func() {
		workspace.ECSRegions = regions
		workspace.SelectedECSRegion = selectedRegion
		workspace.ECSClusters = clusters
		workspace.ECSServices = services
		workspace.ECSTasks = tasks
		workspace.SelectedECSClusterArn = s.selectedECSClusterArn(session, clusters)
		workspace.SelectedECSServiceArn = s.selectedECSServiceArn(session, services)
		workspace.SelectedECSTaskArn = s.selectedECSTaskArn(session, tasks)
		workspace.ECSStatusMessage = status
	})
}

func (s *Service) ecsRegions(ctx context.Context, profile models.ProfileSummary) []string {
	return s.lambdaRegions(ctx, profile)
}

func (s *Service) selectedECSRegion(
	session models.SessionSnapshot,
	regions []string,
	profile models.ProfileSummary,
) string {
	if session.SelectedECSRegion != "" {
		for _, region := range regions {
			if region == session.SelectedECSRegion {
				return session.SelectedECSRegion
			}
		}
	}
	return s.selectedRDSRegion(session, regions, profile)
}

func (s *Service) ecsClusters(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
) []models.AwsEcsCluster {
	if region == "" {
		return []models.AwsEcsCluster{}
	}
	const scope = "aws.ecs.clusters"
	queryHash := profile.ProfileID + "|" + region

	var cached []models.AwsEcsCluster
	if _, ok, _ := s.loadCachedResource(ctx, scope, queryHash, &cached); ok {
		return cached
	}

	clusters, err := s.ecs.ListClusters(ctx, profile, region)
	if err == nil {
		_ = s.saveResourceCacheWithTTL(ctx, scope, queryHash, clusters)
		return clusters
	}
	_, ok, cacheErr := s.store.LoadResourceCache(ctx, scope, queryHash, &cached)
	if cacheErr == nil && ok {
		return cached
	}
	return []models.AwsEcsCluster{}
}

func (s *Service) selectedECSClusterArn(
	session models.SessionSnapshot,
	clusters []models.AwsEcsCluster,
) string {
	if session.SelectedECSClusterArn != "" {
		for _, cluster := range clusters {
			if cluster.ClusterArn == session.SelectedECSClusterArn {
				return session.SelectedECSClusterArn
			}
		}
	}
	if len(clusters) == 0 {
		return ""
	}
	return clusters[0].ClusterArn
}

func (s *Service) ecsServices(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
	clusterArn string,
) []models.AwsEcsService {
	if region == "" || clusterArn == "" {
		return []models.AwsEcsService{}
	}
	const scope = "aws.ecs.services"
	queryHash := profile.ProfileID + "|" + region + "|" + clusterArn

	var cached []models.AwsEcsService
	if _, ok, _ := s.loadCachedResource(ctx, scope, queryHash, &cached); ok {
		return cached
	}

	services, err := s.ecs.ListServices(ctx, profile, region, clusterArn)
	if err == nil {
		_ = s.saveResourceCacheWithTTL(ctx, scope, queryHash, services)
		return services
	}
	_, ok, cacheErr := s.store.LoadResourceCache(ctx, scope, queryHash, &cached)
	if cacheErr == nil && ok {
		return cached
	}
	return []models.AwsEcsService{}
}

func (s *Service) selectedECSServiceArn(
	session models.SessionSnapshot,
	services []models.AwsEcsService,
) string {
	if session.SelectedECSServiceArn != "" {
		for _, service := range services {
			if service.ServiceArn == session.SelectedECSServiceArn {
				return session.SelectedECSServiceArn
			}
		}
	}
	return ""
}

func (s *Service) ecsTasks(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
	clusterArn string,
	serviceArn string,
) []models.AwsEcsTask {
	if region == "" || clusterArn == "" {
		return []models.AwsEcsTask{}
	}
	const scope = "aws.ecs.tasks"
	queryHash := profile.ProfileID + "|" + region + "|" + clusterArn + "|" + serviceArn

	var cached []models.AwsEcsTask
	if _, ok, _ := s.loadCachedResource(ctx, scope, queryHash, &cached); ok {
		return cached
	}

	tasks, err := s.ecs.ListTasks(ctx, profile, region, clusterArn, serviceArn)
	if err == nil {
		_ = s.saveResourceCacheWithTTL(ctx, scope, queryHash, tasks)
		return tasks
	}
	_, ok, cacheErr := s.store.LoadResourceCache(ctx, scope, queryHash, &cached)
	if cacheErr == nil && ok {
		return cached
	}
	return []models.AwsEcsTask{}
}

func (s *Service) selectedECSTaskArn(
	session models.SessionSnapshot,
	tasks []models.AwsEcsTask,
) string {
	if session.SelectedECSTaskArn != "" {
		for _, task := range tasks {
			if task.TaskArn == session.SelectedECSTaskArn {
				return session.SelectedECSTaskArn
			}
		}
	}
	return ""
}

func (s *Service) handleAwsEcsSelectRegion(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
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
	return s.finishAWSWorkspaceOpts(ctx, snapshot, session, notifier, workspaceSnapshotOptions{awsScope: "ecs", skipAzureInventory: true}, "", "", false)
}

func (s *Service) handleAwsEcsSelectCluster(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
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
	return s.finishAWSWorkspaceOpts(ctx, snapshot, session, notifier, workspaceSnapshotOptions{awsScope: "ecs", skipAzureInventory: true}, "", "", false)
}

func (s *Service) handleAwsEcsSelectService(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
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
	return s.finishAWSWorkspaceOpts(ctx, snapshot, session, notifier, workspaceSnapshotOptions{awsScope: "ecs", skipAzureInventory: true}, "", "", false)
}

func (s *Service) handleAwsEcsSelectTask(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
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
	return s.finishAWSWorkspaceOpts(ctx, snapshot, session, notifier, workspaceSnapshotOptions{awsScope: "ecs", skipAzureInventory: true}, "", "", false)
}