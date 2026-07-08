// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package labs

import (
	"testing"

	"cloudsprocket/backend/daemon/internal/deploy"
)

func TestResolveTemplateOutputsAndVars(t *testing.T) {
	deployment := &deploy.Deployment{
		Outputs: []deploy.Output{
			{Name: "queue_url", Value: "https://sqs.example/queue"},
			{Name: "lambda_function_name", Value: "worker-fn"},
		},
		Variables: map[string]any{
			"aws_region": "eu-west-1",
		},
	}

	tests := []struct {
		name  string
		input string
		want  string
	}{
		{
			name:  "output ref",
			input: "Queue: {{ outputs.queue_url }}",
			want:  "Queue: https://sqs.example/queue",
		},
		{
			name:  "var ref",
			input: "Region {{ vars.aws_region }}",
			want:  "Region eu-west-1",
		},
		{
			name:  "mixed refs",
			input: "{{ outputs.lambda_function_name }} in {{ vars.aws_region }}",
			want:  "worker-fn in eu-west-1",
		},
		{
			name:  "unknown ref left intact",
			input: "{{ outputs.missing }}",
			want:  "{{ outputs.missing }}",
		},
	}

	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			if got := ResolveTemplate(testCase.input, deployment); got != testCase.want {
				t.Fatalf("ResolveTemplate() = %q, want %q", got, testCase.want)
			}
		})
	}
}

func TestResolveTemplateMap(t *testing.T) {
	deployment := &deploy.Deployment{
		Outputs: []deploy.Output{{Name: "queue_url", Value: "https://sqs.example/queue"}},
	}
	resolved := ResolveTemplateMap(map[string]string{
		"queueUrl":    "{{ outputs.queue_url }}",
		"messageBody": "hello",
	}, deployment)
	if resolved["queueUrl"] != "https://sqs.example/queue" {
		t.Fatalf("queueUrl = %q", resolved["queueUrl"])
	}
	if resolved["messageBody"] != "hello" {
		t.Fatalf("messageBody = %q", resolved["messageBody"])
	}
}