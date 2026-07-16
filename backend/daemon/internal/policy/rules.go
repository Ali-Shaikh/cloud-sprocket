// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package policy

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

const (
	publicS3RuleID        = "aws.s3.public-access"
	openManagementRuleID  = "aws.network.open-management-port"
	iamWildcardRuleID     = "aws.iam.wildcard-action"
	requiredTagRuleID     = "cloud.tags.required"
	regionAllowlistRuleID = "cloud.region.allowlist"
)

var (
	iamWildcardScalar = regexp.MustCompile(`(?i)"(action|notaction)"\s*:\s*"\*"`)
	iamWildcardArray  = regexp.MustCompile(`(?i)"(action|notaction)"\s*:\s*\[[^]]*"\*"`)

	taggableTypes = map[string]struct{}{
		"aws_apigatewayv2_api":               {},
		"aws_cloudwatch_log_group":           {},
		"aws_db_instance":                    {},
		"aws_dynamodb_table":                 {},
		"aws_ecs_cluster":                    {},
		"aws_ecs_service":                    {},
		"aws_eks_cluster":                    {},
		"aws_eks_node_group":                 {},
		"aws_instance":                       {},
		"aws_kms_key":                        {},
		"aws_lambda_function":                {},
		"aws_s3_bucket":                      {},
		"aws_secretsmanager_secret":          {},
		"aws_security_group":                 {},
		"aws_sns_topic":                      {},
		"aws_sqs_queue":                      {},
		"azurerm_cosmosdb_account":           {},
		"azurerm_key_vault":                  {},
		"azurerm_linux_function_app":         {},
		"azurerm_linux_virtual_machine":      {},
		"azurerm_linux_web_app":              {},
		"azurerm_postgresql_flexible_server": {},
		"azurerm_resource_group":             {},
		"azurerm_service_plan":               {},
		"azurerm_storage_account":            {},
		"azurerm_windows_function_app":       {},
		"azurerm_windows_virtual_machine":    {},
		"azurerm_windows_web_app":            {},
	}
)

func evaluatePlan(ctx context.Context, plan map[string]any, options Options) ([]Finding, error) {
	requiredTags := sortedUnique(options.RequiredTags)
	allowedRegions := valueSet(sortedUnique(options.AllowedRegions))
	findings := make([]Finding, 0)
	seen := make(map[string]struct{})
	appendFinding := func(finding Finding) {
		key := finding.RuleID + "\x00" + finding.ResourceAddress + "\x00" + finding.Message
		if _, exists := seen[key]; exists {
			return
		}
		seen[key] = struct{}{}
		findings = append(findings, finding)
	}

	for _, rawChange := range listValue(plan["resource_changes"]) {
		if err := ctx.Err(); err != nil {
			return nil, fmt.Errorf("evaluate bundled policy: %w", err)
		}
		change := objectValue(rawChange)
		changeValues := objectValue(change["change"])
		after := objectValue(changeValues["after"])
		afterUnknown := objectValue(changeValues["after_unknown"])
		if after == nil {
			continue
		}
		address := stringValue(change["address"])
		resourceType := stringValue(change["type"])

		if publicAccess, unknownAccess := publicS3(resourceType, after, afterUnknown); publicAccess || unknownAccess {
			finding := Finding{
				RuleID: publicS3RuleID, Title: "Public S3 access",
				Message:  "The planned S3 configuration permits public access.",
				Severity: SeverityDeny, ResourceAddress: address,
			}
			if unknownAccess {
				finding.Title = "S3 public access cannot be verified"
				finding.Message = "A planned S3 public-access setting is unknown until apply."
			}
			appendFinding(finding)
		}
		if openManagementPort(resourceType, after) {
			appendFinding(Finding{
				RuleID: openManagementRuleID, Title: "Management port open to the internet",
				Message:  "The planned ingress rule exposes SSH, RDP, or WinRM to a world CIDR.",
				Severity: SeverityDeny, ResourceAddress: address,
			})
		}
		if iamWildcard(resourceType, after) {
			appendFinding(Finding{
				RuleID: iamWildcardRuleID, Title: "IAM wildcard action",
				Message:  "The planned IAM policy grants a wildcard Action or NotAction.",
				Severity: SeverityWarning, ResourceAddress: address,
			})
		}
		if _, taggable := taggableTypes[resourceType]; taggable {
			tags := objectValue(after["tags"])
			for _, required := range requiredTags {
				if strings.TrimSpace(stringValue(tags[required])) != "" {
					continue
				}
				finding := Finding{
					RuleID: requiredTagRuleID, Title: "Required tag missing",
					Message:  fmt.Sprintf("The planned resource is missing the required %s tag.", required),
					Severity: SeverityWarning, ResourceAddress: address,
				}
				if tagValueUnknown(afterUnknown["tags"], required) {
					finding.Title = "Required tag cannot be verified"
					finding.Message = fmt.Sprintf("The required %s tag is unknown until apply.", required)
				}
				appendFinding(finding)
			}
		}
		if len(allowedRegions) > 0 {
			region := stringValue(after["region"])
			if region == "" {
				region = stringValue(after["location"])
			}
			if region != "" && !allowedRegions.contains(region) {
				appendFinding(Finding{
					RuleID: regionAllowlistRuleID, Title: "Region is not allowed",
					Message:  fmt.Sprintf("The planned resource uses region or location %s, which is outside the configured allowlist.", region),
					Severity: SeverityDeny, ResourceAddress: address,
				})
			}
		}
	}

	if len(allowedRegions) > 0 {
		configuration := objectValue(plan["configuration"])
		providers := objectValue(configuration["provider_config"])
		for providerName, rawProvider := range providers {
			provider := objectValue(rawProvider)
			expressions := objectValue(provider["expressions"])
			regionExpression := objectValue(expressions["region"])
			if regionExpression == nil {
				continue
			}
			region, resolved := resolveProviderRegion(plan, regionExpression)
			if !resolved {
				appendFinding(Finding{
					RuleID: regionAllowlistRuleID, Title: "Provider region cannot be verified",
					Message:  "The planned provider region cannot be resolved to a value in the configured allowlist.",
					Severity: SeverityDeny, ResourceAddress: "provider." + providerName,
				})
			} else if !allowedRegions.contains(region) {
				appendFinding(Finding{
					RuleID: regionAllowlistRuleID, Title: "Region is not allowed",
					Message:  fmt.Sprintf("The planned provider uses region %s, which is outside the configured allowlist.", region),
					Severity: SeverityDeny, ResourceAddress: "provider." + providerName,
				})
			}
		}
	}
	return findings, nil
}

func publicS3(resourceType string, after, afterUnknown map[string]any) (bool, bool) {
	if resourceType == "aws_s3_bucket" || resourceType == "aws_s3_bucket_acl" {
		switch stringValue(after["acl"]) {
		case "public-read", "public-read-write", "authenticated-read":
			return true, false
		}
		if valueUnknown(afterUnknown["acl"]) {
			return false, true
		}
	}
	if resourceType != "aws_s3_bucket_public_access_block" {
		return false, false
	}
	unknown := false
	for _, setting := range []string{"block_public_acls", "block_public_policy", "ignore_public_acls", "restrict_public_buckets"} {
		if value, present := after[setting]; present {
			if enabled, ok := value.(bool); ok && !enabled {
				return true, false
			}
		}
		unknown = unknown || valueUnknown(afterUnknown[setting])
	}
	return false, unknown
}

func openManagementPort(resourceType string, after map[string]any) bool {
	switch resourceType {
	case "aws_security_group_rule":
		return stringValue(after["type"]) == "ingress" && worldOpen(after) && managementPort(after)
	case "aws_vpc_security_group_ingress_rule":
		return worldOpen(after) && managementPort(after)
	case "aws_security_group":
		for _, rawRule := range listValue(after["ingress"]) {
			rule := objectValue(rawRule)
			if worldOpen(rule) && managementPort(rule) {
				return true
			}
		}
	}
	return false
}

func worldOpen(rule map[string]any) bool {
	for _, field := range []string{"cidr_blocks", "ipv6_cidr_blocks"} {
		for _, rawCIDR := range listValue(rule[field]) {
			if cidr := stringValue(rawCIDR); cidr == "0.0.0.0/0" || cidr == "::/0" {
				return true
			}
		}
	}
	return stringValue(rule["cidr_ipv4"]) == "0.0.0.0/0" || stringValue(rule["cidr_ipv6"]) == "::/0"
}

func tagValueUnknown(rawTags any, required string) bool {
	if valueUnknown(rawTags) {
		return true
	}
	unknownTags := objectValue(rawTags)
	return valueUnknown(unknownTags[required])
}

func valueUnknown(raw any) bool {
	unknown, _ := raw.(bool)
	return unknown
}

func resolveProviderRegion(plan map[string]any, expression map[string]any) (string, bool) {
	if value := stringValue(expression["constant_value"]); value != "" {
		return value, true
	}
	variables := objectValue(plan["variables"])
	for _, rawReference := range listValue(expression["references"]) {
		reference := stringValue(rawReference)
		if !strings.HasPrefix(reference, "var.") {
			continue
		}
		name := strings.TrimPrefix(reference, "var.")
		if dot := strings.IndexByte(name, '.'); dot >= 0 {
			name = name[:dot]
		}
		value := stringValue(objectValue(variables[name])["value"])
		if value != "" {
			return value, true
		}
	}
	return "", false
}

func managementPort(rule map[string]any) bool {
	protocol := stringValue(rule["protocol"])
	if protocol == "" {
		protocol = stringValue(rule["ip_protocol"])
	}
	if protocol == "-1" || strings.EqualFold(protocol, "all") {
		return true
	}
	from, fromOK := numberValue(rule["from_port"])
	if !fromOK {
		return false
	}
	to, toOK := numberValue(rule["to_port"])
	if !toOK {
		to = from
	}
	for _, port := range []float64{22, 3389, 5985, 5986} {
		if from <= port && to >= port {
			return true
		}
	}
	return false
}

func iamWildcard(resourceType string, after map[string]any) bool {
	var text string
	switch resourceType {
	case "aws_iam_policy", "aws_iam_role_policy", "aws_iam_user_policy", "aws_iam_group_policy":
		text = stringValue(after["policy"])
	case "aws_iam_role":
		text = stringValue(after["assume_role_policy"])
	}
	if text == "" {
		return false
	}
	var document any
	if json.Unmarshal([]byte(text), &document) == nil && containsIAMWildcard(document) {
		return true
	}
	return iamWildcardScalar.MatchString(text) || iamWildcardArray.MatchString(text)
}

func containsIAMWildcard(value any) bool {
	switch typed := value.(type) {
	case map[string]any:
		for key, child := range typed {
			if strings.EqualFold(key, "Action") || strings.EqualFold(key, "NotAction") {
				if stringValue(child) == "*" {
					return true
				}
				for _, item := range listValue(child) {
					if stringValue(item) == "*" {
						return true
					}
				}
			}
			if containsIAMWildcard(child) {
				return true
			}
		}
	case []any:
		for _, child := range typed {
			if containsIAMWildcard(child) {
				return true
			}
		}
	}
	return false
}

type stringSet map[string]struct{}

func valueSet(values []string) stringSet {
	result := make(stringSet, len(values))
	for _, value := range values {
		result[value] = struct{}{}
	}
	return result
}

func (set stringSet) contains(value string) bool {
	_, ok := set[value]
	return ok
}

func objectValue(value any) map[string]any {
	result, _ := value.(map[string]any)
	return result
}

func listValue(value any) []any {
	if result, ok := value.([]any); ok {
		return result
	}
	return nil
}

func stringValue(value any) string {
	switch typed := value.(type) {
	case string:
		return typed
	case json.Number:
		return typed.String()
	case float64:
		return strconv.FormatFloat(typed, 'f', -1, 64)
	case float32:
		return strconv.FormatFloat(float64(typed), 'f', -1, 32)
	case int:
		return strconv.Itoa(typed)
	case int64:
		return strconv.FormatInt(typed, 10)
	case bool:
		return strconv.FormatBool(typed)
	default:
		return ""
	}
}

func numberValue(value any) (float64, bool) {
	switch typed := value.(type) {
	case float64:
		return typed, true
	case float32:
		return float64(typed), true
	case int:
		return float64(typed), true
	case int64:
		return float64(typed), true
	case json.Number:
		result, err := typed.Float64()
		return result, err == nil
	default:
		return 0, false
	}
}
