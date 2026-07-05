// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package awsadapter

import (
	"context"
	"fmt"
	"sort"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/eventbridge"
	"github.com/aws/aws-sdk-go-v2/service/eventbridge/types"

	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/models"
)

const defaultEventBridgeBusName = "default"

// EventBridgeInventory provides read-only inventory for EventBridge buses and rules.
type EventBridgeInventory struct {
	settings config.Settings
}

func NewEventBridgeInventory(settings config.Settings) *EventBridgeInventory {
	return &EventBridgeInventory{settings: settings}
}

func (e *EventBridgeInventory) ListEventBuses(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
) ([]models.AwsEventBridgeBus, error) {
	if region == "" {
		region = awsRegionHint(profile)
	}
	cfg, err := e.loadConfig(ctx, profile, region)
	if err != nil {
		return nil, err
	}

	client := eventBridgeClient(cfg, profile)
	buses := make([]models.AwsEventBridgeBus, 0)
	var nextToken *string
	for {
		res, err := client.ListEventBuses(ctx, &eventbridge.ListEventBusesInput{
			NextToken: nextToken,
		})
		if err != nil {
			return nil, err
		}
		for _, bus := range res.EventBuses {
			buses = append(buses, eventBridgeBusSummary(bus))
		}
		if res.NextToken == nil || *res.NextToken == "" {
			break
		}
		nextToken = res.NextToken
	}
	sort.SliceStable(buses, func(i, j int) bool {
		return buses[i].Name < buses[j].Name
	})
	return buses, nil
}

func (e *EventBridgeInventory) ListRules(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
	busName string,
) ([]models.AwsEventBridgeRule, error) {
	busName = strings.TrimSpace(busName)
	if busName == "" {
		busName = defaultEventBridgeBusName
	}
	if region == "" {
		region = awsRegionHint(profile)
	}
	cfg, err := e.loadConfig(ctx, profile, region)
	if err != nil {
		return nil, err
	}

	client := eventBridgeClient(cfg, profile)
	rules := make([]models.AwsEventBridgeRule, 0)
	var nextToken *string
	for {
		res, err := client.ListRules(ctx, &eventbridge.ListRulesInput{
			EventBusName: aws.String(busName),
			NextToken:    nextToken,
		})
		if err != nil {
			return nil, fmt.Errorf("list rules for bus %s: %w", busName, err)
		}
		for _, rule := range res.Rules {
			rules = append(rules, eventBridgeRuleSummary(rule))
		}
		if res.NextToken == nil || *res.NextToken == "" {
			break
		}
		nextToken = res.NextToken
	}
	sort.SliceStable(rules, func(i, j int) bool {
		return rules[i].Name < rules[j].Name
	})
	return rules, nil
}

func (e *EventBridgeInventory) loadConfig(
	ctx context.Context,
	profile models.ProfileSummary,
	region string,
) (aws.Config, error) {
	return loadAWSConfig(ctx, e.settings, profile, region)
}

func eventBridgeClient(cfg aws.Config, profile models.ProfileSummary) *eventbridge.Client {
	return eventbridge.NewFromConfig(cfg, func(options *eventbridge.Options) {
		if endpointURL := awsEndpointURL(profile); endpointURL != "" {
			options.BaseEndpoint = aws.String(endpointURL)
		}
	})
}

func eventBridgeBusSummary(bus types.EventBus) models.AwsEventBridgeBus {
	return models.AwsEventBridgeBus{
		Name: awsString(bus.Name),
		Arn:  awsString(bus.Arn),
	}
}

func eventBridgeRuleSummary(rule types.Rule) models.AwsEventBridgeRule {
	return models.AwsEventBridgeRule{
		Name:               awsString(rule.Name),
		Arn:                awsString(rule.Arn),
		State:              string(rule.State),
		Description:        awsString(rule.Description),
		ScheduleExpression: awsString(rule.ScheduleExpression),
		EventPattern:       awsString(rule.EventPattern),
	}
}
