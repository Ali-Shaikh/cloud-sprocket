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

// S3Deps supplies object access for S3 verification checks.
type S3Deps struct {
	HeadObject func(ctx context.Context, profile models.ProfileSummary, bucket, key string) ([]models.DetailField, error)
	GetObject  func(ctx context.Context, profile models.ProfileSummary, bucket, key string) (string, error)
}

// S3ObjectCheck verifies an object exists and optionally that its body contains text.
type S3ObjectCheck struct {
	Deps S3Deps
}

func (c *S3ObjectCheck) Type() string {
	return recipes.LabVerifyS3Object
}

func (c *S3ObjectCheck) Run(
	ctx context.Context,
	verify recipes.LabVerify,
	checkCtx labs.CheckContext,
) (labs.VerifyResult, error) {
	result := labs.VerifyResult{Type: c.Type()}
	bucket := strings.TrimSpace(labs.ResolveTemplate(verify.Bucket, checkCtx.Deployment))
	key := strings.TrimSpace(labs.ResolveTemplate(verify.Key, checkCtx.Deployment))
	contains := labs.ResolveTemplate(verify.Contains, checkCtx.Deployment)
	if bucket == "" || key == "" {
		result.Passed = false
		result.Message = "Bucket and key are required for this verification."
		return result, nil
	}
	if c.Deps.HeadObject == nil {
		return result, fmt.Errorf("S3 head dependency is not configured")
	}

	if _, err := c.Deps.HeadObject(ctx, checkCtx.Profile, bucket, key); err != nil {
		result.Passed = false
		result.Message = "Object was not found."
		result.Detail = err.Error()
		return result, nil
	}

	if strings.TrimSpace(contains) == "" {
		result.Passed = true
		result.Message = "Object exists."
		result.Detail = fmt.Sprintf("s3://%s/%s", bucket, key)
		return result, nil
	}
	if c.Deps.GetObject == nil {
		return result, fmt.Errorf("S3 get dependency is not configured")
	}
	body, err := c.Deps.GetObject(ctx, checkCtx.Profile, bucket, key)
	if err != nil {
		result.Passed = false
		result.Message = "Could not read the object body."
		result.Detail = err.Error()
		return result, nil
	}
	if strings.Contains(body, contains) {
		result.Passed = true
		result.Message = "Object body contains the expected text."
		result.Detail = fmt.Sprintf("s3://%s/%s contains %q", bucket, key, contains)
		return result, nil
	}
	result.Passed = false
	result.Message = "Object body does not contain the expected text."
	result.Detail = fmt.Sprintf("s3://%s/%s missing %q", bucket, key, contains)
	return result, nil
}
