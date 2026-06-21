// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package deploy

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/recipes"
	"cloudsprocket/backend/daemon/internal/tofu"
)

func TestPreflightLocalStackReachable(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/_localstack/health" {
			t.Errorf("unexpected probe path %q", r.URL.Path)
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	e := NewEngine(tofu.NewRunner("tofu"), config.Settings{}, recipes.Bundled())
	e.registry.SetOptions(TargetOptions{LocalStackEndpoint: server.URL})

	if err := e.Preflight(context.Background(), &Deployment{ProviderID: "aws", Local: true}); err != nil {
		t.Fatalf("expected reachable LocalStack to pass preflight, got %v", err)
	}
}

func TestPreflightLocalStackUnreachable(t *testing.T) {
	e := NewEngine(tofu.NewRunner("tofu"), config.Settings{}, recipes.Bundled())
	// A closed port: nothing is listening, so the probe must fail fast.
	e.registry.SetOptions(TargetOptions{LocalStackEndpoint: "http://127.0.0.1:1"})

	err := e.Preflight(context.Background(), &Deployment{ProviderID: "aws", Local: true})
	if err == nil {
		t.Fatal("expected an unreachable LocalStack to fail preflight")
	}
	if !strings.Contains(err.Error(), "not reachable") {
		t.Fatalf("expected an actionable message, got %q", err)
	}
}

func TestPreflightAWSProfileConfigured(t *testing.T) {
	dir := t.TempDir()
	credsPath := filepath.Join(dir, "credentials")
	if err := os.WriteFile(credsPath, []byte("[prod]\naws_access_key_id = AKIA\n"), 0o600); err != nil {
		t.Fatalf("write credentials: %v", err)
	}
	e := NewEngine(tofu.NewRunner("tofu"), config.Settings{AWSCredentialsPath: credsPath}, recipes.Bundled())

	if err := e.Preflight(context.Background(), &Deployment{ProviderID: "aws", ProfileID: "prod"}); err != nil {
		t.Fatalf("expected a configured profile to pass, got %v", err)
	}
	if err := e.Preflight(context.Background(), &Deployment{ProviderID: "aws", ProfileID: "missing"}); err == nil {
		t.Fatal("expected an unknown profile to fail preflight")
	}
}

func TestPreflightAWSProfileFromConfigFile(t *testing.T) {
	dir := t.TempDir()
	configPath := filepath.Join(dir, "config")
	if err := os.WriteFile(configPath, []byte("[profile staging]\nregion = eu-west-1\n"), 0o644); err != nil {
		t.Fatalf("write config: %v", err)
	}
	e := NewEngine(tofu.NewRunner("tofu"), config.Settings{AWSConfigPath: configPath}, recipes.Bundled())

	if err := e.Preflight(context.Background(), &Deployment{ProviderID: "aws", ProfileID: "staging"}); err != nil {
		t.Fatalf("expected the [profile staging] header to be recognised, got %v", err)
	}
}
