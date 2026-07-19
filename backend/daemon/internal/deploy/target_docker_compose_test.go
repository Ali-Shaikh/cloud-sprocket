// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package deploy

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

type fakeComposeRunner struct {
	versionErr error
	upErr      error
	upCalls    int
	logs       string
	state      string
	stateErr   error
}

func (f *fakeComposeRunner) ComposeVersion(context.Context) error { return f.versionErr }

func (f *fakeComposeRunner) ComposeUp(context.Context, string) error {
	f.upCalls++
	return f.upErr
}

func (f *fakeComposeRunner) ContainerLogs(context.Context, string, int) (string, error) {
	return f.logs, nil
}

func (f *fakeComposeRunner) ContainerState(context.Context, string) (string, error) {
	return f.state, f.stateErr
}

func TestEnsureComposeStackSurfacesLicenceErrorWithoutToken(t *testing.T) {
	dir := t.TempDir()
	// Ensure no ambient token for this process.
	t.Setenv("LOCALSTACK_AUTH_TOKEN", "")

	runner := &fakeComposeRunner{
		state: "exited",
		logs:  "License activation failed! No credentials were found in the environment. LOCALSTACK_AUTH_TOKEN",
	}
	target := &dockerComposeTarget{
		endpoint:   "http://127.0.0.1:9", // nothing listening
		composeDir: filepath.Join(dir, "compose"),
		runner:     runner,
	}

	err := target.ensureComposeStack(context.Background())
	if err == nil {
		t.Fatal("expected licence error")
	}
	if !strings.Contains(err.Error(), "LOCALSTACK_AUTH_TOKEN") {
		t.Fatalf("expected auth token guidance, got %v", err)
	}
	if runner.upCalls != 0 {
		t.Fatalf("expected compose up to be skipped when exited container has licence error, upCalls=%d", runner.upCalls)
	}
	// Compose file should still be materialised for inspection.
	if _, err := os.Stat(filepath.Join(target.composeDir, "docker-compose.yml")); err != nil {
		t.Fatalf("expected compose file: %v", err)
	}
}

func TestEnsureComposeStackFailsFastWhenContainerExitsAfterUp(t *testing.T) {
	t.Setenv("LOCALSTACK_AUTH_TOKEN", "test-token")
	dir := t.TempDir()
	runner := &fakeComposeRunner{
		state: "exited",
		logs:  "License activation failed! No credentials were found",
	}
	target := &dockerComposeTarget{
		endpoint:   "http://127.0.0.1:9",
		composeDir: filepath.Join(dir, "compose"),
		runner:     runner,
	}

	start := time.Now()
	err := target.ensureComposeStack(context.Background())
	if err == nil {
		t.Fatal("expected failure after container exit")
	}
	if time.Since(start) > 10*time.Second {
		t.Fatalf("expected fail-fast on exited container, took %s", time.Since(start))
	}
	if runner.upCalls != 1 {
		t.Fatalf("upCalls=%d, want 1", runner.upCalls)
	}
	if !strings.Contains(err.Error(), "LOCALSTACK_AUTH_TOKEN") {
		t.Fatalf("expected licence guidance, got %v", err)
	}
}

func TestEnsureComposeStackPropagatesComposeUpError(t *testing.T) {
	t.Setenv("LOCALSTACK_AUTH_TOKEN", "test-token")
	dir := t.TempDir()
	runner := &fakeComposeRunner{
		upErr: errors.New("boom"),
		state: "created",
	}
	target := &dockerComposeTarget{
		endpoint:   "http://127.0.0.1:9",
		composeDir: filepath.Join(dir, "compose"),
		runner:     runner,
	}
	err := target.ensureComposeStack(context.Background())
	if err == nil || !strings.Contains(err.Error(), "boom") {
		t.Fatalf("expected compose up error, got %v", err)
	}
}

func TestDockerComposeYAMLIncludesAuthTokenAndDockerSocket(t *testing.T) {
	if !strings.Contains(dockerComposeLocalStackYAML, "LOCALSTACK_AUTH_TOKEN") {
		t.Fatal("compose YAML must pass LOCALSTACK_AUTH_TOKEN")
	}
	if !strings.Contains(dockerComposeLocalStackYAML, "/var/run/docker.sock") {
		t.Fatal("compose YAML must mount docker.sock for Lambda")
	}
}
