// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package discovery

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/models"
)

func TestDiscoverCollectsAWSAzureAndGCP(t *testing.T) {
	tempDir := t.TempDir()
	home := filepath.Join(tempDir, "home")

	mustWriteFile(t, filepath.Join(home, ".aws", "config"), "[profile sandbox]\nregion = us-east-1\nsso_start_url = https://example.awsapps.com/start\n")
	mustWriteFile(t, filepath.Join(home, ".aws", "credentials"), "[sandbox]\naws_access_key_id = AKIAEXAMPLE\n")
	mustWriteFile(t, filepath.Join(home, ".azure", "azureProfile.json"), "\ufeff{\"subscriptions\":[{\"id\":\"sub-001\",\"name\":\"Marketing\",\"tenantId\":\"tenant-123\",\"user\":{\"name\":\"ali@example.com\"}}]}")
	mustWriteFile(t, filepath.Join(home, ".config", "gcloud", "configurations", "config_default"), "[core]\naccount = ali@example.com\nproject = platform\n")

	settings := config.FromEnv(map[string]string{}, "linux", home)
	service := New(settings, func(command string) (string, error) {
		switch command {
		case "aws":
			return "/usr/bin/aws", nil
		case "az":
			return "/usr/bin/az", nil
		case "gcloud":
			return "/usr/bin/gcloud", nil
		default:
			return "", nil
		}
	})

	snapshot, err := service.Discover()
	if err != nil {
		t.Fatalf("expected discovery to succeed, got %v", err)
	}
	if len(snapshot.Providers) != 3 {
		t.Fatalf("expected 3 providers, got %d", len(snapshot.Providers))
	}
	if len(snapshot.Profiles) != 3 {
		t.Fatalf("expected 3 profiles, got %d", len(snapshot.Profiles))
	}
	if snapshot.Providers[1].ProfileCount != 1 {
		t.Fatalf("expected BOM-prefixed Azure profile to be discovered, got %d profiles", snapshot.Providers[1].ProfileCount)
	}

	awsProfile := snapshot.Profiles[0]
	if awsProfile.ProviderID != "aws" {
		t.Fatalf("expected aws profile first, got %s", awsProfile.ProviderID)
	}
	if !awsProfile.AuthMethods[1].Available {
		t.Fatalf("expected aws sso auth method to be available, got %+v", awsProfile.AuthMethods)
	}
}

func TestDiscoverRedactsSensitiveAWSCredentialValues(t *testing.T) {
	tempDir := t.TempDir()
	home := filepath.Join(tempDir, "home")

	mustWriteFile(t, filepath.Join(home, ".aws", "config"), "[profile sandbox]\nregion = eu-west-1\nendpoint_url = http://localhost:4566\n")
	mustWriteFile(t, filepath.Join(home, ".aws", "credentials"), "[sandbox]\naws_access_key_id = AKIA_SHOULD_NOT_LEAK\naws_secret_access_key = secret-should-not-leak\naws_session_token = token-should-not-leak\n")

	settings := config.FromEnv(map[string]string{}, "linux", home)
	service := New(settings, func(string) (string, error) { return "", nil })

	snapshot, err := service.Discover()
	if err != nil {
		t.Fatalf("expected discovery to succeed, got %v", err)
	}
	if len(snapshot.Profiles) != 1 {
		t.Fatalf("expected 1 profile, got %d", len(snapshot.Profiles))
	}

	byLabel := map[string]struct {
		value     string
		sensitive bool
	}{}
	for _, field := range snapshot.Profiles[0].Attributes {
		byLabel[field.Label] = struct {
			value     string
			sensitive bool
		}{value: field.Value, sensitive: field.Sensitive}
	}

	assertRedacted := func(label string) {
		t.Helper()
		field, ok := byLabel[label]
		if !ok {
			t.Fatalf("expected attribute %q", label)
		}
		if !field.sensitive {
			t.Fatalf("expected %q to be sensitive", label)
		}
		if field.value != RedactedSensitivePlaceholder {
			t.Fatalf("expected %q value to be redacted, got %q", label, field.value)
		}
	}
	assertRedacted("Aws Access Key Id")
	assertRedacted("Aws Secret Access Key")
	assertRedacted("Aws Session Token")

	region, ok := byLabel["Region"]
	if !ok || region.value != "eu-west-1" || region.sensitive {
		t.Fatalf("expected non-sensitive region eu-west-1, got %+v", region)
	}
	endpoint, ok := byLabel["Endpoint Url"]
	if !ok || endpoint.value != "http://localhost:4566" || endpoint.sensitive {
		t.Fatalf("expected non-sensitive endpoint_url, got %+v", endpoint)
	}

	// Secrets must not appear anywhere in serialisable attribute values.
	for _, field := range snapshot.Profiles[0].Attributes {
		if strings.Contains(field.Value, "SHOULD_NOT_LEAK") ||
			strings.Contains(field.Value, "secret-should-not-leak") ||
			strings.Contains(field.Value, "token-should-not-leak") {
			t.Fatalf("sensitive material leaked on the wire: %+v", field)
		}
	}
}

func TestRedactSensitiveAttributesIsIdempotent(t *testing.T) {
	fields := []models.DetailField{
		{Label: "Region", Value: "us-east-1"},
		{Label: "AWS Secret Access Key", Value: "plain-secret", Sensitive: true},
		{Label: "Client Secret", Value: "another-secret"}, // sensitive by name, flag unset
	}
	once := redactSensitiveAttributes(fields)
	twice := redactSensitiveAttributes(once)
	if once[0].Value != "us-east-1" || once[0].Sensitive {
		t.Fatalf("region should stay plain: %+v", once[0])
	}
	if once[1].Value != RedactedSensitivePlaceholder || !once[1].Sensitive {
		t.Fatalf("secret should be redacted: %+v", once[1])
	}
	if once[2].Value != RedactedSensitivePlaceholder || !once[2].Sensitive {
		t.Fatalf("client secret should be redacted by label: %+v", once[2])
	}
	if twice[1].Value != RedactedSensitivePlaceholder || twice[2].Value != RedactedSensitivePlaceholder {
		t.Fatalf("second redaction pass should stay stable: %+v", twice)
	}
}

func TestIsSensitiveFieldCoversKeysAndHumanLabels(t *testing.T) {
	for _, label := range []string{
		"aws_secret_access_key",
		"Aws Secret Access Key",
		"aws_session_token",
		"client_secret",
		"password",
		"refresh_token",
	} {
		if !isSensitiveField(label) {
			t.Fatalf("expected %q to be sensitive", label)
		}
	}
	for _, label := range []string{"region", "Region", "endpoint_url", "sso_start_url", "Tenant ID"} {
		if isSensitiveField(label) {
			t.Fatalf("expected %q not to be sensitive", label)
		}
	}
}

func mustWriteFile(t *testing.T, path string, contents string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("failed to create directory for %s: %v", path, err)
	}
	if err := os.WriteFile(path, []byte(contents), 0o644); err != nil {
		t.Fatalf("failed to write %s: %v", path, err)
	}
}
