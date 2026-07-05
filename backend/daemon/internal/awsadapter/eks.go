// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package awsadapter

import (
	"context"
	"fmt"
	"sort"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/eks"
	"github.com/aws/aws-sdk-go-v2/service/eks/types"

	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/models"
)

// EKSInventory provides read-only inventory for EKS clusters and node groups.
type EKSInventory struct {
	settings config.Settings
}

func NewEKSInventory(settings config.Settings) *EKSInventory {
	return &EKSInventory{settings: settings}
}

func (e *EKSInventory) ListClusters(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
) ([]models.AwsEksCluster, error) {
	if region == "" {
		region = awsRegionHint(profile)
	}
	cfg, err := e.loadConfig(ctx, profile, region)
	if err != nil {
		return nil, err
	}

	client := eksClient(cfg, profile)
	paginator := eks.NewListClustersPaginator(client, &eks.ListClustersInput{})
	clusterNames := []string{}
	for paginator.HasMorePages() {
		page, err := paginator.NextPage(ctx)
		if err != nil {
			return nil, err
		}
		clusterNames = append(clusterNames, page.Clusters...)
	}
	if len(clusterNames) == 0 {
		return []models.AwsEksCluster{}, nil
	}

	clusters := make([]models.AwsEksCluster, 0, len(clusterNames))
	for _, clusterName := range clusterNames {
		res, err := client.DescribeCluster(ctx, &eks.DescribeClusterInput{
			Name: aws.String(clusterName),
		})
		if err != nil {
			continue
		}
		if res.Cluster != nil {
			clusters = append(clusters, eksClusterSummary(*res.Cluster))
		}
	}
	sort.SliceStable(clusters, func(i, j int) bool {
		return clusters[i].ClusterName < clusters[j].ClusterName
	})
	return clusters, nil
}

func (e *EKSInventory) DescribeCluster(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
	clusterName string,
) (models.AwsEksCluster, error) {
	clusterName = strings.TrimSpace(clusterName)
	if clusterName == "" {
		return models.AwsEksCluster{}, fmt.Errorf("cluster name is required")
	}
	if region == "" {
		region = awsRegionHint(profile)
	}
	cfg, err := e.loadConfig(ctx, profile, region)
	if err != nil {
		return models.AwsEksCluster{}, err
	}

	client := eksClient(cfg, profile)
	res, err := client.DescribeCluster(ctx, &eks.DescribeClusterInput{
		Name: aws.String(clusterName),
	})
	if err != nil {
		return models.AwsEksCluster{}, err
	}
	if res.Cluster == nil {
		return models.AwsEksCluster{}, fmt.Errorf("cluster %s was not found", clusterName)
	}
	return eksClusterSummary(*res.Cluster), nil
}

func (e *EKSInventory) ListNodeGroups(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
	clusterName string,
) ([]models.AwsEksNodeGroup, error) {
	clusterName = strings.TrimSpace(clusterName)
	if clusterName == "" {
		return nil, fmt.Errorf("cluster name is required")
	}
	if region == "" {
		region = awsRegionHint(profile)
	}
	cfg, err := e.loadConfig(ctx, profile, region)
	if err != nil {
		return nil, err
	}

	client := eksClient(cfg, profile)
	paginator := eks.NewListNodegroupsPaginator(client, &eks.ListNodegroupsInput{
		ClusterName: aws.String(clusterName),
	})
	nodeGroupNames := []string{}
	for paginator.HasMorePages() {
		page, err := paginator.NextPage(ctx)
		if err != nil {
			return nil, err
		}
		nodeGroupNames = append(nodeGroupNames, page.Nodegroups...)
	}
	if len(nodeGroupNames) == 0 {
		return []models.AwsEksNodeGroup{}, nil
	}

	nodeGroups := make([]models.AwsEksNodeGroup, 0, len(nodeGroupNames))
	for _, nodeGroupName := range nodeGroupNames {
		res, err := client.DescribeNodegroup(ctx, &eks.DescribeNodegroupInput{
			ClusterName:   aws.String(clusterName),
			NodegroupName: aws.String(nodeGroupName),
		})
		if err != nil {
			continue
		}
		if res.Nodegroup != nil {
			nodeGroups = append(nodeGroups, eksNodeGroupSummary(*res.Nodegroup))
		}
	}
	sort.SliceStable(nodeGroups, func(i, j int) bool {
		return nodeGroups[i].NodeGroupName < nodeGroups[j].NodeGroupName
	})
	return nodeGroups, nil
}

func (e *EKSInventory) loadConfig(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
) (aws.Config, error) {
	return loadAWSConfig(ctx, e.settings, profile, region)
}

func eksClient(cfg aws.Config, profile models.ProfileSummary) *eks.Client {
	return eks.NewFromConfig(cfg, func(options *eks.Options) {
		if endpointURL := awsEndpointURL(profile); endpointURL != "" {
			options.BaseEndpoint = aws.String(endpointURL)
		}
	})
}

func eksClusterSummary(cluster types.Cluster) models.AwsEksCluster {
	summary := models.AwsEksCluster{
		ClusterArn:      awsString(cluster.Arn),
		ClusterName:     awsString(cluster.Name),
		Status:          string(cluster.Status),
		Version:         awsString(cluster.Version),
		PlatformVersion: awsString(cluster.PlatformVersion),
		RoleArn:         awsString(cluster.RoleArn),
	}
	if cluster.Endpoint != nil {
		summary.Endpoint = *cluster.Endpoint
	}
	return summary
}

func eksNodeGroupSummary(nodeGroup types.Nodegroup) models.AwsEksNodeGroup {
	summary := models.AwsEksNodeGroup{
		NodeGroupArn:  awsString(nodeGroup.NodegroupArn),
		NodeGroupName: awsString(nodeGroup.NodegroupName),
		Status:        string(nodeGroup.Status),
		InstanceTypes: append([]string(nil), nodeGroup.InstanceTypes...),
		AmiType:       string(nodeGroup.AmiType),
		CapacityType:  string(nodeGroup.CapacityType),
	}
	if nodeGroup.DiskSize != nil {
		summary.DiskSize = *nodeGroup.DiskSize
	}
	if nodeGroup.ScalingConfig != nil {
		if nodeGroup.ScalingConfig.DesiredSize != nil {
			summary.DesiredSize = *nodeGroup.ScalingConfig.DesiredSize
		}
		if nodeGroup.ScalingConfig.MinSize != nil {
			summary.MinSize = *nodeGroup.ScalingConfig.MinSize
		}
		if nodeGroup.ScalingConfig.MaxSize != nil {
			summary.MaxSize = *nodeGroup.ScalingConfig.MaxSize
		}
	}
	return summary
}