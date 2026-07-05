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

func (s *Service) enrichEventBridgeInventory(
	workspace *models.WorkspaceSnapshot,
	session models.SessionSnapshot,
	opts awsEnrichmentOptions,
	mu *sync.Mutex,
) {
	if workspace.Provider == nil ||
		workspace.Provider.ProviderID != "aws" ||
		workspace.Profile == nil ||
		s.eventbridge == nil {
		return
	}
	timeoutCtx, cancel := s.withAWSTimeout(context.Background())
	regions := s.eventBridgeRegions(timeoutCtx, *workspace.Profile)
	cancel()
	selectedRegion := s.selectedEventBridgeRegion(session, regions, *workspace.Profile)

	if opts.lightweight {
		status := "No region is available for EventBridge buses in this AWS workspace."
		if selectedRegion != "" {
			status = fmt.Sprintf("Loaded %d region(s). Select %s to browse buses.", len(regions), selectedRegion)
		} else if len(regions) > 0 {
			status = fmt.Sprintf("Loaded %d region(s). Select a region to browse buses.", len(regions))
		}
		lockWorkspace(mu, func() {
			workspace.EventBridgeRegions = regions
			workspace.SelectedEventBridgeRegion = selectedRegion
			workspace.EventBridgeBuses = []models.AwsEventBridgeBus{}
			workspace.EventBridgeRules = []models.AwsEventBridgeRule{}
			workspace.SelectedEventBridgeBusName = ""
			workspace.EventBridgeStatusMessage = status
		})
		return
	}

	timeoutCtx, cancel = s.withAWSTimeout(context.Background())
	buses := s.eventBridgeBuses(timeoutCtx, *workspace.Profile, selectedRegion)
	cancel()
	selectedBus := s.selectedEventBridgeBusName(session, buses)
	rules := []models.AwsEventBridgeRule{}
	if selectedBus != "" {
		timeoutCtx, cancel = s.withAWSTimeout(context.Background())
		rules = s.eventBridgeRules(timeoutCtx, *workspace.Profile, selectedRegion, selectedBus)
		cancel()
	}

	status := "No region is available for EventBridge buses in this AWS workspace."
	if selectedRegion != "" {
		if len(buses) == 0 {
			status = fmt.Sprintf("No EventBridge buses were returned for %s.", selectedRegion)
		} else if selectedBus == "" {
			status = fmt.Sprintf("Loaded %d EventBridge buses from %s.", len(buses), selectedRegion)
		} else {
			status = fmt.Sprintf(
				"Loaded %d buses and %d rules from %s.",
				len(buses),
				len(rules),
				selectedRegion,
			)
		}
	}

	lockWorkspace(mu, func() {
		workspace.EventBridgeRegions = regions
		workspace.SelectedEventBridgeRegion = selectedRegion
		workspace.EventBridgeBuses = buses
		workspace.EventBridgeRules = rules
		workspace.SelectedEventBridgeBusName = selectedBus
		workspace.EventBridgeStatusMessage = status
	})
}

func (s *Service) eventBridgeRegions(ctx context.Context, profile models.ProfileSummary) []string {
	return s.lambdaRegions(ctx, profile)
}

func (s *Service) selectedEventBridgeRegion(
	session models.SessionSnapshot,
	regions []string,
	profile models.ProfileSummary,
) string {
	if session.SelectedEventBridgeRegion != "" {
		for _, region := range regions {
			if region == session.SelectedEventBridgeRegion {
				return session.SelectedEventBridgeRegion
			}
		}
	}
	return s.selectedRDSRegion(session, regions, profile)
}

func (s *Service) eventBridgeBuses(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
) []models.AwsEventBridgeBus {
	if region == "" {
		return []models.AwsEventBridgeBus{}
	}
	const scope = "aws.eventbridge.buses"
	queryHash := profile.ProfileID + "|" + region

	var cached []models.AwsEventBridgeBus
	if _, ok, _ := s.loadCachedResource(ctx, scope, queryHash, &cached); ok {
		return cached
	}

	buses, err := s.eventbridge.ListEventBuses(ctx, profile, region)
	if err == nil {
		_ = s.saveResourceCacheWithTTL(ctx, scope, queryHash, buses)
		return buses
	}
	_, ok, cacheErr := s.store.LoadResourceCache(ctx, scope, queryHash, &cached)
	if cacheErr == nil && ok {
		return cached
	}
	return []models.AwsEventBridgeBus{}
}

func (s *Service) selectedEventBridgeBusName(
	session models.SessionSnapshot,
	buses []models.AwsEventBridgeBus,
) string {
	if session.SelectedEventBridgeBusName != "" {
		for _, bus := range buses {
			if bus.Name == session.SelectedEventBridgeBusName {
				return session.SelectedEventBridgeBusName
			}
		}
	}
	if len(buses) == 0 {
		return ""
	}
	return buses[0].Name
}

func (s *Service) eventBridgeRules(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
	busName string,
) []models.AwsEventBridgeRule {
	if region == "" || busName == "" {
		return []models.AwsEventBridgeRule{}
	}
	const scope = "aws.eventbridge.rules"
	queryHash := profile.ProfileID + "|" + region + "|" + busName

	var cached []models.AwsEventBridgeRule
	if _, ok, _ := s.loadCachedResource(ctx, scope, queryHash, &cached); ok {
		return cached
	}

	rules, err := s.eventbridge.ListRules(ctx, profile, region, busName)
	if err == nil {
		_ = s.saveResourceCacheWithTTL(ctx, scope, queryHash, rules)
		return rules
	}
	_, ok, cacheErr := s.store.LoadResourceCache(ctx, scope, queryHash, &cached)
	if cacheErr == nil && ok {
		return cached
	}
	return []models.AwsEventBridgeRule{}
}

func (s *Service) handleAwsEventBridgeSelectRegion(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		Region string `json:"region"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAWSWorkspace(ctx, "open an AWS workspace before selecting an EventBridge region", func(session *models.SessionSnapshot) error {
		session.SelectedEventBridgeRegion = request.Region
		session.SelectedEventBridgeBusName = ""
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAWSWorkspaceOpts(ctx, snapshot, session, notifier, workspaceSnapshotOptions{awsScope: "eventbridge", skipAzureInventory: true}, "", "", false)
}

func (s *Service) handleAwsEventBridgeSelectBus(ctx context.Context, params json.RawMessage, notifier Notifier) (any, error) {
	var request struct {
		BusName string `json:"busName"`
	}
	if err := json.Unmarshal(params, &request); err != nil {
		return nil, err
	}
	snapshot, session, err := s.withLockedAWSWorkspace(ctx, "open an AWS workspace before selecting an EventBridge bus", func(session *models.SessionSnapshot) error {
		session.SelectedEventBridgeBusName = request.BusName
		return nil
	})
	if err != nil {
		return nil, err
	}
	return s.finishAWSWorkspaceOpts(ctx, snapshot, session, notifier, workspaceSnapshotOptions{awsScope: "eventbridge", skipAzureInventory: true}, "", "", false)
}