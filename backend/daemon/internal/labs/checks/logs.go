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

// LogsDeps supplies log group reads for log verification checks.
type LogsDeps struct {
	DescribeLogGroup func(ctx context.Context, profile models.ProfileSummary, region, group string) (models.AwsLogGroup, error)
}

// LogsContainsCheck verifies recent log events contain a pattern.
type LogsContainsCheck struct {
	Deps LogsDeps
}

func (c *LogsContainsCheck) Type() string {
	return recipes.LabVerifyLogsContains
}

func (c *LogsContainsCheck) Run(
	ctx context.Context,
	verify recipes.LabVerify,
	checkCtx labs.CheckContext,
) (labs.VerifyResult, error) {
	result := labs.VerifyResult{Type: c.Type()}
	group := strings.TrimSpace(labs.ResolveTemplate(verify.LogGroup, checkCtx.Deployment))
	needle := labs.ResolveTemplate(verify.Pattern, checkCtx.Deployment)
	if strings.TrimSpace(needle) == "" {
		needle = labs.ResolveTemplate(verify.Contains, checkCtx.Deployment)
	}
	if group == "" || strings.TrimSpace(needle) == "" {
		result.Passed = false
		result.Message = "Log group and pattern are required for this verification."
		return result, nil
	}
	if c.Deps.DescribeLogGroup == nil {
		return result, fmt.Errorf("logs describe dependency is not configured")
	}

	logGroup, err := c.Deps.DescribeLogGroup(ctx, checkCtx.Profile, checkCtx.Region, group)
	if err != nil {
		result.Passed = false
		result.Message = "Could not read the log group."
		result.Detail = err.Error()
		return result, nil
	}
	for _, line := range logGroup.RecentEvents {
		if strings.Contains(line, needle) {
			result.Passed = true
			result.Message = "Log events contain the expected pattern."
			result.Detail = fmt.Sprintf("group=%s pattern=%q", group, needle)
			return result, nil
		}
	}
	result.Passed = false
	result.Message = "No recent log event matched the pattern."
	result.Detail = fmt.Sprintf("group=%s pattern=%q events=%d", group, needle, len(logGroup.RecentEvents))
	return result, nil
}
