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

// LambdaDeps supplies function invoke for Lambda verification checks.
type LambdaDeps struct {
	Invoke func(ctx context.Context, profile models.ProfileSummary, region, name string, payload []byte) (models.AwsLambdaInvokeResult, error)
}

// LambdaInvokeCheck invokes a function and checks status / payload content.
type LambdaInvokeCheck struct {
	Deps LambdaDeps
}

func (c *LambdaInvokeCheck) Type() string {
	return recipes.LabVerifyLambdaInvoke
}

func (c *LambdaInvokeCheck) Run(
	ctx context.Context,
	verify recipes.LabVerify,
	checkCtx labs.CheckContext,
) (labs.VerifyResult, error) {
	result := labs.VerifyResult{Type: c.Type()}
	functionName := strings.TrimSpace(labs.ResolveTemplate(verify.Function, checkCtx.Deployment))
	payloadText := labs.ResolveTemplate(verify.Payload, checkCtx.Deployment)
	contains := labs.ResolveTemplate(verify.Contains, checkCtx.Deployment)
	if functionName == "" {
		result.Passed = false
		result.Message = "Function name is required for this verification."
		return result, nil
	}
	// Lambda invoke is side-effecting (handlers may write). Match the
	// workspace write gate used by labsInvokeWrite / aws.lambda.invoke.
	if !checkCtx.AWSWritesEnabled {
		result.Passed = false
		result.Message = "Lambda invoke verification requires write mode to be enabled."
		result.Detail = "Turn on write mode from the top bar, then re-run verify."
		return result, nil
	}
	if c.Deps.Invoke == nil {
		return result, fmt.Errorf("Lambda invoke dependency is not configured")
	}

	var payload []byte
	if strings.TrimSpace(payloadText) != "" {
		payload = []byte(payloadText)
	} else {
		payload = []byte("{}")
	}
	invokeResult, err := c.Deps.Invoke(ctx, checkCtx.Profile, checkCtx.Region, functionName, payload)
	if err != nil {
		result.Passed = false
		result.Message = "Could not invoke the function."
		result.Detail = err.Error()
		return result, nil
	}
	if strings.TrimSpace(invokeResult.FunctionError) != "" {
		result.Passed = false
		result.Message = "Function returned an error."
		result.Detail = invokeResult.FunctionError
		return result, nil
	}
	if invokeResult.StatusCode < 200 || invokeResult.StatusCode >= 300 {
		result.Passed = false
		result.Message = "Function status code was not successful."
		result.Detail = fmt.Sprintf("status=%d", invokeResult.StatusCode)
		return result, nil
	}
	if strings.TrimSpace(contains) != "" && !strings.Contains(invokeResult.Payload, contains) {
		result.Passed = false
		result.Message = "Function payload does not contain the expected text."
		result.Detail = fmt.Sprintf("status=%d payload missing %q", invokeResult.StatusCode, contains)
		return result, nil
	}
	result.Passed = true
	result.Message = "Function invoke succeeded."
	result.Detail = fmt.Sprintf("status=%d", invokeResult.StatusCode)
	return result, nil
}
