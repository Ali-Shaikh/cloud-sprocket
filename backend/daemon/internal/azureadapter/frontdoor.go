// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package azureadapter

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"cloudsprocket/backend/daemon/internal/models"
)

var errFrontDoorLocalUnsupported = fmt.Errorf(
	"Azure Front Door topology is a cloud-only Azure feature; use a cloud Azure profile")

func isAzureFrontDoorSKU(sku string) bool {
	switch strings.TrimSpace(sku) {
	case "Standard_AzureFrontDoor", "Premium_AzureFrontDoor":
		return true
	default:
		return false
	}
}

// ListFrontDoorProfiles lists Azure Front Door Standard and Premium profiles in
// the subscription. When withWafLink is true, security policies are queried to
// attach linked WAF policy names.
func (i *Inventory) ListFrontDoorProfiles(
	ctx context.Context,
	profile models.ProfileSummary,
	withWafLink bool,
) ([]models.AzureFrontDoorProfile, error) {
	if isLocalFlociProfile(profile) {
		return nil, errFrontDoorLocalUnsupported
	}
	payload, err := i.run(ctx,
		"afd", "profile", "list",
		"--subscription", profile.ProfileID,
		"--output", "json",
		"--only-show-errors",
	)
	if err != nil {
		return nil, err
	}
	var decoded []struct {
		Name          string `json:"name"`
		ResourceGroup string `json:"resourceGroup"`
		Location      string `json:"location"`
		SKU           struct {
			Name string `json:"name"`
		} `json:"sku"`
	}
	if err := json.Unmarshal(payload, &decoded); err != nil {
		return nil, fmt.Errorf("decode front door profiles: %w", err)
	}
	profiles := make([]models.AzureFrontDoorProfile, 0, len(decoded))
	for _, item := range decoded {
		sku := strings.TrimSpace(item.SKU.Name)
		if !isAzureFrontDoorSKU(sku) {
			continue
		}
		summary := models.AzureFrontDoorProfile{
			Name:          item.Name,
			ResourceGroup: item.ResourceGroup,
			Location:      item.Location,
			SKU:           sku,
		}
		if withWafLink && item.ResourceGroup != "" && item.Name != "" {
			if wafName, wafRG, linkErr := i.frontDoorWafPolicyLink(ctx, item.ResourceGroup, item.Name); linkErr == nil {
				summary.WafPolicyName = wafName
				summary.WafPolicyResourceGroup = wafRG
			}
		}
		profiles = append(profiles, summary)
	}
	sort.Slice(profiles, func(left, right int) bool {
		return strings.ToLower(profiles[left].Name) < strings.ToLower(profiles[right].Name)
	})
	return profiles, nil
}

func (i *Inventory) frontDoorWafPolicyLink(
	ctx context.Context,
	resourceGroup string,
	profileName string,
) (policyName string, policyRG string, err error) {
	payload, err := i.run(ctx,
		"afd", "security-policy", "list",
		"--resource-group", resourceGroup,
		"--profile-name", profileName,
		"--output", "json",
		"--only-show-errors",
	)
	if err != nil {
		return "", "", err
	}
	var policies []struct {
		Properties struct {
			Parameters struct {
				WafPolicy struct {
					ID string `json:"id"`
				} `json:"wafPolicy"`
			} `json:"parameters"`
		} `json:"properties"`
	}
	if err := json.Unmarshal(payload, &policies); err != nil {
		return "", "", fmt.Errorf("decode front door security policies: %w", err)
	}
	for _, policy := range policies {
		id := strings.TrimSpace(policy.Properties.Parameters.WafPolicy.ID)
		if id == "" {
			continue
		}
		name, rg := wafPolicyIdentityFromARMID(id)
		if name != "" {
			return name, rg, nil
		}
	}
	return "", "", nil
}

func wafPolicyIdentityFromARMID(id string) (name string, resourceGroup string) {
	id = strings.TrimSpace(id)
	if id == "" {
		return "", ""
	}
	segments := strings.Split(strings.Trim(id, "/"), "/")
	for index := 0; index < len(segments)-1; index++ {
		if strings.EqualFold(segments[index], "resourceGroups") && index+1 < len(segments) {
			resourceGroup = segments[index+1]
		}
	}
	for index := len(segments) - 1; index >= 0; index-- {
		segment := segments[index]
		if strings.EqualFold(segment, "frontdoorWebApplicationFirewallPolicies") ||
			strings.EqualFold(segment, "cdnWebApplicationFirewallPolicies") {
			if index+1 < len(segments) {
				return segments[index+1], resourceGroup
			}
		}
	}
	return "", resourceGroup
}

// ListFrontDoorEndpoints lists endpoints for a Front Door profile.
func (i *Inventory) ListFrontDoorEndpoints(
	ctx context.Context,
	profile models.ProfileSummary,
	resourceGroup string,
	profileName string,
) ([]models.AzureFrontDoorEndpoint, error) {
	if isLocalFlociProfile(profile) {
		return nil, errFrontDoorLocalUnsupported
	}
	resourceGroup = strings.TrimSpace(resourceGroup)
	profileName = strings.TrimSpace(profileName)
	if resourceGroup == "" || profileName == "" {
		return []models.AzureFrontDoorEndpoint{}, nil
	}
	payload, err := i.run(ctx,
		"afd", "endpoint", "list",
		"--resource-group", resourceGroup,
		"--profile-name", profileName,
		"--output", "json",
		"--only-show-errors",
	)
	if err != nil {
		return nil, err
	}
	var decoded []frontDoorEndpointJSON
	if err := json.Unmarshal(payload, &decoded); err != nil {
		return nil, fmt.Errorf("decode front door endpoints: %w", err)
	}
	endpoints := make([]models.AzureFrontDoorEndpoint, 0, len(decoded))
	for _, item := range decoded {
		endpoints = append(endpoints, models.AzureFrontDoorEndpoint{
			Name:          item.Name,
			ProfileName:   profileName,
			ResourceGroup: resourceGroup,
			HostName:      item.hostName(),
			EnabledState:  item.enabledState(),
		})
	}
	sort.Slice(endpoints, func(left, right int) bool {
		return strings.ToLower(endpoints[left].Name) < strings.ToLower(endpoints[right].Name)
	})
	return endpoints, nil
}

// ListFrontDoorOriginGroups lists origin groups for a Front Door profile.
func (i *Inventory) ListFrontDoorOriginGroups(
	ctx context.Context,
	profile models.ProfileSummary,
	resourceGroup string,
	profileName string,
) ([]models.AzureFrontDoorOriginGroup, error) {
	if isLocalFlociProfile(profile) {
		return nil, errFrontDoorLocalUnsupported
	}
	resourceGroup = strings.TrimSpace(resourceGroup)
	profileName = strings.TrimSpace(profileName)
	if resourceGroup == "" || profileName == "" {
		return []models.AzureFrontDoorOriginGroup{}, nil
	}
	payload, err := i.run(ctx,
		"afd", "origin-group", "list",
		"--resource-group", resourceGroup,
		"--profile-name", profileName,
		"--output", "json",
		"--only-show-errors",
	)
	if err != nil {
		return nil, err
	}
	var decoded []frontDoorOriginGroupJSON
	if err := json.Unmarshal(payload, &decoded); err != nil {
		return nil, fmt.Errorf("decode front door origin groups: %w", err)
	}
	groups := make([]models.AzureFrontDoorOriginGroup, 0, len(decoded))
	for _, item := range decoded {
		groups = append(groups, models.AzureFrontDoorOriginGroup{
			Name:          item.Name,
			ProfileName:   profileName,
			ResourceGroup: resourceGroup,
			HealthProbe:   item.healthProbe(),
			LoadBalancing: item.loadBalancing(),
		})
	}
	sort.Slice(groups, func(left, right int) bool {
		return strings.ToLower(groups[left].Name) < strings.ToLower(groups[right].Name)
	})
	return groups, nil
}

// ListFrontDoorOrigins lists origins within an origin group.
func (i *Inventory) ListFrontDoorOrigins(
	ctx context.Context,
	profile models.ProfileSummary,
	resourceGroup string,
	profileName string,
	originGroupName string,
) ([]models.AzureFrontDoorOrigin, error) {
	if isLocalFlociProfile(profile) {
		return nil, errFrontDoorLocalUnsupported
	}
	resourceGroup = strings.TrimSpace(resourceGroup)
	profileName = strings.TrimSpace(profileName)
	originGroupName = strings.TrimSpace(originGroupName)
	if resourceGroup == "" || profileName == "" || originGroupName == "" {
		return []models.AzureFrontDoorOrigin{}, nil
	}
	payload, err := i.run(ctx,
		"afd", "origin", "list",
		"--resource-group", resourceGroup,
		"--profile-name", profileName,
		"--origin-group-name", originGroupName,
		"--output", "json",
		"--only-show-errors",
	)
	if err != nil {
		return nil, err
	}
	var decoded []frontDoorOriginJSON
	if err := json.Unmarshal(payload, &decoded); err != nil {
		return nil, fmt.Errorf("decode front door origins: %w", err)
	}
	origins := make([]models.AzureFrontDoorOrigin, 0, len(decoded))
	for _, item := range decoded {
		origins = append(origins, models.AzureFrontDoorOrigin{
			Name:            item.Name,
			OriginGroupName: originGroupName,
			ProfileName:     profileName,
			ResourceGroup:   resourceGroup,
			HostName:        item.hostName(),
			EnabledState:    item.enabledState(),
			Priority:        item.priority(),
			Weight:          item.weight(),
		})
	}
	sort.Slice(origins, func(left, right int) bool {
		return strings.ToLower(origins[left].Name) < strings.ToLower(origins[right].Name)
	})
	return origins, nil
}

// PurgeFrontDoorEndpointCache purges cached content for an AFD Standard/Premium endpoint.
func (i *Inventory) PurgeFrontDoorEndpointCache(
	ctx context.Context,
	profile models.ProfileSummary,
	resourceGroup string,
	profileName string,
	endpointName string,
	contentPaths []string,
	domains []string,
) error {
	if isLocalFlociProfile(profile) {
		return errFrontDoorLocalUnsupported
	}
	resourceGroup = strings.TrimSpace(resourceGroup)
	profileName = strings.TrimSpace(profileName)
	endpointName = strings.TrimSpace(endpointName)
	if resourceGroup == "" || profileName == "" || endpointName == "" {
		return fmt.Errorf("resource group, profile name, and endpoint name are required")
	}
	if len(contentPaths) == 0 {
		return fmt.Errorf("at least one content path is required")
	}
	args := []string{
		"afd", "endpoint", "purge",
		"--subscription", profile.ProfileID,
		"--resource-group", resourceGroup,
		"--profile-name", profileName,
		"--endpoint-name", endpointName,
	}
	for _, path := range contentPaths {
		args = append(args, "--content-paths", path)
	}
	for _, domain := range domains {
		args = append(args, "--domains", domain)
	}
	args = append(args, "--output", "none", "--only-show-errors")
	_, err := i.run(ctx, args...)
	return err
}

type frontDoorEndpointJSON struct {
	Name         string `json:"name"`
	HostName     string `json:"hostName"`
	EnabledState string `json:"enabledState"`
	Properties   struct {
		HostName     string `json:"hostName"`
		EnabledState string `json:"enabledState"`
	} `json:"properties"`
}

func (item frontDoorEndpointJSON) hostName() string {
	if strings.TrimSpace(item.Properties.HostName) != "" {
		return strings.TrimSpace(item.Properties.HostName)
	}
	return strings.TrimSpace(item.HostName)
}

func (item frontDoorEndpointJSON) enabledState() string {
	if strings.TrimSpace(item.Properties.EnabledState) != "" {
		return strings.TrimSpace(item.Properties.EnabledState)
	}
	return strings.TrimSpace(item.EnabledState)
}

type frontDoorOriginGroupJSON struct {
	Name       string `json:"name"`
	Properties struct {
		HealthProbeSettings struct {
			ProbePath string `json:"probePath"`
		} `json:"healthProbeSettings"`
		LoadBalancingSettings struct {
			SampleSize int `json:"sampleSize"`
		} `json:"loadBalancingSettings"`
	} `json:"properties"`
}

func (item frontDoorOriginGroupJSON) healthProbe() string {
	return strings.TrimSpace(item.Properties.HealthProbeSettings.ProbePath)
}

func (item frontDoorOriginGroupJSON) loadBalancing() string {
	if item.Properties.LoadBalancingSettings.SampleSize > 0 {
		return fmt.Sprintf("sampleSize=%d", item.Properties.LoadBalancingSettings.SampleSize)
	}
	return ""
}

type frontDoorOriginJSON struct {
	Name         string `json:"name"`
	HostName     string `json:"hostName"`
	EnabledState string `json:"enabledState"`
	Priority     int    `json:"priority"`
	Weight       int    `json:"weight"`
	Properties   struct {
		HostName     string `json:"hostName"`
		EnabledState string `json:"enabledState"`
		Priority     int    `json:"priority"`
		Weight       int    `json:"weight"`
	} `json:"properties"`
}

func (item frontDoorOriginJSON) hostName() string {
	if strings.TrimSpace(item.Properties.HostName) != "" {
		return strings.TrimSpace(item.Properties.HostName)
	}
	return strings.TrimSpace(item.HostName)
}

func (item frontDoorOriginJSON) enabledState() string {
	if strings.TrimSpace(item.Properties.EnabledState) != "" {
		return strings.TrimSpace(item.Properties.EnabledState)
	}
	return strings.TrimSpace(item.EnabledState)
}

func (item frontDoorOriginJSON) usesFlatShape() bool {
	return strings.TrimSpace(item.HostName) != "" && strings.TrimSpace(item.Properties.HostName) == ""
}

func (item frontDoorOriginJSON) priority() int {
	if item.usesFlatShape() {
		return item.Priority
	}
	return item.Properties.Priority
}

func (item frontDoorOriginJSON) weight() int {
	if item.usesFlatShape() {
		return item.Weight
	}
	return item.Properties.Weight
}
