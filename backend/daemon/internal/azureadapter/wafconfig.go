package azureadapter

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"cloudsprocket/backend/daemon/internal/models"
)

var errWafConfigLocalUnsupported = fmt.Errorf(
	"WAF policy config is a cloud-only Azure feature; use a cloud Azure profile")

// ListWafPolicies lists Front Door WAF policies across the subscription. When
// withDetail is false only names and locations are returned (no per-policy show).
func (i *Inventory) ListWafPolicies(
	ctx context.Context,
	profile models.ProfileSummary,
	withDetail bool,
) ([]models.AzureWafPolicySummary, error) {
	if isLocalFlociProfile(profile) {
		return nil, errWafConfigLocalUnsupported
	}
	resourceTypes := []string{
		"Microsoft.Cdn/cdnWebApplicationFirewallPolicies",
		"Microsoft.Network/frontdoorWebApplicationFirewallPolicies",
	}
	seen := make(map[string]struct{})
	policies := make([]models.AzureWafPolicySummary, 0)
	for _, resourceType := range resourceTypes {
		args := []string{
			"resource", "list",
			"--subscription", profile.ProfileID,
			"--resource-type", resourceType,
			"--output", "json",
			"--only-show-errors",
		}
		payload, err := i.run(ctx, args...)
		if err != nil {
			continue
		}
		var resources []struct {
			Name          string `json:"name"`
			ResourceGroup string `json:"resourceGroup"`
			Location      string `json:"location"`
		}
		if err := json.Unmarshal(payload, &resources); err != nil {
			return nil, fmt.Errorf("decode waf policies: %w", err)
		}
		for _, resource := range resources {
			key := strings.ToLower(resource.ResourceGroup + "/" + resource.Name)
			if _, ok := seen[key]; ok {
				continue
			}
			seen[key] = struct{}{}
			summary := models.AzureWafPolicySummary{
				Name:          resource.Name,
				ResourceGroup: resource.ResourceGroup,
				Location:      resource.Location,
				Enabled:       true,
			}
			if withDetail {
				detail, detailErr := i.GetWafPolicy(ctx, profile, resource.ResourceGroup, resource.Name)
				if detailErr == nil {
					summary.SKU = detail.SKU
					summary.Mode = detail.Mode
					summary.Enabled = detail.Enabled
				}
			}
			policies = append(policies, summary)
		}
	}
	return policies, nil
}

// GetWafPolicy returns the full read-only config for a WAF policy.
func (i *Inventory) GetWafPolicy(
	ctx context.Context,
	profile models.ProfileSummary,
	resourceGroup string,
	policyName string,
) (models.AzureWafPolicyDetail, error) {
	if isLocalFlociProfile(profile) {
		return models.AzureWafPolicyDetail{}, errWafConfigLocalUnsupported
	}
	resourceGroup = strings.TrimSpace(resourceGroup)
	policyName = strings.TrimSpace(policyName)
	if resourceGroup == "" || policyName == "" {
		return models.AzureWafPolicyDetail{}, fmt.Errorf("a resource group and policy name are required")
	}
	payload, err := i.run(ctx,
		"network", "front-door", "waf-policy", "show",
		"--resource-group", resourceGroup,
		"--policy-name", policyName,
		"--output", "json",
		"--only-show-errors",
	)
	if err != nil {
		return models.AzureWafPolicyDetail{}, err
	}
	return decodeWafPolicyDetail(payload, resourceGroup)
}

// UpdateWafPolicyMode toggles a policy between Prevention and Detection.
func (i *Inventory) UpdateWafPolicyMode(
	ctx context.Context,
	profile models.ProfileSummary,
	resourceGroup string,
	policyName string,
	mode string,
) error {
	if isLocalFlociProfile(profile) {
		return errWafConfigLocalUnsupported
	}
	_, err := i.run(ctx,
		"network", "front-door", "waf-policy", "update",
		"--resource-group", strings.TrimSpace(resourceGroup),
		"--policy-name", strings.TrimSpace(policyName),
		"--mode", strings.TrimSpace(mode),
		"--output", "none",
		"--only-show-errors",
	)
	return err
}

// SetWafManagedRuleOverride enables or disables a managed rule via override add.
func (i *Inventory) SetWafManagedRuleOverride(
	ctx context.Context,
	profile models.ProfileSummary,
	resourceGroup string,
	policyName string,
	ruleSetType string,
	ruleSetVersion string,
	ruleGroupName string,
	ruleID string,
	enabled bool,
) error {
	if isLocalFlociProfile(profile) {
		return errWafConfigLocalUnsupported
	}
	state := "Disabled"
	if enabled {
		state = "Enabled"
	}
	_, err := i.run(ctx,
		"network", "front-door", "waf-policy", "managed-rules", "override", "add",
		"--resource-group", strings.TrimSpace(resourceGroup),
		"--policy-name", strings.TrimSpace(policyName),
		"--type", strings.TrimSpace(ruleSetType),
		"--version", strings.TrimSpace(ruleSetVersion),
		"--group-name", strings.TrimSpace(ruleGroupName),
		"--rule-id", strings.TrimSpace(ruleID),
		"--enabled-state", state,
		"--output", "none",
		"--only-show-errors",
	)
	return err
}

// AddWafExclusion adds a managed-rule exclusion to a policy.
func (i *Inventory) AddWafExclusion(
	ctx context.Context,
	profile models.ProfileSummary,
	resourceGroup string,
	policyName string,
	exclusion models.AzureWafExclusion,
) error {
	if isLocalFlociProfile(profile) {
		return errWafConfigLocalUnsupported
	}
	_, err := i.run(ctx,
		"network", "front-door", "waf-policy", "managed-rules", "exclusion", "add",
		"--resource-group", strings.TrimSpace(resourceGroup),
		"--policy-name", strings.TrimSpace(policyName),
		"--match-variable", strings.TrimSpace(exclusion.MatchVariable),
		"--selector-match-operator", strings.TrimSpace(exclusion.SelectorMatchOperator),
		"--selector", strings.TrimSpace(exclusion.Selector),
		"--output", "none",
		"--only-show-errors",
	)
	return err
}

// RemoveWafExclusion removes a managed-rule exclusion from a policy.
func (i *Inventory) RemoveWafExclusion(
	ctx context.Context,
	profile models.ProfileSummary,
	resourceGroup string,
	policyName string,
	exclusion models.AzureWafExclusion,
) error {
	if isLocalFlociProfile(profile) {
		return errWafConfigLocalUnsupported
	}
	_, err := i.run(ctx,
		"network", "front-door", "waf-policy", "managed-rules", "exclusion", "remove",
		"--resource-group", strings.TrimSpace(resourceGroup),
		"--policy-name", strings.TrimSpace(policyName),
		"--match-variable", strings.TrimSpace(exclusion.MatchVariable),
		"--selector-match-operator", strings.TrimSpace(exclusion.SelectorMatchOperator),
		"--selector", strings.TrimSpace(exclusion.Selector),
		"--output", "none",
		"--only-show-errors",
	)
	return err
}

func decodeWafPolicyDetail(payload []byte, resourceGroup string) (models.AzureWafPolicyDetail, error) {
	var decoded struct {
		Name     string `json:"name"`
		Location string `json:"location"`
		SKU      struct {
			Name string `json:"name"`
		} `json:"sku"`
		Properties struct {
			PolicySettings struct {
				Mode                  string `json:"mode"`
				EnabledState          string `json:"enabledState"`
				RequestBodyCheck      string `json:"requestBodyCheck"`
				RedirectURL           string `json:"redirectUrl"`
				CustomBlockStatusCode int    `json:"customBlockResponseStatusCode"`
			} `json:"policySettings"`
			ManagedRules struct {
				ManagedRuleSets []struct {
					RuleSetType    string `json:"ruleSetType"`
					RuleSetVersion string `json:"ruleSetVersion"`
					RuleSetAction  string `json:"ruleSetAction"`
					RuleGroupOverrides []struct {
						RuleGroupName string `json:"ruleGroupName"`
						Rules []struct {
							RuleID       string `json:"ruleId"`
							EnabledState string `json:"enabledState"`
							Action       string `json:"action"`
						} `json:"rules"`
					} `json:"ruleGroupOverrides"`
				} `json:"managedRuleSets"`
				Exclusions []struct {
					MatchVariable         string `json:"matchVariable"`
					SelectorMatchOperator string `json:"selectorMatchOperator"`
					Selector              string `json:"selector"`
				} `json:"exclusions"`
			} `json:"managedRules"`
			CustomRules struct {
				Rules []struct {
					Name     string `json:"name"`
					Priority int    `json:"priority"`
					RuleType string `json:"ruleType"`
					Action   string `json:"action"`
					EnabledState string `json:"enabledState"`
				} `json:"rules"`
			} `json:"customRules"`
		} `json:"properties"`
	}
	if err := json.Unmarshal(payload, &decoded); err != nil {
		return models.AzureWafPolicyDetail{}, fmt.Errorf("decode waf policy: %w", err)
	}

	detail := models.AzureWafPolicyDetail{
		Name:                  decoded.Name,
		ResourceGroup:         resourceGroup,
		Location:              decoded.Location,
		SKU:                   decoded.SKU.Name,
		Mode:                  decoded.Properties.PolicySettings.Mode,
		Enabled:               strings.EqualFold(decoded.Properties.PolicySettings.EnabledState, "Enabled"),
		RequestBodyCheck:      decoded.Properties.PolicySettings.RequestBodyCheck,
		RedirectURL:           decoded.Properties.PolicySettings.RedirectURL,
		CustomBlockStatusCode: decoded.Properties.PolicySettings.CustomBlockStatusCode,
		ManagedRuleSets:       []models.AzureWafManagedRuleGroup{},
		ManagedRuleOverrides:  []models.AzureWafManagedRuleOverride{},
		Exclusions:            []models.AzureWafExclusion{},
		CustomRules:           []models.AzureWafCustomRule{},
	}
	for _, ruleSet := range decoded.Properties.ManagedRules.ManagedRuleSets {
		detail.ManagedRuleSets = append(detail.ManagedRuleSets, models.AzureWafManagedRuleGroup{
			RuleSetType:    ruleSet.RuleSetType,
			RuleSetVersion: ruleSet.RuleSetVersion,
			RuleSetAction:  ruleSet.RuleSetAction,
		})
		for _, group := range ruleSet.RuleGroupOverrides {
			for _, rule := range group.Rules {
				detail.ManagedRuleOverrides = append(detail.ManagedRuleOverrides, models.AzureWafManagedRuleOverride{
					RuleID:        rule.RuleID,
					RuleGroupName: group.RuleGroupName,
					Enabled:       strings.EqualFold(rule.EnabledState, "Enabled"),
					Action:        rule.Action,
				})
			}
		}
	}
	for _, exclusion := range decoded.Properties.ManagedRules.Exclusions {
		detail.Exclusions = append(detail.Exclusions, models.AzureWafExclusion{
			MatchVariable:         exclusion.MatchVariable,
			SelectorMatchOperator: exclusion.SelectorMatchOperator,
			Selector:              exclusion.Selector,
		})
	}
	for _, rule := range decoded.Properties.CustomRules.Rules {
		detail.CustomRules = append(detail.CustomRules, models.AzureWafCustomRule{
			Name:     rule.Name,
			Priority: rule.Priority,
			RuleType: rule.RuleType,
			Action:   rule.Action,
			Enabled:  strings.EqualFold(rule.EnabledState, "Enabled"),
		})
	}
	return detail, nil
}