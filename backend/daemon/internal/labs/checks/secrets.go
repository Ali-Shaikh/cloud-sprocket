// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package checks

import (
	"context"
	"fmt"
	"strings"

	"cloudsprocket/backend/daemon/internal/labs"
	"cloudsprocket/backend/daemon/internal/models"
	"cloudsprocket/backend/daemon/internal/recipes"
)

// SecretsDeps supplies secret reveal for secrets verification checks.
type SecretsDeps struct {
	GetSecretValue func(ctx context.Context, profile models.ProfileSummary, region, secretID string) (string, error)
}

// SecretsValueCheck verifies a secret value equals or contains expected text.
// Callers should gate this check behind write/read policy in the UI; the
// adapter reveal itself is the existing secrets.reveal path.
type SecretsValueCheck struct {
	Deps SecretsDeps
}

func (c *SecretsValueCheck) Type() string {
	return recipes.LabVerifySecretsValue
}

func (c *SecretsValueCheck) Run(
	ctx context.Context,
	verify recipes.LabVerify,
	checkCtx labs.CheckContext,
) (labs.VerifyResult, error) {
	result := labs.VerifyResult{Type: c.Type()}
	secretID := strings.TrimSpace(labs.ResolveTemplate(verify.Secret, checkCtx.Deployment))
	expected := labs.ResolveTemplate(verify.Value, checkCtx.Deployment)
	contains := labs.ResolveTemplate(verify.Contains, checkCtx.Deployment)
	if secretID == "" {
		result.Passed = false
		result.Message = "Secret id is required for this verification."
		return result, nil
	}
	// Secret reveal is write-gated in the workspace (aws.secrets.reveal).
	if !checkCtx.AWSWritesEnabled {
		result.Passed = false
		result.Message = "Secret value verification requires write mode to be enabled."
		result.Detail = "Turn on write mode from the top bar, then re-run verify."
		return result, nil
	}
	if c.Deps.GetSecretValue == nil {
		return result, fmt.Errorf("secrets get dependency is not configured")
	}

	expected = strings.TrimSpace(expected)
	contains = strings.TrimSpace(contains)
	// Avoid strings.Contains(any, "") always matching when both criteria resolve empty
	// (e.g. {{ vars.secret_value }} missing from the deployment).
	if expected == "" && contains == "" {
		result.Passed = false
		result.Message = "Secret verification needs a non-empty value or contains criterion."
		result.Detail = "Resolved value and contains are both empty after template substitution."
		return result, nil
	}

	value, err := c.Deps.GetSecretValue(ctx, checkCtx.Profile, checkCtx.Region, secretID)
	if err != nil {
		result.Passed = false
		result.Message = "Could not read the secret value."
		result.Detail = err.Error()
		return result, nil
	}
	if expected != "" {
		if value == expected {
			result.Passed = true
			result.Message = "Secret value matches."
			result.Detail = "exact match"
			return result, nil
		}
		result.Passed = false
		result.Message = "Secret value does not match."
		result.Detail = "exact match failed"
		return result, nil
	}
	if strings.Contains(value, contains) {
		result.Passed = true
		result.Message = "Secret value contains the expected text."
		result.Detail = fmt.Sprintf("contains %q", contains)
		return result, nil
	}
	result.Passed = false
	result.Message = "Secret value does not contain the expected text."
	result.Detail = fmt.Sprintf("missing %q", contains)
	return result, nil
}
