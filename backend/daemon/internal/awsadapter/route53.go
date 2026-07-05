// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package awsadapter

import (
	"context"
	"fmt"
	"sort"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/route53"
	"github.com/aws/aws-sdk-go-v2/service/route53/types"

	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/models"
)

const maxRoute53ResourceRecordSets = 50

// Route53Inventory provides read-only inventory for Route 53 hosted zones and records.
type Route53Inventory struct {
	settings config.Settings
}

func NewRoute53Inventory(settings config.Settings) *Route53Inventory {
	return &Route53Inventory{settings: settings}
}

func (r *Route53Inventory) ListHostedZones(
	ctx context.Context,
	profile models.ProfileSummary,
) ([]models.AwsRoute53HostedZone, error) {
	cfg, err := r.loadConfig(ctx, profile)
	if err != nil {
		return nil, err
	}

	client := route53Client(cfg, profile)
	zones := make([]models.AwsRoute53HostedZone, 0)
	var marker *string
	for {
		res, err := client.ListHostedZones(ctx, &route53.ListHostedZonesInput{
			Marker: marker,
		})
		if err != nil {
			return nil, err
		}
		for _, zone := range res.HostedZones {
			zones = append(zones, route53HostedZoneSummary(zone))
		}
		if !res.IsTruncated {
			break
		}
		marker = res.NextMarker
	}
	sort.SliceStable(zones, func(i, j int) bool {
		return zones[i].Name < zones[j].Name
	})
	return zones, nil
}

func (r *Route53Inventory) ListResourceRecordSets(
	ctx context.Context,
	profile models.ProfileSummary,
	hostedZoneID string,
) ([]models.AwsRoute53ResourceRecordSet, error) {
	hostedZoneID = strings.TrimSpace(hostedZoneID)
	if hostedZoneID == "" {
		return nil, fmt.Errorf("hosted zone ID is required")
	}
	cfg, err := r.loadConfig(ctx, profile)
	if err != nil {
		return nil, err
	}

	client := route53Client(cfg, profile)
	records := make([]models.AwsRoute53ResourceRecordSet, 0, maxRoute53ResourceRecordSets)
	var startRecordName *string
	var startRecordType types.RRType
	var startRecordIdentifier *string
	for len(records) < maxRoute53ResourceRecordSets {
		res, err := client.ListResourceRecordSets(ctx, &route53.ListResourceRecordSetsInput{
			HostedZoneId:          aws.String(hostedZoneID),
			StartRecordName:       startRecordName,
			StartRecordType:       startRecordType,
			StartRecordIdentifier: startRecordIdentifier,
		})
		if err != nil {
			return nil, fmt.Errorf("list records for hosted zone %s: %w", hostedZoneID, err)
		}
		for _, record := range res.ResourceRecordSets {
			records = append(records, route53ResourceRecordSetSummary(record))
			if len(records) >= maxRoute53ResourceRecordSets {
				break
			}
		}
		if !res.IsTruncated || len(records) >= maxRoute53ResourceRecordSets {
			break
		}
		last := res.ResourceRecordSets[len(res.ResourceRecordSets)-1]
		startRecordName = last.Name
		startRecordType = last.Type
		startRecordIdentifier = last.SetIdentifier
	}
	return records, nil
}

func (r *Route53Inventory) loadConfig(
	ctx context.Context,
	profile models.ProfileSummary,
) (aws.Config, error) {
	region := awsRegionHint(profile)
	if region == "" {
		region = "us-east-1"
	}
	return loadAWSConfig(ctx, r.settings, profile, region)
}

func route53Client(cfg aws.Config, profile models.ProfileSummary) *route53.Client {
	return route53.NewFromConfig(cfg, func(options *route53.Options) {
		if endpointURL := awsEndpointURL(profile); endpointURL != "" {
			options.BaseEndpoint = aws.String(endpointURL)
		}
	})
}

func route53HostedZoneSummary(zone types.HostedZone) models.AwsRoute53HostedZone {
	summary := models.AwsRoute53HostedZone{
		HostedZoneID: awsString(zone.Id),
		Name:         awsString(zone.Name),
		RecordCount:  awsInt64(zone.ResourceRecordSetCount),
	}
	if zone.Config != nil {
		summary.PrivateZone = zone.Config.PrivateZone
		summary.Comment = awsString(zone.Config.Comment)
	}
	return summary
}

func route53ResourceRecordSetSummary(record types.ResourceRecordSet) models.AwsRoute53ResourceRecordSet {
	summary := models.AwsRoute53ResourceRecordSet{
		Name: awsString(record.Name),
		Type: string(record.Type),
	}
	if record.TTL != nil {
		summary.TTL = *record.TTL
	}
	if record.AliasTarget != nil {
		summary.AliasTarget = awsString(record.AliasTarget.DNSName)
	}
	values := make([]string, 0, len(record.ResourceRecords))
	for _, resourceRecord := range record.ResourceRecords {
		if value := awsString(resourceRecord.Value); value != "" {
			values = append(values, value)
		}
	}
	if len(values) > 0 {
		summary.Values = values
	}
	return summary
}

func awsInt64(value *int64) int64 {
	if value == nil {
		return 0
	}
	return *value
}