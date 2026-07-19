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

const (
	dockerComposeProjectName             = "cloudsprocket-localstack"
	dockerComposeLocalStackContainerName = dockerComposeProjectName + "-localstack-1"
	// composeUpTimeout covers image pull + first start. LocalStack image is large.
	composeUpTimeout = 4 * time.Minute
	// composeHealthTimeout is how long we wait after up for /_localstack/health.
	composeHealthTimeout = 90 * time.Second
)

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
	ContainerLogs(ctx context.Context, container string, tail int) (string, error)
	ContainerState(ctx context.Context, container string) (string, error)
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
	upCtx, cancel := context.WithTimeout(ctx, composeUpTimeout)
	defer cancel()
	cmd := exec.CommandContext(upCtx, "docker", "compose", "-f", filepath.Join(dir, "docker-compose.yml"), "-p", dockerComposeProjectName, "up", "-d", "--remove-orphans")
	cmd.Dir = dir
	// LocalStack 2026+ requires LOCALSTACK_AUTH_TOKEN; pass the process env through
	// so a token set for the daemon (or shell) reaches the compose file substitution.
	cmd.Env = os.Environ()
	sysproc.Hide(cmd)
	out, err := cmd.CombinedOutput()
	if err != nil {
		if upCtx.Err() == context.DeadlineExceeded {
			return fmt.Errorf("docker compose up timed out after %s while starting LocalStack. Check Docker Desktop, network access for image pulls, and that LOCALSTACK_AUTH_TOKEN is set for LocalStack 2026+: %s", composeUpTimeout, strings.TrimSpace(string(out)))
		}
		return fmt.Errorf("docker compose up failed: %s", strings.TrimSpace(string(out)))
	}
	return nil
}

func (execComposeRunner) ContainerLogs(ctx context.Context, container string, tail int) (string, error) {
	if tail <= 0 {
		tail = 40
	}
	cmd := exec.CommandContext(ctx, "docker", "logs", "--tail", fmt.Sprintf("%d", tail), container)
	sysproc.Hide(cmd)
	out, err := cmd.CombinedOutput()
	return string(out), err
}

func (execComposeRunner) ContainerState(ctx context.Context, container string) (string, error) {
	cmd := exec.CommandContext(ctx, "docker", "inspect", "-f", "{{.State.Status}}", container)
	sysproc.Hide(cmd)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(out)), nil
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
	// Always rewrite the managed compose file so token + docker.sock mounts land
	// for stacks created before LocalStack 2026 required authentication.
	if err := os.WriteFile(composePath, []byte(dockerComposeLocalStackYAML), 0o644); err != nil {
		return fmt.Errorf("write docker compose file: %w", err)
	}
	if err := checkLocalStackHealth(ctx, t.endpoint); err == nil {
		return nil
	}
	if token := strings.TrimSpace(os.Getenv("LOCALSTACK_AUTH_TOKEN")); token == "" {
		// Fail early when LocalStack will exit 55 for a missing licence. Users can
		// still proceed if an older free image is healthy (check above already
		// returned), or if they set a token and retry.
		if state, err := t.runner.ContainerState(ctx, dockerComposeLocalStackContainerName); err == nil {
			if state == "exited" || state == "dead" || state == "created" {
				if hint := t.localStackLicenceHint(ctx); hint != "" {
					return fmt.Errorf("%s", hint)
				}
			}
		}
	}
	if err := t.runner.ComposeUp(ctx, t.composeDir); err != nil {
		if hint := t.localStackLicenceHint(ctx); hint != "" {
			return fmt.Errorf("%s (compose: %v)", hint, err)
		}
		return err
	}
	probeCtx, cancel := context.WithTimeout(ctx, composeHealthTimeout)
	defer cancel()
	for {
		if err := checkLocalStackHealth(probeCtx, t.endpoint); err == nil {
			return nil
		}
		// Exit early when the container died (e.g. missing LocalStack auth token)
		// instead of waiting out the full health window with silent heartbeats.
		if state, err := t.runner.ContainerState(probeCtx, dockerComposeLocalStackContainerName); err == nil {
			if state == "exited" || state == "dead" {
				if hint := t.localStackLicenceHint(ctx); hint != "" {
					return fmt.Errorf("%s", hint)
				}
				logs, _ := t.runner.ContainerLogs(ctx, dockerComposeLocalStackContainerName, 30)
				return fmt.Errorf("LocalStack via docker compose exited before becoming healthy at %s. Last logs:\n%s", t.endpoint, strings.TrimSpace(logs))
			}
		}
		select {
		case <-probeCtx.Done():
			if hint := t.localStackLicenceHint(ctx); hint != "" {
				return fmt.Errorf("%s", hint)
			}
			return fmt.Errorf("LocalStack via docker compose did not become healthy at %s within %s. Check docker compose logs in %s and ensure LOCALSTACK_AUTH_TOKEN is set for LocalStack 2026+", t.endpoint, composeHealthTimeout, t.composeDir)
		case <-time.After(2 * time.Second):
		}
	}
}

func (t *dockerComposeTarget) localStackLicenceHint(ctx context.Context) string {
	logs, err := t.runner.ContainerLogs(ctx, dockerComposeLocalStackContainerName, 50)
	if err != nil {
		return ""
	}
	lower := strings.ToLower(logs)
	if !strings.Contains(lower, "license activation failed") &&
		!strings.Contains(lower, "localstack_auth_token") &&
		!strings.Contains(lower, "no credentials were found") {
		return ""
	}
	return "LocalStack stopped because no LOCALSTACK_AUTH_TOKEN is configured. LocalStack 2026 requires an auth token for the stable image. Set LOCALSTACK_AUTH_TOKEN in the environment used by the CloudSprocket daemon (or system environment), then Stop and Plan again. Alternatively start LocalStack from Local Runtime with a token, or use a cloud AWS profile. See https://docs.localstack.cloud/aws/getting-started/auth-token/"
}

// dockerComposeLocalStackYAML is the managed compose stack. Keep it in sync
// with the in-app LocalStack manager defaults (stable image, gateway port,
// docker.sock for Lambda, optional auth token).
const dockerComposeLocalStackYAML = `services:
  localstack:
    image: localstack/localstack:stable
    ports:
      - "127.0.0.1:4566:4566"
      - "127.0.0.1:4510-4559:4510-4559"
    environment:
      - SERVICES=apigateway,apigatewayv2,cloudformation,dynamodb,ec2,ecr,ecs,elbv2,events,iam,kinesis,kms,lambda,logs,rds,route53,s3,secretsmanager,sns,sqs,ssm,stepfunctions,sts
      - DEBUG=0
      - PERSISTENCE=0
      - LOCALSTACK_AUTH_TOKEN=${LOCALSTACK_AUTH_TOKEN:-}
    volumes:
      - localstack-data:/var/lib/localstack
      - /var/run/docker.sock:/var/run/docker.sock

volumes:
  localstack-data:
`
