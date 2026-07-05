// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package awsadapter

import (
	"testing"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/route53/types"
)

func TestRoute53HostedZoneSummaryMapsFields(t *testing.T) {
	got := route53HostedZoneSummary(types.HostedZone{
		Id:   aws.String("/hostedzone/Z123"),
		Name: aws.String("example.com."),
		ResourceRecordSetCount: aws.Int64(12),
		Config: &types.HostedZoneConfig{
			Comment:     aws.String("Demo zone"),
			PrivateZone: false,
		},
	})
	if got.HostedZoneID != "/hostedzone/Z123" || got.Name != "example.com." || got.RecordCount != 12 {
		t.Fatalf("zone = %+v", got)
	}
	if got.Comment != "Demo zone" || got.PrivateZone {
		t.Fatalf("zone config = %+v", got)
	}
}

func TestRoute53ResourceRecordSetSummaryMapsFields(t *testing.T) {
	got := route53ResourceRecordSetSummary(types.ResourceRecordSet{
		Name: aws.String("www.example.com."),
		Type: types.RRTypeA,
		TTL:  aws.Int64(300),
		ResourceRecords: []types.ResourceRecord{
			{Value: aws.String("203.0.113.10")},
		},
	})
	if got.Name != "www.example.com." || got.Type != "A" || got.TTL != 300 {
		t.Fatalf("record = %+v", got)
	}
	if len(got.Values) != 1 || got.Values[0] != "203.0.113.10" {
		t.Fatalf("values = %+v", got.Values)
	}
}

func TestRoute53ResourceRecordSetSummaryMapsAliasTarget(t *testing.T) {
	got := route53ResourceRecordSetSummary(types.ResourceRecordSet{
		Name: aws.String("api.example.com."),
		Type: types.RRTypeA,
		AliasTarget: &types.AliasTarget{
			DNSName: aws.String("d111111abcdef8.cloudfront.net."),
		},
	})
	if got.AliasTarget != "d111111abcdef8.cloudfront.net." {
		t.Fatalf("alias = %+v", got)
	}
}