package azureadapter

import (
	"context"
	"strings"
	"testing"

	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/models"
)

func TestListWafPoliciesSkipsShowWhenDetailDisabled(t *testing.T) {
	fake := &fakeCLI{
		out: []byte(`[{"name":"waf-portal","resourceGroup":"rg-prod","location":"westeurope"}]`),
	}
	inv := NewInventory(config.Settings{})
	inv.runner = fake

	policies, err := inv.ListWafPolicies(context.Background(), cloudAzureProfile(), false)
	if err != nil {
		t.Fatalf("ListWafPolicies: %v", err)
	}
	if len(policies) != 1 || policies[0].Name != "waf-portal" {
		t.Fatalf("unexpected policies: %+v", policies)
	}
	joined := strings.Join(fake.args, " ")
	if strings.Contains(joined, "waf-policy show") {
		t.Fatalf("lightweight list should not call show, got %q", joined)
	}
	if !strings.Contains(joined, "resource list") {
		t.Fatalf("expected resource list call, got %q", joined)
	}
}

func TestListWafPoliciesLoadsDetailWhenRequested(t *testing.T) {
	listOut := []byte(`[{"name":"waf-portal","resourceGroup":"rg-prod","location":"westeurope"}]`)
	showOut := []byte(`{
		"name":"waf-portal",
		"location":"westeurope",
		"sku":{"name":"Premium_AzureFrontDoor"},
		"properties":{"policySettings":{"mode":"Prevention","enabledState":"Enabled"}}
	}`)
	fake := &recordingCLI{
		responses: map[string][]byte{
			"resource list": listOut,
			"waf-policy show": showOut,
		},
	}
	inv := NewInventory(config.Settings{})
	inv.runner = fake

	policies, err := inv.ListWafPolicies(context.Background(), cloudAzureProfile(), true)
	if err != nil {
		t.Fatalf("ListWafPolicies: %v", err)
	}
	if len(policies) != 1 {
		t.Fatalf("policies = %+v", policies)
	}
	if policies[0].Mode != "Prevention" || policies[0].SKU != "Premium_AzureFrontDoor" {
		t.Fatalf("expected enriched summary, got %+v", policies[0])
	}
	if fake.showCalls != 1 {
		t.Fatalf("show calls = %d, want 1", fake.showCalls)
	}
}

func TestDecodeWafPolicyDetailIncludesDefaultManagedRuleSet(t *testing.T) {
	payload := []byte(`{
		"name":"waf-portal",
		"location":"westeurope",
		"sku":{"name":"Premium_AzureFrontDoor"},
		"properties":{
			"policySettings":{"mode":"Prevention","enabledState":"Enabled"},
			"managedRules":{
				"managedRuleSets":[
					{
						"ruleSetType":"Microsoft_DefaultRuleSet",
						"ruleSetVersion":"2.1",
						"ruleSetAction":"Block"
					}
				]
			}
		}
	}`)
	detail, err := decodeWafPolicyDetail(payload, "rg-prod")
	if err != nil {
		t.Fatalf("decodeWafPolicyDetail: %v", err)
	}
	if len(detail.ManagedRuleSets) != 1 {
		t.Fatalf("managed rule sets = %+v", detail.ManagedRuleSets)
	}
	set := detail.ManagedRuleSets[0]
	if set.RuleSetType != "Microsoft_DefaultRuleSet" || set.RuleSetVersion != "2.1" {
		t.Fatalf("unexpected rule set: %+v", set)
	}
	if set.RuleSetAction != "Block" {
		t.Fatalf("ruleSetAction = %q, want Block", set.RuleSetAction)
	}
}

func TestDecodeWafPolicyDetailTagsExclusionsWithRuleSetType(t *testing.T) {
	payload := []byte(`{
		"name":"waf-portal",
		"properties":{
			"managedRules":{
				"managedRuleSets":[
					{
						"ruleSetType":"Microsoft_DefaultRuleSet",
						"ruleSetVersion":"2.1",
						"exclusions":[
							{"matchVariable":"RequestHeaderNames","selectorMatchOperator":"Equals","selector":"User-Agent"}
						]
					}
				]
			}
		}
	}`)
	detail, err := decodeWafPolicyDetail(payload, "rg-prod")
	if err != nil {
		t.Fatalf("decodeWafPolicyDetail: %v", err)
	}
	if len(detail.Exclusions) != 1 {
		t.Fatalf("exclusions = %+v", detail.Exclusions)
	}
	if detail.Exclusions[0].RuleSetType != "Microsoft_DefaultRuleSet" {
		t.Fatalf("exclusion ruleSetType = %q, want Microsoft_DefaultRuleSet", detail.Exclusions[0].RuleSetType)
	}
}

func TestUpdateWafPolicyModeBuildsExpectedArgs(t *testing.T) {
	fake := &fakeCLI{}
	inv := NewInventory(config.Settings{})
	inv.runner = fake

	if err := inv.UpdateWafPolicyMode(context.Background(), cloudAzureProfile(), "rg-prod", "waf-portal", "Detection"); err != nil {
		t.Fatalf("UpdateWafPolicyMode: %v", err)
	}
	expectCLIArgsContain(t, fake.args,
		"network", "front-door", "waf-policy", "update",
		"--resource-group", "rg-prod",
		"--policy-name", "waf-portal",
		"--mode", "Detection",
	)
}

func TestSetWafManagedRuleOverrideBuildsExpectedArgs(t *testing.T) {
	fake := &fakeCLI{}
	inv := NewInventory(config.Settings{})
	inv.runner = fake

	err := inv.SetWafManagedRuleOverride(
		context.Background(),
		cloudAzureProfile(),
		"rg-prod",
		"waf-portal",
		"Microsoft_DefaultRuleSet",
		"2.1",
		"SQLI",
		"942100",
		false,
	)
	if err != nil {
		t.Fatalf("SetWafManagedRuleOverride: %v", err)
	}
	expectCLIArgsContain(t, fake.args,
		"network", "front-door", "waf-policy", "managed-rules", "override", "add",
		"--resource-group", "rg-prod",
		"--policy-name", "waf-portal",
		"--type", "Microsoft_DefaultRuleSet",
		"--rule-group-id", "SQLI",
		"--rule-id", "942100",
		"--disabled", "true",
	)
	if joined := strings.Join(fake.args, " "); strings.Contains(joined, "--enabled-state") ||
		strings.Contains(joined, "--group-name") || strings.Contains(joined, "--version") {
		t.Fatalf("override add used a non-existent flag: %q", joined)
	}
}

func TestRemoveWafExclusionBuildsExpectedArgs(t *testing.T) {
	fake := &fakeCLI{}
	inv := NewInventory(config.Settings{})
	inv.runner = fake

	err := inv.RemoveWafExclusion(context.Background(), cloudAzureProfile(), "rg-prod", "waf-portal", models.AzureWafExclusion{
		RuleSetType:           "Microsoft_DefaultRuleSet",
		MatchVariable:         "RequestHeaderNames",
		SelectorMatchOperator: "Equals",
		Selector:              "User-Agent",
	})
	if err != nil {
		t.Fatalf("RemoveWafExclusion: %v", err)
	}
	expectCLIArgsContain(t, fake.args,
		"network", "front-door", "waf-policy", "managed-rules", "exclusion", "remove",
		"--resource-group", "rg-prod",
		"--policy-name", "waf-portal",
		"--type", "Microsoft_DefaultRuleSet",
		"--match-variable", "RequestHeaderNames",
		"--operator", "Equals",
		"--value", "User-Agent",
	)
}

func TestAddWafExclusionBuildsExpectedArgs(t *testing.T) {
	fake := &fakeCLI{}
	inv := NewInventory(config.Settings{})
	inv.runner = fake

	err := inv.AddWafExclusion(context.Background(), cloudAzureProfile(), "rg-prod", "waf-portal", models.AzureWafExclusion{
		RuleSetType:           "Microsoft_DefaultRuleSet",
		MatchVariable:         "RequestHeaderNames",
		SelectorMatchOperator: "Equals",
		Selector:              "User-Agent",
	})
	if err != nil {
		t.Fatalf("AddWafExclusion: %v", err)
	}
	expectCLIArgsContain(t, fake.args,
		"network", "front-door", "waf-policy", "managed-rules", "exclusion", "add",
		"--resource-group", "rg-prod",
		"--policy-name", "waf-portal",
		"--type", "Microsoft_DefaultRuleSet",
		"--match-variable", "RequestHeaderNames",
		"--operator", "Equals",
		"--value", "User-Agent",
	)
	if joined := strings.Join(fake.args, " "); strings.Contains(joined, "--selector-match-operator") ||
		strings.Contains(joined, "--selector ") {
		t.Fatalf("exclusion add used a non-existent flag: %q", joined)
	}
}

type recordingCLI struct {
	responses map[string][]byte
	showCalls int
}

func (r *recordingCLI) CommandContext(_ context.Context, _ string, args ...string) ([]byte, error) {
	joined := strings.Join(args, " ")
	switch {
	case strings.Contains(joined, "waf-policy show"):
		r.showCalls++
		return r.responses["waf-policy show"], nil
	default:
		return r.responses["resource list"], nil
	}
}

func expectCLIArgsContain(t *testing.T, got []string, want ...string) {
	t.Helper()
	joined := strings.Join(got, " ")
	for i := 0; i < len(want); i++ {
		needle := want[i]
		if !strings.Contains(joined, needle) {
			t.Fatalf("args missing %q in %#v", needle, got)
		}
	}
}