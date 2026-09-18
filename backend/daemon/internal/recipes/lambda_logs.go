// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package recipes

import "strings"

// LambdaSourceDefinesFunction reports whether Terraform source creates a Lambda
// function that will run on AWS (and therefore needs CloudWatch Logs).
func LambdaSourceDefinesFunction(tf string) bool {
	return strings.Contains(tf, `resource "aws_lambda_function"`)
}

// LambdaSourceGrantsCloudWatchLogs reports whether Terraform source grants the
// permissions Lambda needs to create its log group and write events on real AWS.
func LambdaSourceGrantsCloudWatchLogs(tf string) bool {
	return strings.Contains(tf, "logs:CreateLogGroup") ||
		strings.Contains(tf, "AWSLambdaBasicExecutionRole") ||
		strings.Contains(tf, "AWSLambdaVPCAccessExecutionRole")
}
