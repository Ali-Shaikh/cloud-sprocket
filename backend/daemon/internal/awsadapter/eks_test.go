// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package awsadapter

import (
	"testing"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/eks/types"
)

func TestEksClusterSummaryMapsFields(t *testing.T) {
	endpoint := "https://demo.eks.us-east-1.amazonaws.com"
	got := eksClusterSummary(types.Cluster{
		Arn:             aws.String("arn:aws:eks:us-east-1:123:cluster/demo"),
		Name:            aws.String("demo"),
		Status:          types.ClusterStatusActive,
		Version:         aws.String("1.29"),
		PlatformVersion: aws.String("eks.5"),
		RoleArn:         aws.String("arn:aws:iam::123:role/eks-cluster"),
		Endpoint:        &endpoint,
	})
	if got.ClusterName != "demo" || got.Status != "ACTIVE" || got.Version != "1.29" || got.Endpoint != endpoint {
		t.Fatalf("cluster = %+v", got)
	}
}

func TestEksNodeGroupSummaryMapsScaling(t *testing.T) {
	got := eksNodeGroupSummary(types.Nodegroup{
		NodegroupArn:  aws.String("arn:aws:eks:us-east-1:123:nodegroup/demo/workers"),
		NodegroupName: aws.String("workers"),
		Status:        types.NodegroupStatusActive,
		InstanceTypes: []string{"m5.large"},
		AmiType:       types.AMITypesAl2X8664,
		CapacityType:  types.CapacityTypesOnDemand,
		DiskSize:      aws.Int32(20),
		ScalingConfig: &types.NodegroupScalingConfig{
			DesiredSize: aws.Int32(2),
			MinSize:     aws.Int32(1),
			MaxSize:     aws.Int32(4),
		},
	})
	if got.NodeGroupName != "workers" || got.DesiredSize != 2 || got.InstanceTypes[0] != "m5.large" {
		t.Fatalf("node group = %+v", got)
	}
}