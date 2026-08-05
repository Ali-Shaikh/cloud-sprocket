// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package awsadapter

import (
	"context"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/ecs/types"

	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/models"
)

func TestEcsClusterSummaryMapsCounts(t *testing.T) {
	got := ecsClusterSummary(types.Cluster{
		ClusterArn:                        aws.String("arn:aws:ecs:us-east-1:123:cluster/demo"),
		ClusterName:                       aws.String("demo"),
		Status:                            aws.String("ACTIVE"),
		RunningTasksCount:                 2,
		PendingTasksCount:                 1,
		ActiveServicesCount:               3,
		RegisteredContainerInstancesCount: 0,
	})
	if got.ClusterName != "demo" || got.RunningTasksCount != 2 || got.ActiveServicesCount != 3 {
		t.Fatalf("cluster = %+v", got)
	}
}

func TestEcsServiceSummaryMapsLaunchType(t *testing.T) {
	got := ecsServiceSummary(types.Service{
		ServiceArn:     aws.String("arn:aws:ecs:us-east-1:123:service/demo/web"),
		ServiceName:    aws.String("web"),
		Status:         aws.String("ACTIVE"),
		LaunchType:     types.LaunchTypeFargate,
		DesiredCount:   2,
		RunningCount:   2,
		TaskDefinition: aws.String("arn:aws:ecs:us-east-1:123:task-definition/web:1"),
	})
	if got.ServiceName != "web" || got.LaunchType != "FARGATE" || got.DesiredCount != 2 {
		t.Fatalf("service = %+v", got)
	}
}

func TestEcsTaskSummaryMapsContainers(t *testing.T) {
	started := time.Date(2026, 7, 4, 12, 0, 0, 0, time.UTC)
	got := ecsTaskSummary(types.Task{
		TaskArn:           aws.String("arn:aws:ecs:us-east-1:123:task/demo/abc"),
		TaskDefinitionArn: aws.String("arn:aws:ecs:us-east-1:123:task-definition/web:1"),
		LastStatus:        aws.String("RUNNING"),
		DesiredStatus:     aws.String("RUNNING"),
		LaunchType:        types.LaunchTypeFargate,
		StartedAt:         &started,
		Containers: []types.Container{
			{
				Name:       aws.String("app"),
				Image:      aws.String("nginx:latest"),
				LastStatus: aws.String("RUNNING"),
			},
		},
	})
	if got.LastStatus != "RUNNING" || len(got.Containers) != 1 || got.Containers[0].Image != "nginx:latest" {
		t.Fatalf("task = %+v", got)
	}
}

func TestServiceNameFromArn(t *testing.T) {
	if got := serviceNameFromArn("arn:aws:ecs:us-east-1:123:service/demo/web"); got != "web" {
		t.Fatalf("service name = %q", got)
	}
}

func TestForceNewDeploymentRequiresClusterAndService(t *testing.T) {
	inv := NewECSInventory(config.Settings{})
	_, err := inv.ForceNewDeployment(context.Background(), models.ProfileSummary{}, "us-east-1", "", "arn:aws:ecs:us-east-1:123:service/demo/web")
	if err == nil {
		t.Fatal("expected error for empty cluster")
	}
	_, err = inv.ForceNewDeployment(context.Background(), models.ProfileSummary{}, "us-east-1", "arn:aws:ecs:us-east-1:123:cluster/demo", "")
	if err == nil {
		t.Fatal("expected error for empty service")
	}
}