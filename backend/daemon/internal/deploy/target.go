// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package deploy

import (
	"context"
	"fmt"
	"strings"

	"cloudsprocket/backend/daemon/internal/config"
)

// Target is one deployable destination: a local emulator or a real cloud profile.
// Implementations own everything provider/runtime specific so the Engine stays generic.
type Target interface {
	ID() string
	// Label names the target for log lines (e.g. "LocalStack", "AWS profile prod").
	Label(deployment *Deployment) string
	Env(deployment *Deployment, settings config.Settings) []string
	Preflight(ctx context.Context, deployment *Deployment, settings config.Settings, opts TargetOptions) error
	// WriteOverrides drops any provider override files into the workspace dir
	// (e.g. the LocalStack endpoints block). No-op for cloud targets.
	WriteOverrides(dir string, deployment *Deployment, opts TargetOptions) error
}

// TargetOptions carries per-run overrides (mainly for tests).
type TargetOptions struct {
	LocalStackEndpoint string
	FlociAzEndpoint    string
}

// DefaultLocalStackEndpoint is the gateway URL used when none is configured.
const DefaultLocalStackEndpoint = "http://localhost:4566"

type targetFactory func(settings config.Settings, opts TargetOptions) Target

// Registry resolves (provider, local, runtimeID) to a Target. Registration is
// data, not a switch in the engine: new runtimes add a factory and one register call.
type Registry struct {
	settings config.Settings
	opts     TargetOptions
	// keyed by runtime id (e.g. "docker-compose") for additive test/custom targets.
	byRuntimeID map[string]Target
	factories   map[string]targetFactory
}

// NewRegistry builds a registry with the built-in AWS local/cloud targets registered.
func NewRegistry(settings config.Settings, opts TargetOptions) *Registry {
	if strings.TrimSpace(opts.LocalStackEndpoint) == "" {
		opts.LocalStackEndpoint = DefaultLocalStackEndpoint
	}
	r := &Registry{
		settings:    settings,
		opts:        opts,
		byRuntimeID: map[string]Target{},
		factories:   map[string]targetFactory{},
	}
	r.RegisterFactory("localstack", func(settings config.Settings, opts TargetOptions) Target {
		return &localStackTarget{endpoint: opts.LocalStackEndpoint}
	})
	r.RegisterFactory("aws-cloud", func(settings config.Settings, opts TargetOptions) Target {
		return &awsCloudTarget{}
	})
	r.RegisterFactory("azure-cloud", func(settings config.Settings, opts TargetOptions) Target {
		return &azureCloudTarget{}
	})
	r.RegisterFactory("docker-compose", func(settings config.Settings, opts TargetOptions) Target {
		return newDockerComposeTarget(settings, opts)
	})
	r.RegisterFactory("magento-compose", func(settings config.Settings, opts TargetOptions) Target {
		return newMagentoComposeTarget(settings, opts)
	})
	r.RegisterFactory("floci-az", func(settings config.Settings, opts TargetOptions) Target {
		return newFlociAzTarget(opts)
	})
	return r
}

// RegisterFactory adds a runtime factory. Used by built-in targets and tests.
func (r *Registry) RegisterFactory(runtimeID string, factory targetFactory) {
	r.factories[runtimeID] = factory
}

// Register adds a concrete target for a runtime id (e.g. a test stub).
func (r *Registry) Register(runtimeID string, target Target) {
	r.byRuntimeID[runtimeID] = target
}

// SetOptions updates probe endpoints (tests).
func (r *Registry) SetOptions(opts TargetOptions) {
	if strings.TrimSpace(opts.LocalStackEndpoint) != "" {
		r.opts.LocalStackEndpoint = opts.LocalStackEndpoint
	}
	if strings.TrimSpace(opts.FlociAzEndpoint) != "" {
		r.opts.FlociAzEndpoint = opts.FlociAzEndpoint
	}
}

// Resolve picks the target for a deployment.
func (r *Registry) Resolve(deployment *Deployment) (Target, error) {
	runtimeID := resolveRuntimeID(deployment)
	if custom, ok := r.byRuntimeID[runtimeID]; ok {
		return custom, nil
	}
	factory, ok := r.factories[runtimeID]
	if !ok {
		return nil, fmt.Errorf("unsupported deployment runtime %q for provider %q", runtimeID, deployment.ProviderID)
	}
	return factory(r.settings, r.opts), nil
}

func resolveRuntimeID(deployment *Deployment) string {
	if id := strings.TrimSpace(deployment.RuntimeID); id != "" {
		return id
	}
	if deployment.Local {
		if deployment.ProviderID == "azure" {
			return "floci-az"
		}
		return "localstack"
	}
	if deployment.ProviderID == "aws" {
		return "aws-cloud"
	}
	if deployment.ProviderID == "azure" {
		return "azure-cloud"
	}
	return ""
}