// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package checks

import (
	"context"
	"fmt"
	"strconv"
	"strings"

	"cloudsprocket/backend/daemon/internal/labs"
	"cloudsprocket/backend/daemon/internal/models"
	"cloudsprocket/backend/daemon/internal/recipes"
)

// AzureBlobDeps supplies blob listing for Azure blob verification.
type AzureBlobDeps struct {
	ListBlobs func(ctx context.Context, profile models.ProfileSummary, account, container, prefix string) ([]models.AzureBlob, error)
}

// AzureBlobCheck verifies a blob exists in a container.
type AzureBlobCheck struct {
	Deps AzureBlobDeps
}

func (c *AzureBlobCheck) Type() string {
	return recipes.LabVerifyAzureBlob
}

func (c *AzureBlobCheck) Run(
	ctx context.Context,
	verify recipes.LabVerify,
	checkCtx labs.CheckContext,
) (labs.VerifyResult, error) {
	result := labs.VerifyResult{Type: c.Type()}
	account := strings.TrimSpace(labs.ResolveTemplate(verify.Account, checkCtx.Deployment))
	container := strings.TrimSpace(labs.ResolveTemplate(verify.Container, checkCtx.Deployment))
	blob := strings.TrimSpace(labs.ResolveTemplate(verify.Blob, checkCtx.Deployment))
	if account == "" || container == "" || blob == "" {
		result.Passed = false
		result.Message = "Account, container, and blob are required for this verification."
		return result, nil
	}
	if c.Deps.ListBlobs == nil {
		return result, fmt.Errorf("Azure blob list dependency is not configured")
	}

	// List with the exact blob name as prefix to keep the scan narrow.
	blobs, err := c.Deps.ListBlobs(ctx, checkCtx.Profile, account, container, blob)
	if err != nil {
		result.Passed = false
		result.Message = "Could not list blobs."
		result.Detail = err.Error()
		return result, nil
	}
	for _, entry := range blobs {
		if strings.TrimSpace(entry.Name) == blob {
			result.Passed = true
			result.Message = "Blob exists."
			result.Detail = fmt.Sprintf("%s/%s/%s", account, container, blob)
			return result, nil
		}
	}
	result.Passed = false
	result.Message = "Blob was not found."
	result.Detail = fmt.Sprintf("%s/%s/%s", account, container, blob)
	return result, nil
}

// AzureQueueDeps supplies queue depth for Azure queue verification.
type AzureQueueDeps struct {
	ApproximateCount func(ctx context.Context, profile models.ProfileSummary, account, queue string) (int64, error)
}

// AzureQueueDepthCheck compares approximate queue message count.
type AzureQueueDepthCheck struct {
	Deps AzureQueueDeps
}

func (c *AzureQueueDepthCheck) Type() string {
	return recipes.LabVerifyAzureQueueDepth
}

func (c *AzureQueueDepthCheck) Run(
	ctx context.Context,
	verify recipes.LabVerify,
	checkCtx labs.CheckContext,
) (labs.VerifyResult, error) {
	result := labs.VerifyResult{Type: c.Type()}
	account := strings.TrimSpace(labs.ResolveTemplate(verify.Account, checkCtx.Deployment))
	queue := strings.TrimSpace(labs.ResolveTemplate(verify.Queue, checkCtx.Deployment))
	if account == "" || queue == "" {
		result.Passed = false
		result.Message = "Account and queue are required for this verification."
		return result, nil
	}
	if c.Deps.ApproximateCount == nil {
		return result, fmt.Errorf("Azure queue depth dependency is not configured")
	}

	actual, err := c.Deps.ApproximateCount(ctx, checkCtx.Profile, account, queue)
	if err != nil {
		result.Passed = false
		result.Message = "Could not read queue depth."
		result.Detail = err.Error()
		return result, nil
	}
	expected, err := strconv.ParseInt(strings.TrimSpace(verify.Value), 10, 64)
	if err != nil {
		return result, fmt.Errorf("verification value %q is not a number", verify.Value)
	}
	compare := strings.TrimSpace(verify.Compare)
	if compare == "" {
		compare = "gte"
	}
	passed := compareInt64(actual, expected, compare)
	result.Passed = passed
	result.Detail = fmt.Sprintf("depth=%d (expected %s %d)", actual, compare, expected)
	if passed {
		result.Message = "Queue depth matches."
	} else {
		result.Message = "Queue depth does not match."
	}
	return result, nil
}
