// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package awsadapter

import (
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/iam/types"
)

func TestIamRoleSummaryMapsFields(t *testing.T) {
	created := time.Date(2026, 6, 10, 12, 0, 0, 0, time.UTC)
	got := iamRoleSummary(types.Role{
		RoleName:    aws.String("cloudsprocket-lambda"),
		Arn:         aws.String("arn:aws:iam::000000000000:role/cloudsprocket-lambda"),
		Path:        aws.String("/"),
		Description: aws.String("Lambda execution role"),
		CreateDate:  &created,
	})
	if got.RoleName != "cloudsprocket-lambda" || got.CreateDate == "" {
		t.Fatalf("role = %+v", got)
	}
}

func TestIamPolicySummaryMapsFields(t *testing.T) {
	updated := time.Date(2026, 6, 12, 9, 0, 0, 0, time.UTC)
	got := iamPolicySummary(types.Policy{
		PolicyName:      aws.String("app-policy"),
		Arn:             aws.String("arn:aws:iam::000000000000:policy/app-policy"),
		AttachmentCount: aws.Int32(2),
		UpdateDate:      &updated,
	})
	if got.PolicyName != "app-policy" || got.AttachmentCount != 2 {
		t.Fatalf("policy = %+v", got)
	}
}