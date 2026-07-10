// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package awsadapter

import "testing"

func TestEncodeS3CopySource(t *testing.T) {
	tests := []struct {
		name   string
		bucket string
		key    string
		want   string
	}{
		{
			name:   "plain key",
			bucket: "my-bucket",
			key:    "reports/january.pdf",
			want:   "my-bucket/reports/january.pdf",
		},
		{
			name:   "spaces and hash",
			bucket: "my-bucket",
			key:    "reports/July #1.csv",
			want:   "my-bucket/reports/July%20%231.csv",
		},
		{
			name:   "plus and question mark",
			bucket: "archive",
			key:    "a+b?c/d",
			want:   "archive/a%2Bb%3Fc/d",
		},
	}

	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			if got := encodeS3CopySource(testCase.bucket, testCase.key); got != testCase.want {
				t.Fatalf("encodeS3CopySource(%q, %q) = %q, want %q", testCase.bucket, testCase.key, got, testCase.want)
			}
		})
	}
}