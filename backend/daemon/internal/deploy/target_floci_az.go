// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package deploy

import (
	"context"
	"os"
	"path/filepath"
	"strings"

	"cloudsprocket/backend/daemon/internal/config"
	"cloudsprocket/backend/daemon/internal/flociazcompat"
)

const flociAzOverrideFile = "cloudsprocket_floci_az_override.tf"

type flociAzTarget struct {
	endpoint string
}

func newFlociAzTarget(opts TargetOptions) *flociAzTarget {
	endpoint := strings.TrimSpace(opts.FlociAzEndpoint)
	if endpoint == "" {
		endpoint = flociazcompat.DefaultEndpoint
	}
	return &flociAzTarget{endpoint: endpoint}
}

func (t *flociAzTarget) ID() string { return "floci-az" }

func (t *flociAzTarget) Label(_ *Deployment) string { return "floci-az" }

func (t *flociAzTarget) Env(_ *Deployment, settings config.Settings) []string {
	runtime := t.cachedRuntime(settings)
	return flociazcompat.TofuEnvironment(runtime, readFlociAzExtraEnv(settings))
}

func (t *flociAzTarget) Preflight(ctx context.Context, _ *Deployment, settings config.Settings, opts TargetOptions) error {
	_, err := t.prepareRuntime(ctx, settings, opts)
	return err
}

func (t *flociAzTarget) WriteOverrides(dir string, _ *Deployment, opts TargetOptions) error {
	endpoint := t.resolveEndpoint(opts)
	content := flociazcompat.ProviderOverrideHCL(flociazcompat.MetadataHost(endpoint))
	return os.WriteFile(filepath.Join(dir, flociAzOverrideFile), []byte(content), 0o644)
}

func (t *flociAzTarget) prepareRuntime(ctx context.Context, settings config.Settings, opts TargetOptions) (flociazcompat.PreparedRuntime, error) {
	return flociazcompat.PrepareOpenTofuRuntime(ctx, t.resolveEndpoint(opts), settings.LocalConfigDir)
}

func (t *flociAzTarget) cachedRuntime(settings config.Settings) flociazcompat.PreparedRuntime {
	endpoint := t.endpoint
	if strings.TrimSpace(endpoint) == "" {
		endpoint = flociazcompat.DefaultEndpoint
	}
	certPath := flociazcompat.TrustCertPath(settings.LocalConfigDir)
	return flociazcompat.PreparedRuntime{
		Endpoint:      endpoint,
		MetadataHost:  flociazcompat.MetadataHost(endpoint),
		TrustCertPath: certPath,
	}
}

func (t *flociAzTarget) resolveEndpoint(opts TargetOptions) string {
	endpoint := strings.TrimSpace(t.endpoint)
	if endpoint == "" {
		endpoint = strings.TrimSpace(opts.FlociAzEndpoint)
	}
	if endpoint == "" {
		endpoint = flociazcompat.DefaultEndpoint
	}
	return endpoint
}

func readFlociAzExtraEnv(settings config.Settings) map[string]string {
	path := flociAzEnvPath(settings)
	if path == "" {
		return nil
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return nil
	}
	extra := map[string]string{}
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, value, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		key = strings.TrimSpace(key)
		if key == "" {
			continue
		}
		extra[key] = value
	}
	return extra
}

func flociAzEnvPath(settings config.Settings) string {
	if dir := strings.TrimSpace(settings.LocalConfigDir); dir != "" {
		return filepath.Join(dir, "azure", "floci-az.env")
	}
	return ""
}

func isLocalFlociProfileID(profileID string) bool {
	return strings.TrimSpace(profileID) == flociazcompat.LocalProfileID
}