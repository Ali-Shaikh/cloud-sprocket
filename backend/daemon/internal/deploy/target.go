// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ali Shaikh

package deploy

import (
	"context"
	"fmt"
	"strings"
	"sync"

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
//
// Mutators are safe for concurrent use with Resolve so a shared Engine used by
// many RPC workers cannot panic on concurrent map writes if a test helper or
// feature registers after construction.
type Registry struct {
	mu       sync.RWMutex
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
	r.mu.Lock()
	defer r.mu.Unlock()
	r.factories[runtimeID] = factory
}

// Register adds a concrete target for a runtime id (e.g. a test stub).
func (r *Registry) Register(runtimeID string, target Target) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.byRuntimeID[runtimeID] = target
}

// SetOptions updates probe endpoints (tests).
func (r *Registry) SetOptions(opts TargetOptions) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if strings.TrimSpace(opts.LocalStackEndpoint) != "" {
		r.opts.LocalStackEndpoint = opts.LocalStackEndpoint
	}
	if strings.TrimSpace(opts.FlociAzEndpoint) != "" {
		r.opts.FlociAzEndpoint = opts.FlociAzEndpoint
	}
}

// Options returns a snapshot of the current target options.
func (r *Registry) Options() TargetOptions {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.opts
}

// ResolveTarget returns the deployment's target, or (nil, nil) when the
// deployment is target-less (a provider with no default runtime and no explicit
// RuntimeID). A non-nil error means a runtime was expected but is unknown, which
// callers must surface rather than silently proceeding without provider wiring.
func (r *Registry) ResolveTarget(deployment *Deployment) (Target, error) {
	if resolveRuntimeID(deployment) == "" {
		return nil, nil
	}
	return r.Resolve(deployment)
}

// Resolve picks the target for a deployment.
func (r *Registry) Resolve(deployment *Deployment) (Target, error) {
	runtimeID := resolveRuntimeID(deployment)
	r.mu.RLock()
	custom, hasCustom := r.byRuntimeID[runtimeID]
	factory, hasFactory := r.factories[runtimeID]
	settings := r.settings
	opts := r.opts
	r.mu.RUnlock()
	if hasCustom {
		return custom, nil
	}
	if !hasFactory {
		return nil, fmt.Errorf("unsupported deployment runtime %q for provider %q", runtimeID, deployment.ProviderID)
	}
	return factory(settings, opts), nil
}

// resolveRuntimeID maps a deployment to its runtime id. An explicit RuntimeID
// always wins; otherwise only the cloud providers (aws, azure) fall back to a
// default emulator/cloud runtime. Any other provider without an explicit runtime
// has no target, so the engine treats it as target-less rather than guessing
// LocalStack (which would silently redirect a non-AWS deployment).
func resolveRuntimeID(deployment *Deployment) string {
	if id := strings.TrimSpace(deployment.RuntimeID); id != "" {
		return id
	}
	switch deployment.ProviderID {
	case "aws":
		if deployment.Local {
			return "localstack"
		}
		return "aws-cloud"
	case "azure":
		if deployment.Local {
			return "floci-az"
		}
		return "azure-cloud"
	}
	return ""
}