// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package checks

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

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

const httpUnreachableTimeout = 3 * time.Second

// HTTPUnreachableCheck verifies that a dependency does not answer while a
// controlled outage fault is active.
type HTTPUnreachableCheck struct {
	Deps HTTPDeps
}

func (c *HTTPUnreachableCheck) Type() string {
	return recipes.LabVerifyHTTPUnreachable
}

func (c *HTTPUnreachableCheck) Run(
	ctx context.Context,
	verify recipes.LabVerify,
	checkCtx labs.CheckContext,
) (labs.VerifyResult, error) {
	result := labs.VerifyResult{Type: c.Type()}
	targetURL := strings.TrimSpace(labs.ResolveTemplate(verify.URL, checkCtx.Deployment))
	if targetURL == "" {
		result.Message = "URL is required for this verification."
		return result, nil
	}
	if c.Deps.Get == nil {
		return result, fmt.Errorf("HTTP GET dependency is not configured")
	}

	probeCtx, cancel := context.WithTimeout(ctx, httpUnreachableTimeout)
	defer cancel()
	status, err := c.Deps.Get(probeCtx, targetURL)
	if err != nil {
		if ctx.Err() != nil {
			return result, ctx.Err()
		}
		result.Passed = true
		result.Message = "Dependency was unreachable during the controlled outage."
		result.Detail = "No HTTP response was received before the outage probe ended."
		return result, nil
	}

	result.Passed = false
	result.Message = "Dependency still responded during the controlled outage."
	result.Detail = fmt.Sprintf("HTTP %d", status)
	return result, nil
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
