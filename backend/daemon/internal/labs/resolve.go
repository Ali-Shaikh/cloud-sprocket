// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package labs

import (
	"fmt"
	"regexp"
	"strings"

	"cloudsprocket/backend/daemon/internal/deploy"
)

var (
	outputTemplatePattern = regexp.MustCompile(`\{\{\s*outputs\.([a-zA-Z0-9_]+)\s*\}\}`)
	varsTemplatePattern   = regexp.MustCompile(`\{\{\s*vars\.([a-zA-Z0-9_]+)\s*\}\}`)
)

// ResolveTemplate substitutes {{ outputs.* }} and {{ vars.* }} placeholders in value
// using the deployment record. Unrecognised placeholders are left unchanged.
func ResolveTemplate(value string, deployment *deploy.Deployment) string {
	if value == "" || deployment == nil {
		return value
	}
	resolved := outputTemplatePattern.ReplaceAllStringFunc(value, func(match string) string {
		submatches := outputTemplatePattern.FindStringSubmatch(match)
		if len(submatches) < 2 {
			return match
		}
		name := strings.TrimSpace(submatches[1])
		if outputValue, ok := deploymentOutputValue(deployment, name); ok {
			return outputValue
		}
		return match
	})
	resolved = varsTemplatePattern.ReplaceAllStringFunc(resolved, func(match string) string {
		submatches := varsTemplatePattern.FindStringSubmatch(match)
		if len(submatches) < 2 {
			return match
		}
		name := strings.TrimSpace(submatches[1])
		if variableValue, ok := deploymentVariableValue(deployment, name); ok {
			return variableValue
		}
		return match
	})
	return resolved
}

// ResolveTemplateMap resolves every value in a string map.
func ResolveTemplateMap(values map[string]string, deployment *deploy.Deployment) map[string]string {
	if len(values) == 0 {
		return map[string]string{}
	}
	resolved := make(map[string]string, len(values))
	for key, value := range values {
		resolved[key] = ResolveTemplate(value, deployment)
	}
	return resolved
}

func deploymentOutputValue(deployment *deploy.Deployment, name string) (string, bool) {
	for _, output := range deployment.Outputs {
		if output.Name != name {
			continue
		}
		return stringifyOutputValue(output.Value), true
	}
	return "", false
}

func deploymentVariableValue(deployment *deploy.Deployment, name string) (string, bool) {
	if deployment.Variables == nil {
		return "", false
	}
	value, ok := deployment.Variables[name]
	if !ok {
		return "", false
	}
	return stringifyOutputValue(value), true
}

func stringifyOutputValue(value any) string {
	switch typed := value.(type) {
	case nil:
		return ""
	case string:
		return typed
	case fmt.Stringer:
		return typed.String()
	default:
		return fmt.Sprint(typed)
	}
}