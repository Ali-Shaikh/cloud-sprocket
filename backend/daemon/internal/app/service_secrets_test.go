// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"strings"
	"testing"
	"time"

	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/deploy"
	"cloudsprocket/backend/daemon/internal/store"
)

func TestDeploymentSecretsSealedAtRest(t *testing.T) {
	dir := t.TempDir()
	settings := config.FromEnv(map[string]string{"CLOUDSPROCKET_CONFIG_DIR": dir}, "linux", dir)
	if err := settings.EnsureRuntimeDirs(); err != nil {
		t.Fatalf("EnsureRuntimeDirs: %v", err)
	}
	dataStore, err := store.Open(settings.DatabasePath)
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	t.Cleanup(func() { _ = dataStore.Close() })

	s := &Service{
		store:  dataStore,
		cipher: loadCipher(settings.SecretKeyPath),
		now:    func() time.Time { return time.Now().UTC() },
	}
	if s.cipher == nil {
		t.Fatal("expected a cipher to be loaded")
	}

	deployment := &deploy.Deployment{
		ID:            "dep-secret",
		SensitiveVars: []string{"db_password", "db_config"},
		Variables: map[string]any{
			"db_password": "s3cret-pw",
			"app_name":    "demo",
			// A structured secret (map) must also be sealed, not just strings.
			"db_config": map[string]any{"user": "admin", "token": "tok-987"},
		},
		Outputs: []deploy.Output{
			{Name: "db_url", Sensitive: true, Value: "postgres://secret"},
			{Name: "api_key", Sensitive: true, Value: float64(424242)},
			{Name: "bucket", Value: "demo-bucket"},
		},
		Status:    deploy.StatusApplied,
		CreatedAt: "t0",
		UpdatedAt: "t0",
	}

	s.setDeploymentStatus(context.Background(), deployment, deploy.StatusApplied, nil)

	// The in-memory deployment must stay plaintext for the running operation.
	if deployment.Variables["db_password"] != "s3cret-pw" {
		t.Fatalf("in-memory secret was mutated: %v", deployment.Variables["db_password"])
	}

	// At rest, sensitive values must be sealed (and non-sensitive ones readable).
	payloads, err := dataStore.ListDeploymentsJSON(context.Background())
	if err != nil || len(payloads) != 1 {
		t.Fatalf("ListDeploymentsJSON: %v (len %d)", err, len(payloads))
	}
	raw := string(payloads[0])
	if strings.Contains(raw, "s3cret-pw") {
		t.Fatal("sensitive variable leaked in plaintext at rest")
	}
	if strings.Contains(raw, "postgres://secret") {
		t.Fatal("sensitive output leaked in plaintext at rest")
	}
	if strings.Contains(raw, "tok-987") {
		t.Fatal("structured sensitive variable leaked in plaintext at rest")
	}
	if strings.Contains(raw, "424242") {
		t.Fatal("numeric sensitive output leaked in plaintext at rest")
	}
	if !strings.Contains(raw, "enc:v1:") {
		t.Fatal("expected sealed tokens at rest")
	}
	if !strings.Contains(raw, "demo-bucket") || !strings.Contains(raw, "demo") {
		t.Fatal("non-sensitive values should remain readable at rest")
	}

	// On read, sensitive values are restored to plaintext.
	got, err := s.deploymentGet(context.Background(), "dep-secret")
	if err != nil {
		t.Fatalf("deploymentGet: %v", err)
	}
	if got.Variables["db_password"] != "s3cret-pw" {
		t.Fatalf("db_password not restored: %v", got.Variables["db_password"])
	}
	gotConfig, ok := got.Variables["db_config"].(map[string]any)
	if !ok || gotConfig["token"] != "tok-987" || gotConfig["user"] != "admin" {
		t.Fatalf("structured secret not restored: %v", got.Variables["db_config"])
	}
	if got.Outputs[0].Value != "postgres://secret" {
		t.Fatalf("sensitive output not restored: %v", got.Outputs[0].Value)
	}
	if got.Outputs[1].Value != float64(424242) {
		t.Fatalf("numeric sensitive output not restored: %v", got.Outputs[1].Value)
	}
	if got.Outputs[2].Value != "demo-bucket" {
		t.Fatalf("non-sensitive output changed: %v", got.Outputs[2].Value)
	}
}
