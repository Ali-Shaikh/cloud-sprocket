// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package awsadapter

import (
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/secretsmanager"
	smtypes "github.com/aws/aws-sdk-go-v2/service/secretsmanager/types"
)

func TestSecretSummaryMapsMetadata(t *testing.T) {
	changed := time.Date(2026, 7, 4, 12, 0, 0, 0, time.UTC)
	got := secretSummary(smtypes.SecretListEntry{
		ARN:              aws.String("arn:aws:secretsmanager:us-east-1:123:secret:db-password-abc"),
		Name:             aws.String("db-password"),
		Description:      aws.String("Database credentials"),
		LastChangedDate:  &changed,
		RotationEnabled:  aws.Bool(true),
	})
	if got.Name != "db-password" || got.Arn == "" || !got.RotationEnabled {
		t.Fatalf("secret = %+v", got)
	}
	if got.LastChangedDate != changed.UTC().Format(time.RFC3339) {
		t.Fatalf("lastChanged = %q", got.LastChangedDate)
	}
}

func TestSecretValueFromResultPrefersString(t *testing.T) {
	got := secretValueFromResult(&secretsmanager.GetSecretValueOutput{
		SecretString: aws.String("plain-text"),
		SecretBinary: []byte{0xff, 0xfe},
	})
	if got != "plain-text" {
		t.Fatalf("secret value = %q", got)
	}
}

func TestSecretValueFromResultBase64EncodesBinary(t *testing.T) {
	got := secretValueFromResult(&secretsmanager.GetSecretValueOutput{
		SecretBinary: []byte{0xff, 0xfe, 0xfd},
	})
	if got != "//79" {
		t.Fatalf("secret value = %q", got)
	}
}