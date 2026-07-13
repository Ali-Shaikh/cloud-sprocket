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

// SQSDeps supplies queue describe access for SQS verification checks.
type SQSDeps struct {
	DescribeQueue func(ctx context.Context, profile models.ProfileSummary, region string, queueURL string) (models.AwsSqsQueue, error)
}

// SQSQueueAttributeCheck compares one SQS queue attribute against an expected value.
type SQSQueueAttributeCheck struct {
	Deps SQSDeps
}

func (c *SQSQueueAttributeCheck) Type() string {
	return recipes.LabVerifySQSQueueAttribute
}

func (c *SQSQueueAttributeCheck) Run(
	ctx context.Context,
	verify recipes.LabVerify,
	checkCtx labs.CheckContext,
) (labs.VerifyResult, error) {
	result := labs.VerifyResult{Type: c.Type()}
	queueURL := strings.TrimSpace(labs.ResolveTemplate(verify.Queue, checkCtx.Deployment))
	if queueURL == "" {
		result.Passed = false
		result.Message = "Queue URL is required for this verification."
		return result, nil
	}
	if c.Deps.DescribeQueue == nil {
		return result, fmt.Errorf("SQS describe dependency is not configured")
	}

	queue, err := c.Deps.DescribeQueue(ctx, checkCtx.Profile, checkCtx.Region, queueURL)
	if err != nil {
		result.Passed = false
		result.Message = "Could not describe the queue."
		result.Detail = err.Error()
		return result, nil
	}

	actual, ok := sqsAttributeValue(queue, verify.Attribute)
	if !ok {
		result.Passed = false
		result.Message = fmt.Sprintf("Attribute %q is not supported.", verify.Attribute)
		return result, nil
	}

	expected, err := strconv.ParseInt(strings.TrimSpace(verify.Value), 10, 64)
	if err != nil {
		return result, fmt.Errorf("verification value %q is not a number", verify.Value)
	}

	passed := compareInt64(actual, expected, verify.Compare)
	result.Passed = passed
	result.Detail = fmt.Sprintf("%s=%d (expected %s %d)", verify.Attribute, actual, verify.Compare, expected)
	if passed {
		result.Message = "Queue attribute matches the expected value."
	} else {
		result.Message = "Queue attribute does not match the expected value."
	}
	return result, nil
}

func sqsAttributeValue(queue models.AwsSqsQueue, attribute string) (int64, bool) {
	switch strings.TrimSpace(attribute) {
	case "ApproximateNumberOfMessages":
		return queue.ApproximateNumberOfMessages, true
	case "ApproximateNumberOfMessagesNotVisible":
		return queue.ApproximateNumberOfMessagesNotVisible, true
	case "ApproximateNumberOfMessagesDelayed":
		return queue.ApproximateNumberOfMessagesDelayed, true
	case "VisibilityTimeout":
		return int64(queue.VisibilityTimeout), true
	case "DelaySeconds":
		return int64(queue.DelaySeconds), true
	case "ReceiveMessageWaitTimeSeconds":
		return int64(queue.ReceiveMessageWaitTimeSeconds), true
	default:
		return 0, false
	}
}

