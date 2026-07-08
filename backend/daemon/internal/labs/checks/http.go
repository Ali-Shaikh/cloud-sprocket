// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package checks

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"cloudsprocket/backend/daemon/internal/labs"
	"cloudsprocket/backend/daemon/internal/recipes"
)

// HTTPDeps supplies HTTP access for URL verification checks.
type HTTPDeps struct {
	Get func(ctx context.Context, url string) (int, error)
}

// HTTPGetCheck verifies that an HTTP GET returns a successful status code.
type HTTPGetCheck struct {
	Deps HTTPDeps
}

func (c *HTTPGetCheck) Type() string {
	return recipes.LabVerifyHTTPGet
}

func (c *HTTPGetCheck) Run(
	ctx context.Context,
	verify recipes.LabVerify,
	checkCtx labs.CheckContext,
) (labs.VerifyResult, error) {
	result := labs.VerifyResult{Type: c.Type()}
	targetURL := strings.TrimSpace(labs.ResolveTemplate(verify.URL, checkCtx.Deployment))
	if targetURL == "" {
		result.Passed = false
		result.Message = "URL is required for this verification."
		return result, nil
	}
	if c.Deps.Get == nil {
		return result, fmt.Errorf("HTTP GET dependency is not configured")
	}

	status, err := c.Deps.Get(ctx, targetURL)
	if err != nil {
		result.Passed = false
		result.Message = "Could not reach the URL."
		result.Detail = err.Error()
		return result, nil
	}

	result.Detail = fmt.Sprintf("HTTP %d", status)
	if status >= http.StatusOK && status < http.StatusMultipleChoices {
		result.Passed = true
		result.Message = "URL responded successfully."
		return result, nil
	}
	result.Passed = false
	result.Message = "URL did not return a successful status code."
	return result, nil
}