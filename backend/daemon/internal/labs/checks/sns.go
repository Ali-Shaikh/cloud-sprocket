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

// SNSDeps supplies topic describe for SNS verification checks.
type SNSDeps struct {
	DescribeTopic func(ctx context.Context, profile models.ProfileSummary, region, topicArn string) (models.AwsSnsTopic, error)
}

// SNSSubscriptionCheck compares subscription count on a topic.
type SNSSubscriptionCheck struct {
	Deps SNSDeps
}

func (c *SNSSubscriptionCheck) Type() string {
	return recipes.LabVerifySNSSubscription
}

func (c *SNSSubscriptionCheck) Run(
	ctx context.Context,
	verify recipes.LabVerify,
	checkCtx labs.CheckContext,
) (labs.VerifyResult, error) {
	result := labs.VerifyResult{Type: c.Type()}
	topicArn := strings.TrimSpace(labs.ResolveTemplate(verify.Topic, checkCtx.Deployment))
	if topicArn == "" {
		result.Passed = false
		result.Message = "Topic ARN is required for this verification."
		return result, nil
	}
	if c.Deps.DescribeTopic == nil {
		return result, fmt.Errorf("SNS describe dependency is not configured")
	}

	topic, err := c.Deps.DescribeTopic(ctx, checkCtx.Profile, checkCtx.Region, topicArn)
	if err != nil {
		result.Passed = false
		result.Message = "Could not describe the topic."
		result.Detail = err.Error()
		return result, nil
	}
	actual := int64(len(topic.Subscriptions))
	valueText := strings.TrimSpace(verify.Value)
	compare := strings.TrimSpace(verify.Compare)
	if compare == "" {
		compare = "gte"
	}
	var expected int64
	if valueText == "" {
		// Default: at least one subscription.
		expected = 1
	} else {
		parsed, err := strconv.ParseInt(valueText, 10, 64)
		if err != nil {
			return result, fmt.Errorf("verification value %q is not a number", verify.Value)
		}
		expected = parsed
	}
	passed, err := compareInt64(actual, expected, compare)
	if err != nil {
		return result, err
	}
	result.Passed = passed
	result.Detail = fmt.Sprintf("subscriptions=%d (expected %s %d)", actual, compare, expected)
	if passed {
		result.Message = "Topic subscription count matches."
	} else {
		result.Message = "Topic subscription count does not match."
	}
	return result, nil
}
