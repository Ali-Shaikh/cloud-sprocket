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

func (s *Service) enrichRoute53Inventory(
	workspace *models.WorkspaceSnapshot,
	session models.SessionSnapshot,
	opts awsEnrichmentOptions,
	mu *sync.Mutex,
) {
	if workspace.Provider == nil ||
		workspace.Provider.ProviderID != "aws" ||
		workspace.Profile == nil ||
		s.route53 == nil {
		return
	}

	if opts.lightweight {
		status := "Select a hosted zone to browse DNS records."
		lockWorkspace(mu, func() {
			workspace.Route53HostedZones = []models.AwsRoute53HostedZone{}
			workspace.Route53ResourceRecordSets = []models.AwsRoute53ResourceRecordSet{}
			workspace.SelectedRoute53HostedZoneID = ""
			workspace.Route53StatusMessage = status
		})
		return
	}

	timeoutCtx, cancel := s.withAWSTimeout(context.Background())
	hostedZones := s.route53HostedZones(timeoutCtx, *workspace.Profile)
	cancel()
	selectedZone := s.selectedRoute53HostedZoneID(session, hostedZones)
	records := []models.AwsRoute53ResourceRecordSet{}
	if selectedZone != "" {
		timeoutCtx, cancel = s.withAWSTimeout(context.Background())
		records = s.route53ResourceRecordSets(timeoutCtx, *workspace.Profile, selectedZone)
		cancel()
	}

	status := "No Route 53 hosted zones were returned for this AWS workspace."
	if len(hostedZones) > 0 {
		if selectedZone == "" {
			status = fmt.Sprintf("Loaded %d hosted zones.", len(hostedZones))
		} else {
			status = fmt.Sprintf(
				"Loaded %d hosted zones and %d record previews.",
				len(hostedZones),
				len(records),
			)
		}
	}

	lockWorkspace(mu, func() {
		workspace.Route53HostedZones = hostedZones
		workspace.Route53ResourceRecordSets = records
		workspace.SelectedRoute53HostedZoneID = selectedZone
		workspace.Route53StatusMessage = status
	})
}

func (s *Service) route53HostedZones(
	ctx context.Context,
	profile models.ProfileSummary,
) []models.AwsRoute53HostedZone {
	const scope = "aws.route53.hostedzones"
	queryHash := profile.ProfileID

	var cached []models.AwsRoute53HostedZone
	if _, ok, _ := s.loadCachedResource(ctx, scope, queryHash, &cached); ok {
		return cached
	}

	zones, err := s.route53.ListHostedZones(ctx, profile)
	if err == nil {
		_ = s.saveResourceCacheWithTTL(ctx, scope, queryHash, zones)
		return zones
	}
	_, ok, cacheErr := s.store.LoadResourceCache(ctx, scope, queryHash, &cached)
	if cacheErr == nil && ok {
		return cached
	}
	return []models.AwsRoute53HostedZone{}
}

func (s *Service) selectedRoute53HostedZoneID(
	session models.SessionSnapshot,
	hostedZones []models.AwsRoute53HostedZone,
) string {
	if session.SelectedRoute53HostedZoneID != "" {
		for _, zone := range hostedZones {
			if zone.HostedZoneID == session.SelectedRoute53HostedZoneID {
				return session.SelectedRoute53HostedZoneID
			}
		}
	}
	if len(hostedZones) == 0 {
		return ""
	}
	return hostedZones[0].HostedZoneID
}

func (s *Service) route53ResourceRecordSets(
	ctx context.Context,
	profile models.ProfileSummary,
	hostedZoneID string,
) []models.AwsRoute53ResourceRecordSet {
	if hostedZoneID == "" {
		return []models.AwsRoute53ResourceRecordSet{}
	}
	const scope = "aws.route53.records"
	queryHash := profile.ProfileID + "|" + hostedZoneID

	var cached []models.AwsRoute53ResourceRecordSet
	if _, ok, _ := s.loadCachedResource(ctx, scope, queryHash, &cached); ok {
		return cached
	}

	records, err := s.route53.ListResourceRecordSets(ctx, profile, hostedZoneID)
	if err == nil {
		_ = s.saveResourceCacheWithTTL(ctx, scope, queryHash, records)
		return records
	}
	_, ok, cacheErr := s.store.LoadResourceCache(ctx, scope, queryHash, &cached)
	if cacheErr == nil && ok {
		return cached
	}
	return []models.AwsRoute53ResourceRecordSet{}
}

func (s *Service) handleAwsRoute53SelectHostedZone(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		HostedZoneID string `json:"hostedZoneId"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAWSWorkspace(ctx, "open an AWS workspace before selecting a Route 53 hosted zone", func(session *models.SessionSnapshot) error {
		session.SelectedRoute53HostedZoneID = request.HostedZoneID
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAWSWorkspaceOpts(ctx, snapshot, session, notifier, workspaceSnapshotOptions{awsScope: "route53", skipAzureInventory: true}, "", "", false)
}