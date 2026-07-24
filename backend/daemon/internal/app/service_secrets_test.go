// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package app

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
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

	cipher, err := loadCipher(settings.SecretKeyPath)
	if err != nil {
		t.Fatalf("loadCipher: %v", err)
	}
	s := &Service{store: dataStore, cipher: cipher, now: func() time.Time { return time.Now().UTC() }}

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

	if err := s.setDeploymentStatus(context.Background(), deployment, deploy.StatusApplied, nil); err != nil {
		t.Fatalf("setDeploymentStatus: %v", err)
	}

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

func TestLegacyPlaintextSecretsResealedOnRead(t *testing.T) {
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

	cipher, err := loadCipher(settings.SecretKeyPath)
	if err != nil {
		t.Fatalf("loadCipher: %v", err)
	}
	s := &Service{store: dataStore, cipher: cipher, now: func() time.Time { return time.Now().UTC() }}

	// Simulate a pre-encryption deployment row with sensitive values in plaintext.
	legacy := &deploy.Deployment{
		ID:            "dep-legacy-plain",
		SensitiveVars: []string{"db_password"},
		Variables: map[string]any{
			"db_password": "legacy-s3cret",
			"app_name":    "demo",
		},
		Outputs: []deploy.Output{
			{Name: "db_url", Sensitive: true, Value: "postgres://legacy"},
			{Name: "bucket", Value: "demo-bucket"},
		},
		Status:    deploy.StatusApplied,
		CreatedAt: "t0",
		UpdatedAt: "t0",
	}
	if err := dataStore.SaveDeployment(context.Background(), legacy.ID, legacy, "t0"); err != nil {
		t.Fatalf("SaveDeployment legacy: %v", err)
	}

	payloads, err := dataStore.ListDeploymentsJSON(context.Background())
	if err != nil || len(payloads) != 1 {
		t.Fatalf("ListDeploymentsJSON before: %v (len %d)", err, len(payloads))
	}
	if !strings.Contains(string(payloads[0]), "legacy-s3cret") {
		t.Fatal("expected plaintext secret in legacy row before migration")
	}

	// Read path must restore plaintext in memory and re-seal at rest.
	got, err := s.deploymentGet(context.Background(), "dep-legacy-plain")
	if err != nil {
		t.Fatalf("deploymentGet: %v", err)
	}
	if got.Variables["db_password"] != "legacy-s3cret" {
		t.Fatalf("db_password not restored: %v", got.Variables["db_password"])
	}
	if got.Outputs[0].Value != "postgres://legacy" {
		t.Fatalf("sensitive output not restored: %v", got.Outputs[0].Value)
	}
	if cipher.ResealCount() < 1 {
		t.Fatalf("expected Open to count reseals, got %d", cipher.ResealCount())
	}

	payloads, err = dataStore.ListDeploymentsJSON(context.Background())
	if err != nil || len(payloads) != 1 {
		t.Fatalf("ListDeploymentsJSON after: %v (len %d)", err, len(payloads))
	}
	raw := string(payloads[0])
	if strings.Contains(raw, "legacy-s3cret") {
		t.Fatal("legacy plaintext secret still at rest after read migration")
	}
	if strings.Contains(raw, "postgres://legacy") {
		t.Fatal("legacy plaintext output still at rest after read migration")
	}
	if !strings.Contains(raw, "enc:v1:") {
		t.Fatal("expected sealed tokens at rest after read migration")
	}
	if !strings.Contains(raw, "demo-bucket") || !strings.Contains(raw, "demo") {
		t.Fatal("non-sensitive values should remain readable at rest")
	}

	// A second read must not leave reseal work pending and must still restore.
	before := cipher.ResealCount()
	got2, err := s.deploymentGet(context.Background(), "dep-legacy-plain")
	if err != nil {
		t.Fatalf("deploymentGet second: %v", err)
	}
	if got2.Variables["db_password"] != "legacy-s3cret" {
		t.Fatalf("second read password: %v", got2.Variables["db_password"])
	}
	if cipher.ResealCount() != before {
		t.Fatalf("second read resealed again: before=%d after=%d", before, cipher.ResealCount())
	}

	// Read-time migration must not invent a newer UpdatedAt on the payload.
	if got.UpdatedAt != "t0" || got2.UpdatedAt != "t0" {
		t.Fatalf("migration advanced payload UpdatedAt: first=%q second=%q", got.UpdatedAt, got2.UpdatedAt)
	}
}

func TestLegacyResealWriteBackSkipsConcurrentUpdate(t *testing.T) {
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

	cipher, err := loadCipher(settings.SecretKeyPath)
	if err != nil {
		t.Fatalf("loadCipher: %v", err)
	}
	s := &Service{store: dataStore, cipher: cipher, now: func() time.Time { return time.Now().UTC() }}

	legacy := &deploy.Deployment{
		ID:            "dep-legacy-race",
		SensitiveVars: []string{"db_password"},
		Variables: map[string]any{
			"db_password": "race-s3cret",
			"app_name":    "demo",
		},
		Status:    deploy.StatusApplied,
		CreatedAt: "t0",
		UpdatedAt: "t0",
	}
	if err := dataStore.SaveDeployment(context.Background(), legacy.ID, legacy, "t0"); err != nil {
		t.Fatalf("SaveDeployment legacy: %v", err)
	}

	// Snapshot as a list/get path would load it, then a lifecycle job advances
	// the row before openFromStore can migrate secrets.
	raw, _, found, err := dataStore.LoadDeploymentRaw(context.Background(), legacy.ID)
	if err != nil || !found {
		t.Fatalf("LoadDeploymentRaw snapshot: found=%v err=%v", found, err)
	}
	var snapshot deploy.Deployment
	if err := json.Unmarshal([]byte(raw), &snapshot); err != nil {
		t.Fatalf("unmarshal snapshot: %v", err)
	}

	concurrent := *legacy
	concurrent.Status = deploy.StatusPlanning
	concurrent.UpdatedAt = "t1"
	concurrent.Error = "job in progress"
	if err := dataStore.SaveDeployment(context.Background(), concurrent.ID, &concurrent, "t1"); err != nil {
		t.Fatalf("SaveDeployment concurrent: %v", err)
	}

	s.openFromStore(context.Background(), &snapshot, raw)
	if snapshot.Variables["db_password"] != "race-s3cret" {
		t.Fatalf("in-memory open lost password: %v", snapshot.Variables["db_password"])
	}

	var stored deploy.Deployment
	found, err = dataStore.LoadDeployment(context.Background(), legacy.ID, &stored)
	if err != nil || !found {
		t.Fatalf("LoadDeployment after open: found=%v err=%v", found, err)
	}
	if stored.Status != deploy.StatusPlanning {
		t.Fatalf("reseal write-back clobbered concurrent status: %s", stored.Status)
	}
	if stored.UpdatedAt != "t1" {
		t.Fatalf("reseal write-back clobbered concurrent UpdatedAt: %s", stored.UpdatedAt)
	}
	if stored.Error != "job in progress" {
		t.Fatalf("reseal write-back clobbered concurrent error: %q", stored.Error)
	}
	// Concurrent writer left plaintext; migration skipped so secret may still be
	// plaintext until a later load without a race. That is preferred to losing
	// lifecycle state.
	if pw, _ := stored.Variables["db_password"].(string); pw != "race-s3cret" {
		t.Fatalf("unexpected stored password after skipped migration: %v", stored.Variables["db_password"])
	}
}

func TestLoadCipherRejectsCorruptExistingKey(t *testing.T) {
	path := filepath.Join(t.TempDir(), "secret.key")
	if err := os.WriteFile(path, []byte("corrupt"), 0o600); err != nil {
		t.Fatal(err)
	}

	if _, err := loadCipher(path); err == nil {
		t.Fatal("expected corrupt key to stop cipher initialisation")
	}
	got, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != "corrupt" {
		t.Fatalf("corrupt key was replaced: %q", got)
	}
}

func TestSensitiveDeploymentPersistenceFailsClosedWithoutCipher(t *testing.T) {
	dir := t.TempDir()
	dataStore, err := store.Open(filepath.Join(dir, "state.db"))
	if err != nil {
		t.Fatalf("store.Open: %v", err)
	}
	t.Cleanup(func() { _ = dataStore.Close() })

	s := &Service{store: dataStore, now: func() time.Time { return time.Now().UTC() }}
	deployment := &deploy.Deployment{
		ID:            "dep-unsealed",
		SensitiveVars: []string{"password"},
		Variables:     map[string]any{"password": "must-not-leak"},
		Status:        deploy.StatusPending,
		UpdatedAt:     "before",
	}
	notifier := &captureNotifier{}
	if err := s.setDeploymentStatus(context.Background(), deployment, deploy.StatusApplied, notifier); err == nil {
		t.Fatal("expected persistence to fail when secret storage is unavailable")
	}
	if deployment.Status != deploy.StatusPending || deployment.UpdatedAt != "before" {
		t.Fatalf("failed transition was not rolled back: status=%s updatedAt=%s", deployment.Status, deployment.UpdatedAt)
	}
	if got := notifier.count("deployment.changed"); got != 0 {
		t.Fatalf("unsafe transition emitted %d deployment.changed events", got)
	}
	payloads, err := dataStore.ListDeploymentsJSON(context.Background())
	if err != nil {
		t.Fatalf("ListDeploymentsJSON: %v", err)
	}
	if len(payloads) != 0 {
		t.Fatalf("unsafe deployment was persisted: %s", payloads[0])
	}
}
