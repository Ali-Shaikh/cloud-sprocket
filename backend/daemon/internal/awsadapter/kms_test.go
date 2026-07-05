// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package awsadapter

import (
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/kms/types"
)

func TestKmsKeyListSummaryMapsFields(t *testing.T) {
	got := kmsKeyListSummary(types.KeyListEntry{
		KeyId:  aws.String("1234abcd-5678-90ef-ghij-klmnopqrstuv"),
		KeyArn: aws.String("arn:aws:kms:us-east-1:123:key/1234abcd-5678-90ef-ghij-klmnopqrstuv"),
	})
	if got.KeyId != "1234abcd-5678-90ef-ghij-klmnopqrstuv" {
		t.Fatalf("key ID = %+v", got)
	}
	if got.Arn != "arn:aws:kms:us-east-1:123:key/1234abcd-5678-90ef-ghij-klmnopqrstuv" {
		t.Fatalf("key ARN = %+v", got)
	}
}

func TestKmsKeyMetadataSummaryMapsFields(t *testing.T) {
	created := time.Date(2026, 3, 1, 12, 0, 0, 0, time.UTC)
	multiRegion := false
	got := kmsKeyMetadataSummary(types.KeyMetadata{
		KeyId:        aws.String("1234abcd-5678-90ef-ghij-klmnopqrstuv"),
		Arn:          aws.String("arn:aws:kms:us-east-1:123:key/1234abcd-5678-90ef-ghij-klmnopqrstuv"),
		Description:  aws.String("Demo encryption key"),
		KeyUsage:     types.KeyUsageTypeEncryptDecrypt,
		KeyState:     types.KeyStateEnabled,
		KeySpec:      types.KeySpecSymmetricDefault,
		Origin:       types.OriginTypeAwsKms,
		CreationDate: &created,
		Enabled:      true,
		MultiRegion:  &multiRegion,
	})
	if got.Description != "Demo encryption key" || got.KeyUsage != "ENCRYPT_DECRYPT" {
		t.Fatalf("key metadata = %+v", got)
	}
	if got.KeyState != "Enabled" || got.KeySpec != "SYMMETRIC_DEFAULT" || got.Origin != "AWS_KMS" {
		t.Fatalf("key classification = %+v", got)
	}
	if got.CreationDate != "2026-03-01T12:00:00Z" || !got.Enabled || got.MultiRegion {
		t.Fatalf("key detail = %+v", got)
	}
}

func TestKmsAliasSummaryMapsFields(t *testing.T) {
	got := kmsAliasSummary(types.AliasListEntry{
		AliasName:   aws.String("alias/demo-key"),
		AliasArn:    aws.String("arn:aws:kms:us-east-1:123:alias/demo-key"),
		TargetKeyId: aws.String("1234abcd-5678-90ef-ghij-klmnopqrstuv"),
	})
	if got.AliasName != "alias/demo-key" || got.TargetKeyId != "1234abcd-5678-90ef-ghij-klmnopqrstuv" {
		t.Fatalf("alias = %+v", got)
	}
}