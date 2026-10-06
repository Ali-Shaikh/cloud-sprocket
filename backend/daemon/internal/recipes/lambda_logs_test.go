// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package recipes

import (
	"io/fs"
	"path"
	"strings"
	"testing"
)

func TestLambdaSourceGrantsCloudWatchLogs(t *testing.T) {
	t.Parallel()
	const functionWithRole = `
resource "aws_lambda_function" "api" {
  role = aws_iam_role.api.arn
}
`
	tests := []struct {
		name string
		tf   string
		want bool
	}{
		{
			name: "inline log actions on the function role",
			tf: functionWithRole + `
resource "aws_iam_role_policy" "api_logs" {
  role = aws_iam_role.api.id
  policy = jsonencode({
    Action = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
  })
}
`,
			want: true,
		},
		{
			name: "managed basic execution role on the function role",
			tf: functionWithRole + `
resource "aws_iam_role_policy_attachment" "api_logs" {
  role       = aws_iam_role.api.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}
`,
			want: true,
		},
		{
			name: "managed VPC execution role includes logs",
			tf: functionWithRole + `
resource "aws_iam_role_policy_attachment" "api_vpc" {
  role       = aws_iam_role.api.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}
`,
			want: true,
		},
		{
			name: "logs star grants the function role",
			tf: functionWithRole + `
resource "aws_iam_role_policy" "api_logs" {
  role = aws_iam_role.api.id
  policy = jsonencode({ Action = ["logs:*"] })
}
`,
			want: true,
		},
		{
			name: "create group alone cannot write log events",
			tf: functionWithRole + `
resource "aws_iam_role_policy" "api_logs" {
  role = aws_iam_role.api.id
  policy = jsonencode({ Action = ["logs:CreateLogGroup"] })
}
`,
			want: false,
		},
		{
			name: "stream and put without create group cannot write log events",
			tf: functionWithRole + `
resource "aws_iam_role_policy" "api_logs" {
  role = aws_iam_role.api.id
  policy = jsonencode({ Action = ["logs:CreateLogStream", "logs:PutLogEvents"] })
}
`,
			want: false,
		},
		{
			name: "PutLogEvents alone is not enough",
			tf: functionWithRole + `
resource "aws_iam_role_policy" "api_logs" {
  role = aws_iam_role.api.id
  policy = jsonencode({ Action = ["logs:PutLogEvents"] })
}
`,
			want: false,
		},
		{
			name: "SQS-only policy is not enough",
			tf: functionWithRole + `
resource "aws_iam_role_policy" "api_sqs" {
  role = aws_iam_role.api.id
  policy = jsonencode({ Action = ["sqs:ReceiveMessage", "sqs:DeleteMessage"] })
}
`,
			want: false,
		},
		{
			name: "logs on a different role do not grant this function",
			tf: functionWithRole + `
resource "aws_iam_role_policy_attachment" "other_logs" {
  role       = aws_iam_role.other.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}
`,
			want: false,
		},
		{
			name: "two functions fail when only one role has logs",
			tf: `
resource "aws_lambda_function" "api" {
  role = aws_iam_role.api.arn
}
resource "aws_iam_role_policy_attachment" "api_logs" {
  role       = aws_iam_role.api.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}
resource "aws_lambda_function" "worker" {
  role = aws_iam_role.worker.arn
}
resource "aws_iam_role_policy" "worker_sqs" {
  role = aws_iam_role.worker.id
  policy = jsonencode({ Action = ["sqs:ReceiveMessage"] })
}
`,
			want: false,
		},
		{
			name: "two functions pass when each role has logs",
			tf: `
resource "aws_lambda_function" "api" {
  role = aws_iam_role.api.arn
}
resource "aws_iam_role_policy_attachment" "api_logs" {
  role       = aws_iam_role.api.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}
resource "aws_lambda_function" "worker" {
  role = aws_iam_role.worker.arn
}
resource "aws_iam_role_policy_attachment" "worker_logs" {
  role       = aws_iam_role.worker.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}
`,
			want: true,
		},
		{
			name: "no lambda function has nothing to grant",
			tf:   `policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"`,
			want: true,
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := LambdaSourceGrantsCloudWatchLogs(test.tf); got != test.want {
				t.Fatalf("got %v, want %v", got, test.want)
			}
		})
	}
}

func TestBundledLambdaRecipesGrantCloudWatchLogs(t *testing.T) {
	t.Parallel()
	root, err := fs.Sub(bundledFS, "bundled")
	if err != nil {
		t.Fatalf("sub: %v", err)
	}
	missing := []string{}
	err = fs.WalkDir(root, ".", func(name string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() || path.Base(name) != "main.tf" {
			return nil
		}
		data, readErr := fs.ReadFile(root, name)
		if readErr != nil {
			return readErr
		}
		tf := string(data)
		if !LambdaSourceDefinesFunction(tf) {
			return nil
		}
		if !LambdaSourceGrantsCloudWatchLogs(tf) {
			missing = append(missing, strings.TrimSuffix(name, "/main.tf"))
		}
		return nil
	})
	if err != nil {
		t.Fatalf("walk: %v", err)
	}
	if len(missing) > 0 {
		t.Fatalf("Lambda recipes missing CloudWatch Logs permissions: %s", strings.Join(missing, ", "))
	}
}
