// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"

	"cloudsprocket/backend/daemon/internal/discovery"
	"cloudsprocket/backend/daemon/internal/models"
	"cloudsprocket/backend/daemon/internal/store"
)

type countingEKSInventory struct {
	listClusters   atomic.Int32
	listNodeGroups atomic.Int32
	clusters       []models.AwsEksCluster
	nodeGroups     map[string][]models.AwsEksNodeGroup
}

func (c *countingEKSInventory) ListClusters(context.Context, models.ProfileSummary, string) ([]models.AwsEksCluster, error) {
	c.listClusters.Add(1)
	return c.clusters, nil
}

func (c *countingEKSInventory) DescribeCluster(_ context.Context, _ models.ProfileSummary, _ string, clusterName string) (models.AwsEksCluster, error) {
	for _, cluster := range c.clusters {
		if cluster.ClusterName == clusterName {
			return cluster, nil
		}
	}
	return models.AwsEksCluster{}, nil
}

func (c *countingEKSInventory) ListNodeGroups(_ context.Context, _ models.ProfileSummary, _ string, clusterName string) ([]models.AwsEksNodeGroup, error) {
	c.listNodeGroups.Add(1)
	return c.nodeGroups[clusterName], nil
}

func TestAwsScopedEKSInventoryLoadsClustersAndNodeGroups(t *testing.T) {
	dataStore, err := store.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	t.Cleanup(func() { _ = dataStore.Close() })

	eks := &countingEKSInventory{
		clusters: []models.AwsEksCluster{{
			ClusterArn:  "arn:aws:eks:us-east-1:123:cluster/demo",
			ClusterName: "demo",
			Status:      "ACTIVE",
			Version:     "1.29",
		}},
		nodeGroups: map[string][]models.AwsEksNodeGroup{
			"demo": {{
				NodeGroupName: "workers",
				Status:        "ACTIVE",
				DesiredSize:   2,
			}},
		},
	}

	service := &Service{
		store:    dataStore,
		ec2:      &stubEC2Inventory{regions: []string{"us-east-1"}},
		lambda:   stubLambdaInventory{},
		dynamodb: stubDynamoDBInventory{},
		sqs:      stubSQSInventory{},
		sns:      stubSNSInventory{},
		rds:      stubRDSInventory{},
		ecs:      stubECSInventory{},
		eks:            eks,
		cloudformation: stubCloudFormationInventory{},
		eventbridge:    stubEventBridgeInventory{},
		route53:        stubRoute53Inventory{},
		apigateway:     stubApiGatewayInventory{},
		secretsManager: stubSecretsManagerInventory{},
		logs:           stubLogsInventory{},
		iam:            stubIAMInventory{},
		now:            func() time.Time { return time.Now().UTC() },
	}

	snapshot := discovery.Snapshot{
		Providers: []models.ProviderSummary{{ProviderID: "aws", Label: "AWS"}},
		Profiles:  []models.ProfileSummary{{ProviderID: "aws", ProfileID: "sandbox", DisplayName: "sandbox"}},
	}
	session := models.SessionSnapshot{
		CurrentProviderID:      "aws",
		SelectedProfileID:      "sandbox",
		SelectedEKSRegion:      "us-east-1",
		SelectedEKSClusterName: "demo",
		IsLocked:               true,
	}

	workspace := service.buildWorkspaceSnapshotOpts(snapshot, session, workspaceSnapshotOptions{
		awsScope:           "eks",
		skipAzureInventory: true,
	})
	if eks.listClusters.Load() == 0 {
		t.Fatal("expected EKS ListClusters on scoped enrichment")
	}
	if len(workspace.EKSClusters) != 1 {
		t.Fatalf("expected 1 EKS cluster, got %+v", workspace.EKSClusters)
	}
	if eks.listNodeGroups.Load() == 0 {
		t.Fatal("expected EKS ListNodeGroups on scoped enrichment with selected cluster")
	}
	if len(workspace.EKSNodeGroups) != 1 {
		t.Fatalf("expected 1 node group, got %+v", workspace.EKSNodeGroups)
	}
}