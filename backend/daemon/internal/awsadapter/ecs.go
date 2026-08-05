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
	"github.com/aws/aws-sdk-go-v2/service/ecs"
	"github.com/aws/aws-sdk-go-v2/service/ecs/types"

	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/models"
)

// ECSInventory provides read-only inventory for ECS clusters, services, and tasks.
type ECSInventory struct {
	settings config.Settings
}

func NewECSInventory(settings config.Settings) *ECSInventory {
	return &ECSInventory{settings: settings}
}

func (e *ECSInventory) ListClusters(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
) ([]models.AwsEcsCluster, error) {
	if region == "" {
		region = awsRegionHint(profile)
	}
	cfg, err := e.loadConfig(ctx, profile, region)
	if err != nil {
		return nil, err
	}

	client := ecsClient(cfg, profile)
	paginator := ecs.NewListClustersPaginator(client, &ecs.ListClustersInput{})
	clusterArns := []string{}
	for paginator.HasMorePages() {
		page, err := paginator.NextPage(ctx)
		if err != nil {
			return nil, err
		}
		clusterArns = append(clusterArns, page.ClusterArns...)
	}
	if len(clusterArns) == 0 {
		return []models.AwsEcsCluster{}, nil
	}

	clusters := make([]models.AwsEcsCluster, 0, len(clusterArns))
	for i := 0; i < len(clusterArns); i += 100 {
		end := i + 100
		if end > len(clusterArns) {
			end = len(clusterArns)
		}
		res, err := client.DescribeClusters(ctx, &ecs.DescribeClustersInput{
			Clusters: clusterArns[i:end],
			Include:  []types.ClusterField{types.ClusterFieldStatistics},
		})
		if err != nil {
			return nil, err
		}
		for _, cluster := range res.Clusters {
			clusters = append(clusters, ecsClusterSummary(cluster))
		}
	}
	sort.SliceStable(clusters, func(i, j int) bool {
		return clusters[i].ClusterName < clusters[j].ClusterName
	})
	return clusters, nil
}

func (e *ECSInventory) DescribeCluster(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
	clusterArn string,
) (models.AwsEcsCluster, error) {
	clusterArn = strings.TrimSpace(clusterArn)
	if clusterArn == "" {
		return models.AwsEcsCluster{}, fmt.Errorf("cluster ARN is required")
	}
	if region == "" {
		region = awsRegionHint(profile)
	}
	cfg, err := e.loadConfig(ctx, profile, region)
	if err != nil {
		return models.AwsEcsCluster{}, err
	}

	client := ecsClient(cfg, profile)
	res, err := client.DescribeClusters(ctx, &ecs.DescribeClustersInput{
		Clusters: []string{clusterArn},
		Include:  []types.ClusterField{types.ClusterFieldStatistics},
	})
	if err != nil {
		return models.AwsEcsCluster{}, err
	}
	if len(res.Clusters) == 0 {
		return models.AwsEcsCluster{}, fmt.Errorf("cluster %s was not found", clusterArn)
	}
	return ecsClusterSummary(res.Clusters[0]), nil
}

func (e *ECSInventory) ListServices(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
	clusterArn string,
) ([]models.AwsEcsService, error) {
	clusterArn = strings.TrimSpace(clusterArn)
	if clusterArn == "" {
		return nil, fmt.Errorf("cluster ARN is required")
	}
	if region == "" {
		region = awsRegionHint(profile)
	}
	cfg, err := e.loadConfig(ctx, profile, region)
	if err != nil {
		return nil, err
	}

	client := ecsClient(cfg, profile)
	paginator := ecs.NewListServicesPaginator(client, &ecs.ListServicesInput{
		Cluster: aws.String(clusterArn),
	})
	serviceArns := []string{}
	for paginator.HasMorePages() {
		page, err := paginator.NextPage(ctx)
		if err != nil {
			return nil, err
		}
		serviceArns = append(serviceArns, page.ServiceArns...)
	}
	if len(serviceArns) == 0 {
		return []models.AwsEcsService{}, nil
	}

	services := make([]models.AwsEcsService, 0, len(serviceArns))
	for i := 0; i < len(serviceArns); i += 10 {
		end := i + 10
		if end > len(serviceArns) {
			end = len(serviceArns)
		}
		res, err := client.DescribeServices(ctx, &ecs.DescribeServicesInput{
			Cluster:  aws.String(clusterArn),
			Services: serviceArns[i:end],
		})
		if err != nil {
			return nil, err
		}
		for _, service := range res.Services {
			services = append(services, ecsServiceSummary(service))
		}
	}
	sort.SliceStable(services, func(i, j int) bool {
		return services[i].ServiceName < services[j].ServiceName
	})
	return services, nil
}

func (e *ECSInventory) ListTasks(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
	clusterArn string,
	serviceArn string,
) ([]models.AwsEcsTask, error) {
	clusterArn = strings.TrimSpace(clusterArn)
	if clusterArn == "" {
		return nil, fmt.Errorf("cluster ARN is required")
	}
	if region == "" {
		region = awsRegionHint(profile)
	}
	cfg, err := e.loadConfig(ctx, profile, region)
	if err != nil {
		return nil, err
	}

	client := ecsClient(cfg, profile)
	listInput := &ecs.ListTasksInput{
		Cluster: aws.String(clusterArn),
	}
	if strings.TrimSpace(serviceArn) != "" {
		listInput.ServiceName = aws.String(serviceNameFromArn(serviceArn))
	}

	paginator := ecs.NewListTasksPaginator(client, listInput)
	taskArns := []string{}
	for paginator.HasMorePages() {
		page, err := paginator.NextPage(ctx)
		if err != nil {
			return nil, err
		}
		taskArns = append(taskArns, page.TaskArns...)
	}
	if len(taskArns) == 0 {
		return []models.AwsEcsTask{}, nil
	}

	tasks := make([]models.AwsEcsTask, 0, len(taskArns))
	for i := 0; i < len(taskArns); i += 100 {
		end := i + 100
		if end > len(taskArns) {
			end = len(taskArns)
		}
		res, err := client.DescribeTasks(ctx, &ecs.DescribeTasksInput{
			Cluster: aws.String(clusterArn),
			Tasks:   taskArns[i:end],
		})
		if err != nil {
			return nil, err
		}
		for _, task := range res.Tasks {
			tasks = append(tasks, ecsTaskSummary(task))
		}
	}
	sort.SliceStable(tasks, func(i, j int) bool {
		return tasks[i].TaskArn < tasks[j].TaskArn
	})
	return tasks, nil
}

// ForceNewDeployment starts a new deployment for the selected ECS service
// without changing the task definition (UpdateService ForceNewDeployment).
func (e *ECSInventory) ForceNewDeployment(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
	clusterArn string,
	serviceArn string,
) (models.AwsEcsForceNewDeploymentResult, error) {
	clusterArn = strings.TrimSpace(clusterArn)
	serviceArn = strings.TrimSpace(serviceArn)
	if clusterArn == "" || serviceArn == "" {
		return models.AwsEcsForceNewDeploymentResult{}, fmt.Errorf("cluster ARN and service ARN are required")
	}
	if region == "" {
		region = awsRegionHint(profile)
	}
	cfg, err := e.loadConfig(ctx, profile, region)
	if err != nil {
		return models.AwsEcsForceNewDeploymentResult{}, err
	}

	serviceName := serviceNameFromArn(serviceArn)
	client := ecsClient(cfg, profile)
	_, err = client.UpdateService(ctx, &ecs.UpdateServiceInput{
		Cluster:            aws.String(clusterArn),
		Service:            aws.String(serviceName),
		ForceNewDeployment: true,
	})
	if err != nil {
		return models.AwsEcsForceNewDeploymentResult{}, fmt.Errorf("force new ECS deployment for %s: %w", serviceName, err)
	}
	return models.AwsEcsForceNewDeploymentResult{
		ClusterArn:  clusterArn,
		ServiceArn:  serviceArn,
		ServiceName: serviceName,
		Region:      region,
		Summary:     fmt.Sprintf("Forced a new deployment for ECS service %s.", serviceName),
	}, nil
}

func (e *ECSInventory) DescribeTask(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
	clusterArn string,
	taskArn string,
) (models.AwsEcsTask, error) {
	clusterArn = strings.TrimSpace(clusterArn)
	taskArn = strings.TrimSpace(taskArn)
	if clusterArn == "" || taskArn == "" {
		return models.AwsEcsTask{}, fmt.Errorf("cluster ARN and task ARN are required")
	}
	if region == "" {
		region = awsRegionHint(profile)
	}
	cfg, err := e.loadConfig(ctx, profile, region)
	if err != nil {
		return models.AwsEcsTask{}, err
	}

	client := ecsClient(cfg, profile)
	res, err := client.DescribeTasks(ctx, &ecs.DescribeTasksInput{
		Cluster: aws.String(clusterArn),
		Tasks:   []string{taskArn},
	})
	if err != nil {
		return models.AwsEcsTask{}, err
	}
	if len(res.Tasks) == 0 {
		return models.AwsEcsTask{}, fmt.Errorf("task %s was not found", taskArn)
	}
	return ecsTaskSummary(res.Tasks[0]), nil
}

func (e *ECSInventory) loadConfig(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
) (aws.Config, error) {
	return loadAWSConfig(ctx, e.settings, profile, region)
}

func ecsClient(cfg aws.Config, profile models.ProfileSummary) *ecs.Client {
	return ecs.NewFromConfig(cfg, func(options *ecs.Options) {
		if endpointURL := awsEndpointURL(profile); endpointURL != "" {
			options.BaseEndpoint = aws.String(endpointURL)
		}
	})
}

func ecsClusterSummary(cluster types.Cluster) models.AwsEcsCluster {
	summary := models.AwsEcsCluster{
		ClusterArn:  awsString(cluster.ClusterArn),
		ClusterName: awsString(cluster.ClusterName),
		Status:      awsString(cluster.Status),
	}
	summary.RunningTasksCount = cluster.RunningTasksCount
	summary.PendingTasksCount = cluster.PendingTasksCount
	summary.ActiveServicesCount = cluster.ActiveServicesCount
	summary.RegisteredContainerInstancesCount = cluster.RegisteredContainerInstancesCount
	return summary
}

func ecsServiceSummary(service types.Service) models.AwsEcsService {
	summary := models.AwsEcsService{
		ServiceArn:  awsString(service.ServiceArn),
		ServiceName: awsString(service.ServiceName),
		Status:      awsString(service.Status),
		LaunchType:  string(service.LaunchType),
	}
	summary.DesiredCount = service.DesiredCount
	summary.RunningCount = service.RunningCount
	summary.PendingCount = service.PendingCount
	if service.TaskDefinition != nil {
		summary.TaskDefinition = *service.TaskDefinition
	}
	return summary
}

func ecsTaskSummary(task types.Task) models.AwsEcsTask {
	summary := models.AwsEcsTask{
		TaskArn:           awsString(task.TaskArn),
		TaskDefinitionArn: awsString(task.TaskDefinitionArn),
		LastStatus:        awsString(task.LastStatus),
		DesiredStatus:     awsString(task.DesiredStatus),
		LaunchType:        string(task.LaunchType),
		Group:             awsString(task.Group),
	}
	if task.StartedAt != nil {
		summary.StartedAt = task.StartedAt.UTC().Format(time.RFC3339)
	}
	for _, container := range task.Containers {
		summary.Containers = append(summary.Containers, models.AwsEcsContainer{
			Name:       awsString(container.Name),
			Image:      awsString(container.Image),
			LastStatus: awsString(container.LastStatus),
		})
	}
	return summary
}

func serviceNameFromArn(serviceArn string) string {
	parts := strings.Split(serviceArn, "/")
	if len(parts) == 0 {
		return serviceArn
	}
	return parts[len(parts)-1]
}