// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package awsadapter

import (
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/elasticloadbalancingv2/types"
)

func TestElbLoadBalancerSummaryMapsFields(t *testing.T) {
	created := time.Date(2026, 3, 1, 12, 0, 0, 0, time.UTC)
	got := elbLoadBalancerSummary(types.LoadBalancer{
		LoadBalancerArn:  aws.String("arn:aws:elasticloadbalancing:us-east-1:123:loadbalancer/app/demo/abc"),
		LoadBalancerName: aws.String("demo-alb"),
		DNSName:          aws.String("demo-alb.elb.amazonaws.com"),
		Type:             types.LoadBalancerTypeEnumApplication,
		Scheme:           types.LoadBalancerSchemeEnumInternetFacing,
		VpcId:            aws.String("vpc-123"),
		State:            &types.LoadBalancerState{Code: types.LoadBalancerStateEnumActive},
		CreatedTime:      &created,
	})
	if got.LoadBalancerName != "demo-alb" || got.DNSName != "demo-alb.elb.amazonaws.com" {
		t.Fatalf("load balancer = %+v", got)
	}
	if got.Type != "application" || got.Scheme != "internet-facing" || got.State != "active" {
		t.Fatalf("load balancer classification = %+v", got)
	}
	if got.CreatedTime != "2026-03-01T12:00:00Z" {
		t.Fatalf("created time = %q", got.CreatedTime)
	}
}

func TestElbTargetGroupSummaryMapsFields(t *testing.T) {
	got := elbTargetGroupSummary(types.TargetGroup{
		TargetGroupArn:  aws.String("arn:aws:elasticloadbalancing:us-east-1:123:targetgroup/demo/abc"),
		TargetGroupName: aws.String("demo-tg"),
		Protocol:        types.ProtocolEnumHttp,
		Port:            aws.Int32(8080),
		TargetType:      types.TargetTypeEnumIp,
		VpcId:           aws.String("vpc-123"),
		HealthCheckPath: aws.String("/health"),
	})
	if got.TargetGroupName != "demo-tg" || got.Protocol != "HTTP" || got.Port != 8080 {
		t.Fatalf("target group = %+v", got)
	}
	if got.HealthCheckPath != "/health" || got.TargetType != "ip" {
		t.Fatalf("target group detail = %+v", got)
	}
}