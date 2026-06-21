// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package deploy

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/sysproc"
)

const dockerComposeProjectName = "cloudsprocket-localstack"

// dockerComposeTarget runs LocalStack via a managed docker-compose stack so
// recipes can dry-run without the in-app LocalStack emulator.
type dockerComposeTarget struct {
	endpoint   string
	composeDir string
	runner     composeRunner
}

type composeRunner interface {
	ComposeVersion(ctx context.Context) error
	ComposeUp(ctx context.Context, dir string) error
}

type execComposeRunner struct{}

func (execComposeRunner) ComposeVersion(ctx context.Context) error {
	cmd := exec.CommandContext(ctx, "docker", "compose", "version")
	sysproc.Hide(cmd)
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("docker compose is not available (%s). Install Docker Desktop and ensure the compose plugin is on PATH", strings.TrimSpace(string(out)))
	}
	return nil
}

func (execComposeRunner) ComposeUp(ctx context.Context, dir string) error {
	cmd := exec.CommandContext(ctx, "docker", "compose", "-f", filepath.Join(dir, "docker-compose.yml"), "-p", dockerComposeProjectName, "up", "-d")
	cmd.Dir = dir
	sysproc.Hide(cmd)
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("docker compose up failed: %s", strings.TrimSpace(string(out)))
	}
	return nil
}

func newDockerComposeTarget(settings config.Settings, opts TargetOptions) *dockerComposeTarget {
	endpoint := opts.LocalStackEndpoint
	if strings.TrimSpace(endpoint) == "" {
		endpoint = DefaultLocalStackEndpoint
	}
	return &dockerComposeTarget{
		endpoint:   endpoint,
		composeDir: filepath.Join(settings.EmulatorStateDir, "docker-compose"),
		runner:     execComposeRunner{},
	}
}

func (t *dockerComposeTarget) ID() string { return "docker-compose" }

func (t *dockerComposeTarget) Label(_ *Deployment) string { return "Docker Compose" }

func (t *dockerComposeTarget) Env(_ *Deployment, _ config.Settings) []string {
	return []string{
		"AWS_ACCESS_KEY_ID=test",
		"AWS_SECRET_ACCESS_KEY=test",
		"AWS_DEFAULT_REGION=us-east-1",
	}
}

func (t *dockerComposeTarget) Preflight(ctx context.Context, _ *Deployment, _ config.Settings, opts TargetOptions) error {
	endpoint := t.endpoint
	if strings.TrimSpace(endpoint) == "" {
		endpoint = opts.LocalStackEndpoint
	}
	if strings.TrimSpace(endpoint) == "" {
		endpoint = DefaultLocalStackEndpoint
	}
	if err := t.runner.ComposeVersion(ctx); err != nil {
		return err
	}
	if err := t.ensureComposeStack(ctx); err != nil {
		return err
	}
	return checkLocalStackHealth(ctx, endpoint)
}

func (t *dockerComposeTarget) WriteOverrides(dir string, _ *Deployment, opts TargetOptions) error {
	endpoint := t.endpoint
	if strings.TrimSpace(endpoint) == "" {
		endpoint = opts.LocalStackEndpoint
	}
	if strings.TrimSpace(endpoint) == "" {
		endpoint = DefaultLocalStackEndpoint
	}
	content := localStackOverride(endpoint)
	return os.WriteFile(filepath.Join(dir, overrideFile), []byte(content), 0o644)
}

func (t *dockerComposeTarget) ensureComposeStack(ctx context.Context) error {
	if err := os.MkdirAll(t.composeDir, 0o755); err != nil {
		return fmt.Errorf("prepare docker compose directory: %w", err)
	}
	composePath := filepath.Join(t.composeDir, "docker-compose.yml")
	if _, err := os.Stat(composePath); os.IsNotExist(err) {
		if err := os.WriteFile(composePath, []byte(dockerComposeLocalStackYAML), 0o644); err != nil {
			return fmt.Errorf("write docker compose file: %w", err)
		}
	}
	if err := checkLocalStackHealth(ctx, t.endpoint); err == nil {
		return nil
	}
	if err := t.runner.ComposeUp(ctx, t.composeDir); err != nil {
		return err
	}
	probeCtx, cancel := context.WithTimeout(ctx, 90*time.Second)
	defer cancel()
	for {
		if err := checkLocalStackHealth(probeCtx, t.endpoint); err == nil {
			return nil
		}
		select {
		case <-probeCtx.Done():
			return fmt.Errorf("LocalStack via docker compose did not become healthy at %s. Check docker compose logs in %s", t.endpoint, t.composeDir)
		case <-time.After(2 * time.Second):
		}
	}
}

const dockerComposeLocalStackYAML = `services:
  localstack:
    image: localstack/localstack:stable
    ports:
      - "127.0.0.1:4566:4566"
    environment:
      - SERVICES=apigateway,apigatewayv2,cloudformation,dynamodb,ec2,ecr,ecs,elbv2,events,iam,kinesis,kms,lambda,logs,rds,route53,s3,secretsmanager,sns,sqs,ssm,sts
      - DEBUG=0
      - PERSISTENCE=0
    volumes:
      - localstack-data:/var/lib/localstack

volumes:
  localstack-data:
`