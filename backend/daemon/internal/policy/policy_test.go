// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package policy

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"
)

func TestEvaluateBlocksLiveHighSeverityFindings(t *testing.T) {
	plan := testPlan(t, []map[string]any{
		resourceChange("aws_s3_bucket_acl.site", "aws_s3_bucket_acl", map[string]any{"acl": "public-read"}),
		resourceChange("aws_security_group_rule.ssh", "aws_security_group_rule", map[string]any{
			"type": "ingress", "from_port": 22, "to_port": 22, "protocol": "tcp", "cidr_blocks": []string{"0.0.0.0/0"},
		}),
	})

	got, err := Evaluate(context.Background(), plan, Options{
		PlanDigest:  "sha256:plan",
		EvaluatedAt: time.Date(2026, 7, 16, 8, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("Evaluate: %v", err)
	}
	if got.Status != StatusBlocked || got.BlockingCount != 2 {
		t.Fatalf("expected two live blockers, got status=%s blockers=%d findings=%+v", got.Status, got.BlockingCount, got.Findings)
	}
	if len(got.Findings) != 2 || got.Findings[0].RuleID != "aws.network.open-management-port" || got.Findings[1].RuleID != "aws.s3.public-access" {
		t.Fatalf("expected deterministic deny findings, got %+v", got.Findings)
	}
}

func TestEvaluateLocalTargetWarnsInsteadOfBlocking(t *testing.T) {
	plan := testPlan(t, []map[string]any{
		resourceChange("aws_s3_bucket_acl.site", "aws_s3_bucket_acl", map[string]any{"acl": "public-read"}),
	})
	got, err := Evaluate(context.Background(), plan, Options{Local: true, PlanDigest: "sha256:plan"})
	if err != nil {
		t.Fatalf("Evaluate: %v", err)
	}
	if got.Status != StatusWarned || got.BlockingCount != 0 {
		t.Fatalf("expected a local warning, got status=%s blockers=%d", got.Status, got.BlockingCount)
	}
}

func TestEvaluateWarnsForIAMWildcardAndMissingTags(t *testing.T) {
	plan := testPlan(t, []map[string]any{
		resourceChange("aws_iam_policy.worker", "aws_iam_policy", map[string]any{
			"policy": `{"Version":"2012-10-17","Statement":[{"Action":"*","Resource":"*","Effect":"Allow"}]}`,
		}),
		resourceChange("aws_lambda_function.worker", "aws_lambda_function", map[string]any{
			"tags": map[string]any{"Environment": "prod"},
		}),
	})
	got, err := Evaluate(context.Background(), plan, Options{
		PlanDigest:   "sha256:plan",
		RequiredTags: []string{"Environment", "ManagedBy"},
	})
	if err != nil {
		t.Fatalf("Evaluate: %v", err)
	}
	if got.Status != StatusWarned || got.BlockingCount != 0 || len(got.Findings) != 2 {
		t.Fatalf("expected two warnings, got %+v", got)
	}
}

func TestEvaluateRegionAllowlist(t *testing.T) {
	plan := testPlan(t, []map[string]any{
		resourceChange("azurerm_resource_group.main", "azurerm_resource_group", map[string]any{
			"location": "westeurope", "tags": map[string]any{"Environment": "prod", "ManagedBy": "CloudSprocket"},
		}),
	})
	got, err := Evaluate(context.Background(), plan, Options{
		PlanDigest:     "sha256:plan",
		AllowedRegions: []string{"northeurope"},
	})
	if err != nil {
		t.Fatalf("Evaluate: %v", err)
	}
	if got.Status != StatusBlocked || got.BlockingCount != 1 || got.Findings[0].RuleID != "cloud.region.allowlist" {
		t.Fatalf("expected region blocker, got %+v", got)
	}
}

func TestEvaluateBundledRuleVariants(t *testing.T) {
	plan := testPlan(t, []map[string]any{
		resourceChange("aws_s3_bucket_public_access_block.site", "aws_s3_bucket_public_access_block", map[string]any{
			"block_public_acls": true, "block_public_policy": false,
		}),
		resourceChange("aws_vpc_security_group_ingress_rule.winrm", "aws_vpc_security_group_ingress_rule", map[string]any{
			"ip_protocol": "-1", "ipv6_cidr_blocks": []string{"::/0"},
		}),
		resourceChange("aws_security_group.admin", "aws_security_group", map[string]any{
			"ingress": []map[string]any{{
				"from_port": 3389, "to_port": 3389, "protocol": "tcp", "cidr_blocks": []string{"0.0.0.0/0"},
			}},
		}),
		resourceChange("aws_iam_role.worker", "aws_iam_role", map[string]any{
			"assume_role_policy": `{"Statement":[{"NotAction":["sts:GetCallerIdentity","*"]}]}`,
		}),
	})

	got, err := Evaluate(context.Background(), plan, Options{PlanDigest: "sha256:plan"})
	if err != nil {
		t.Fatalf("Evaluate: %v", err)
	}
	if got.Status != StatusBlocked || got.BlockingCount != 3 || len(got.Findings) != 4 {
		t.Fatalf("expected three blockers and one warning, got %+v", got)
	}
}

func TestEvaluateProviderRegionAllowlist(t *testing.T) {
	raw, err := json.Marshal(map[string]any{
		"format_version": "1.0",
		"configuration": map[string]any{
			"provider_config": map[string]any{
				"aws": map[string]any{
					"expressions": map[string]any{"region": map[string]any{"constant_value": "eu-west-1"}},
				},
			},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	got, err := Evaluate(context.Background(), raw, Options{AllowedRegions: []string{"eu-west-2"}})
	if err != nil {
		t.Fatalf("Evaluate: %v", err)
	}
	if got.Status != StatusBlocked || len(got.Findings) != 1 || got.Findings[0].ResourceAddress != "provider.aws" {
		t.Fatalf("expected provider region blocker, got %+v", got)
	}
}

func TestEvaluateResolvesProviderRegionVariable(t *testing.T) {
	raw, err := json.Marshal(map[string]any{
		"format_version": "1.0",
		"variables":      map[string]any{"aws_region": map[string]any{"value": "eu-west-2"}},
		"configuration": map[string]any{
			"provider_config": map[string]any{
				"aws": map[string]any{
					"expressions": map[string]any{"region": map[string]any{"references": []string{"var.aws_region"}}},
				},
			},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	got, err := Evaluate(context.Background(), raw, Options{AllowedRegions: []string{"eu-west-2"}})
	if err != nil {
		t.Fatalf("Evaluate: %v", err)
	}
	if got.Status != StatusPassed {
		t.Fatalf("expected resolved provider region to pass, got %+v", got)
	}
}

func TestEvaluateBlocksUnresolvedProviderRegion(t *testing.T) {
	raw := []byte(`{
		"format_version":"1.0",
		"configuration":{"provider_config":{"aws":{"expressions":{"region":{"references":["local.aws_region"]}}}}}
	}`)
	got, err := Evaluate(context.Background(), raw, Options{AllowedRegions: []string{"eu-west-2"}})
	if err != nil {
		t.Fatalf("Evaluate: %v", err)
	}
	if got.Status != StatusBlocked || len(got.Findings) != 1 || got.Findings[0].Title != "Provider region cannot be verified" {
		t.Fatalf("expected unresolved provider region blocker, got %+v", got)
	}
}

func TestEvaluateHonoursCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err := Evaluate(ctx, []byte(`{"format_version":"1.0"}`), Options{})
	if err == nil || !strings.Contains(err.Error(), "context canceled") {
		t.Fatalf("expected cancellation error, got %v", err)
	}
}

func TestOverrideIsBoundToDecisionDigest(t *testing.T) {
	evaluation := Evaluation{
		Status:         StatusBlocked,
		DecisionDigest: "sha256:decision-one",
		BlockingCount:  1,
		Findings:       []Finding{{RuleID: "aws.s3.public-access", Severity: SeverityDeny, ResourceAddress: "aws_s3_bucket.site"}},
	}
	evaluation.AcceptOverride(time.Date(2026, 7, 16, 8, 0, 0, 0, time.UTC))
	if !evaluation.HasValidOverride() {
		t.Fatal("expected override to match the accepted decision")
	}
	evaluation.DecisionDigest = "sha256:decision-two"
	if evaluation.HasValidOverride() {
		t.Fatal("expected changed decision to invalidate override")
	}
}

func TestDecisionDigestIncludesPolicyConfiguration(t *testing.T) {
	plan := testPlan(t, []map[string]any{
		resourceChange("azurerm_resource_group.main", "azurerm_resource_group", map[string]any{"location": "westeurope"}),
	})
	first, err := Evaluate(context.Background(), plan, Options{PlanDigest: "sha256:plan", AllowedRegions: []string{"northeurope"}})
	if err != nil {
		t.Fatalf("first Evaluate: %v", err)
	}
	second, err := Evaluate(context.Background(), plan, Options{PlanDigest: "sha256:plan", AllowedRegions: []string{"uaenorth"}})
	if err != nil {
		t.Fatalf("second Evaluate: %v", err)
	}
	if first.DecisionDigest == second.DecisionDigest {
		t.Fatal("expected changed policy configuration to invalidate the decision digest")
	}
}

func TestEvaluateRejectsUnsupportedPlanJSONMajor(t *testing.T) {
	_, err := Evaluate(context.Background(), []byte(`{"format_version":"2.0","resource_changes":[]}`), Options{})
	if err == nil || !strings.Contains(err.Error(), "unsupported OpenTofu plan JSON") {
		t.Fatalf("expected unsupported major error, got %v", err)
	}
}

func testPlan(t *testing.T, changes []map[string]any) []byte {
	t.Helper()
	raw, err := json.Marshal(map[string]any{
		"format_version":   "1.0",
		"resource_changes": changes,
	})
	if err != nil {
		t.Fatal(err)
	}
	return raw
}

func resourceChange(address, resourceType string, after map[string]any) map[string]any {
	return map[string]any{
		"address": address,
		"type":    resourceType,
		"change": map[string]any{
			"actions": []string{"create"},
			"after":   after,
		},
	}
}
