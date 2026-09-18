// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package awsadapter

import (
	"errors"
	"testing"
)

func TestSqsQueueURLNeedsLookup(t *testing.T) {
	t.Parallel()
	tests := []struct {
		queueURL string
		want     bool
	}{
		{queueURL: "https://sqs.us-east-1.amazonaws.com/123456789012/process-order", want: false},
		{queueURL: "http://localhost:4566/000000000000/cloudsprocket-events", want: false},
		{queueURL: "https://sqs.us-east-1.amazonaws.com/process-order", want: true},
		{queueURL: "http://localhost:4566/cloudsprocket-events", want: true},
		{queueURL: "https://sqs.us-east-1.amazonaws.com/not-an-account/process-order", want: true},
	}
	for _, test := range tests {
		if got := sqsQueueURLNeedsLookup(test.queueURL); got != test.want {
			t.Fatalf("sqsQueueURLNeedsLookup(%q) = %v, want %v", test.queueURL, got, test.want)
		}
	}
}

func TestResolveSQSQueueURLLooksUpIncompleteURLs(t *testing.T) {
	t.Parallel()
	full := "https://sqs.eu-west-1.amazonaws.com/123456789012/lab-events"
	got, err := resolveSQSQueueURL(
		"https://sqs.eu-west-1.amazonaws.com/lab-events",
		func(name string) (string, error) {
			if name != "lab-events" {
				t.Fatalf("lookup name = %q", name)
			}
			return full, nil
		},
	)
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	if got != full {
		t.Fatalf("got %q, want full AWS URL", got)
	}
}

func TestResolveSQSQueueURLSkipsLookupWhenComplete(t *testing.T) {
	t.Parallel()
	original := "https://sqs.us-east-1.amazonaws.com/123456789012/process-order"
	got, err := resolveSQSQueueURL(original, func(string) (string, error) {
		t.Fatal("lookup must not run for a complete URL")
		return "", nil
	})
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	if got != original {
		t.Fatalf("got %q", got)
	}
}

func TestResolveSQSQueueURLSurfacesLookupError(t *testing.T) {
	t.Parallel()
	_, err := resolveSQSQueueURL("https://sqs.us-east-1.amazonaws.com/missing", func(string) (string, error) {
		return "", errors.New("queue does not exist")
	})
	if err == nil {
		t.Fatal("expected lookup error")
	}
}
