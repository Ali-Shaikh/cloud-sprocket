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
	tests := []struct {
		name string
		tf   string
		want bool
	}{
		{
			name: "inline log actions",
			tf:   `Action = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]`,
			want: true,
		},
		{
			name: "managed basic execution role",
			tf:   `policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"`,
			want: true,
		},
		{
			name: "managed VPC execution role includes logs",
			tf:   `policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"`,
			want: true,
		},
		{
			name: "SQS-only policy is not enough",
			tf:   `Action = ["sqs:ReceiveMessage", "sqs:DeleteMessage"]`,
			want: false,
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
