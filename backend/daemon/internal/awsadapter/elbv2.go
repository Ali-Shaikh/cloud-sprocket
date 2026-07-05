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
	"github.com/aws/aws-sdk-go-v2/service/elasticloadbalancingv2"
	"github.com/aws/aws-sdk-go-v2/service/elasticloadbalancingv2/types"

	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/models"
)

// Elbv2Inventory provides read-only inventory for Application, Network, and Gateway load balancers.
type Elbv2Inventory struct {
	settings config.Settings
}

func NewElbv2Inventory(settings config.Settings) *Elbv2Inventory {
	return &Elbv2Inventory{settings: settings}
}

func (e *Elbv2Inventory) DescribeLoadBalancers(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
) ([]models.AwsElbLoadBalancer, error) {
	if region == "" {
		region = awsRegionHint(profile)
	}
	cfg, err := e.loadConfig(ctx, profile, region)
	if err != nil {
		return nil, err
	}

	client := elbv2Client(cfg, profile)
	loadBalancers := make([]models.AwsElbLoadBalancer, 0)
	var marker *string
	for {
		res, err := client.DescribeLoadBalancers(ctx, &elasticloadbalancingv2.DescribeLoadBalancersInput{
			Marker: marker,
		})
		if err != nil {
			return nil, err
		}
		for _, loadBalancer := range res.LoadBalancers {
			loadBalancers = append(loadBalancers, elbLoadBalancerSummary(loadBalancer))
		}
		if res.NextMarker == nil || *res.NextMarker == "" {
			break
		}
		marker = res.NextMarker
	}
	sort.SliceStable(loadBalancers, func(i, j int) bool {
		return loadBalancers[i].LoadBalancerName < loadBalancers[j].LoadBalancerName
	})
	return loadBalancers, nil
}

func (e *Elbv2Inventory) DescribeTargetGroups(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
	loadBalancerArn string,
) ([]models.AwsElbTargetGroup, error) {
	loadBalancerArn = strings.TrimSpace(loadBalancerArn)
	if loadBalancerArn == "" {
		return nil, fmt.Errorf("load balancer ARN is required")
	}
	if region == "" {
		region = awsRegionHint(profile)
	}
	cfg, err := e.loadConfig(ctx, profile, region)
	if err != nil {
		return nil, err
	}

	client := elbv2Client(cfg, profile)
	targetGroups := make([]models.AwsElbTargetGroup, 0)
	var marker *string
	for {
		res, err := client.DescribeTargetGroups(ctx, &elasticloadbalancingv2.DescribeTargetGroupsInput{
			LoadBalancerArn: aws.String(loadBalancerArn),
			Marker:          marker,
		})
		if err != nil {
			return nil, fmt.Errorf("describe target groups for %s: %w", loadBalancerArn, err)
		}
		for _, targetGroup := range res.TargetGroups {
			targetGroups = append(targetGroups, elbTargetGroupSummary(targetGroup))
		}
		if res.NextMarker == nil || *res.NextMarker == "" {
			break
		}
		marker = res.NextMarker
	}
	sort.SliceStable(targetGroups, func(i, j int) bool {
		return targetGroups[i].TargetGroupName < targetGroups[j].TargetGroupName
	})
	return targetGroups, nil
}

func (e *Elbv2Inventory) loadConfig(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
) (aws.Config, error) {
	return loadAWSConfig(ctx, e.settings, profile, region)
}

func elbv2Client(cfg aws.Config, profile models.ProfileSummary) *elasticloadbalancingv2.Client {
	return elasticloadbalancingv2.NewFromConfig(cfg, func(options *elasticloadbalancingv2.Options) {
		if endpointURL := awsEndpointURL(profile); endpointURL != "" {
			options.BaseEndpoint = aws.String(endpointURL)
		}
	})
}

func elbLoadBalancerSummary(loadBalancer types.LoadBalancer) models.AwsElbLoadBalancer {
	summary := models.AwsElbLoadBalancer{
		LoadBalancerArn:  awsString(loadBalancer.LoadBalancerArn),
		LoadBalancerName: awsString(loadBalancer.LoadBalancerName),
		DNSName:          awsString(loadBalancer.DNSName),
		Type:             string(loadBalancer.Type),
		Scheme:           string(loadBalancer.Scheme),
		VpcID:            awsString(loadBalancer.VpcId),
	}
	if loadBalancer.State != nil {
		summary.State = string(loadBalancer.State.Code)
	}
	if loadBalancer.CreatedTime != nil {
		summary.CreatedTime = loadBalancer.CreatedTime.UTC().Format(time.RFC3339)
	}
	return summary
}

func elbTargetGroupSummary(targetGroup types.TargetGroup) models.AwsElbTargetGroup {
	summary := models.AwsElbTargetGroup{
		TargetGroupArn:  awsString(targetGroup.TargetGroupArn),
		TargetGroupName: awsString(targetGroup.TargetGroupName),
		Protocol:        string(targetGroup.Protocol),
		TargetType:      string(targetGroup.TargetType),
		VpcID:           awsString(targetGroup.VpcId),
		HealthCheckPath: awsString(targetGroup.HealthCheckPath),
	}
	if targetGroup.Port != nil {
		summary.Port = *targetGroup.Port
	}
	return summary
}